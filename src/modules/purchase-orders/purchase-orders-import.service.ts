import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PartyStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import { buildExcelBuffer } from '../../shared/utils/excel.util';
import { PO_IMPORT_COLUMN_FORMATS } from '../../shared/constants/import-template-formats';
import {
  type ImportFileMeta,
  parseImportFileToRows,
  resolveImportFileType,
} from '../../shared/utils/import-file.util';
import { normalizePhone } from '../../shared/utils/phone.util';
import { parseImportDate } from '../../shared/utils/import-date.util';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import {
  PO_IMPORT_HEADERS,
  PO_IMPORT_MAX_ROWS,
  PO_IMPORT_PREVIEW_TTL_SECONDS,
} from './constants/po-import.constants';
import { PoImportConfirmDto } from './dto/po-import.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

interface PoImportRowData {
  poGroup: string;
  supplierId: string;
  productId: string;
  quantity: number;
  costPrice: number;
  expectedDate?: string;
}

interface StoredPoImportRow {
  line: number;
  status: 'OK' | 'ERROR';
  poGroup: string;
  supplierPhone: string;
  productSku: string;
  quantity: number;
  errors: string[];
  data?: PoImportRowData;
}

interface StoredPoImportPreview {
  tenantId: string;
  userId: string;
  rows: StoredPoImportRow[];
}

interface GroupMeta {
  supplierPhone: string;
  expectedDate: string;
}

@Injectable()
export class PurchaseOrdersImportService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly redisService: RedisService,
  ) {}

  getImportTemplateExcel(): Promise<Buffer> {
    return buildExcelBuffer(
      [...PO_IMPORT_HEADERS],
      [
        ['PO-001', '0903123456', 'MP-001', 40, 185000, '2026-06-25'],
        ['PO-001', '0903123456', 'MP-002', 35, 195000, '2026-06-25'],
        ['PO-002', '02838210001', 'MP-006', 25, 320000, '2026-06-28'],
      ],
      { columnFormats: PO_IMPORT_COLUMN_FORMATS },
    );
  }

  async previewImport(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    fileMeta?: ImportFileMeta,
  ) {
    if (!fileBuffer.length) {
      throw new AppError(ERRORS.IMPORT.EMPTY_FILE);
    }

    const fileType = resolveImportFileType(fileBuffer, fileMeta);
    if (!fileType) {
      throw new AppError(ERRORS.IMPORT.INVALID_FILE_TYPE);
    }

    const parsed = await parseImportFileToRows(fileBuffer, fileMeta);
    if (parsed.length < 2) {
      throw new AppError(ERRORS.IMPORT.INVALID_FORMAT);
    }

    const expectedHeaders = [...PO_IMPORT_HEADERS];
    const headerRow = parsed[0].map((cell) => cell.trim().toLowerCase());

    if (!this.headersMatch(headerRow, expectedHeaders)) {
      throw new AppError(ERRORS.IMPORT.INVALID_FORMAT, {
        details: { expected: expectedHeaders, received: headerRow },
      });
    }

    const dataRows = parsed.slice(1);
    if (dataRows.length > PO_IMPORT_MAX_ROWS) {
      throw new AppError(ERRORS.IMPORT.ROW_LIMIT_EXCEEDED, {
        details: { max: PO_IMPORT_MAX_ROWS, received: dataRows.length },
      });
    }

    const suppliers = await this.supplierModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
      status: PartyStatus.ACTIVE,
    });
    const supplierByPhone = new Map<string, SupplierDocument>();
    for (const supplier of suppliers) {
      supplierByPhone.set(normalizePhone(supplier.phone), supplier);
    }

    const products = await this.productModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
    const productBySku = new Map<string, ProductDocument>();
    for (const product of products) {
      productBySku.set(product.sku.toLowerCase(), product);
    }

    const groupMeta = new Map<string, GroupMeta>();
    const skuInGroup = new Map<string, Map<string, number>>();
    const rows: StoredPoImportRow[] = [];

    for (let index = 0; index < dataRows.length; index++) {
      const line = index + 2;
      const cells = dataRows[index];
      const rowMap = this.mapRowToRecord(headerRow, cells);
      rows.push(
        this.validateRow(
          line,
          rowMap,
          supplierByPhone,
          productBySku,
          groupMeta,
          skuInGroup,
        ),
      );
    }

    const previewToken = randomUUID();
    await this.redisService.set(
      this.previewKey(tenantId, previewToken),
      JSON.stringify({ tenantId, userId, rows } satisfies StoredPoImportPreview),
      PO_IMPORT_PREVIEW_TTL_SECONDS,
    );

    const validRows = rows.filter((row) => row.status === 'OK');
    const ordersToCreate = new Set(validRows.map((row) => row.poGroup)).size;

    return {
      previewToken,
      expiresInSeconds: PO_IMPORT_PREVIEW_TTL_SECONDS,
      summary: {
        total: rows.length,
        valid: validRows.length,
        errors: rows.length - validRows.length,
        ordersToCreate,
      },
      rows: rows.map((row) => ({
        line: row.line,
        poGroup: row.poGroup,
        supplierPhone: row.supplierPhone,
        productSku: row.productSku,
        quantity: row.quantity,
        status: row.status,
        errors: row.errors,
      })),
    };
  }

  async confirmImport(tenantId: string, userId: string, dto: PoImportConfirmDto) {
    const raw = await this.redisService.get(
      this.previewKey(tenantId, dto.previewToken),
    );
    if (!raw) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    const preview = JSON.parse(raw) as StoredPoImportPreview;
    if (preview.tenantId !== tenantId) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    const groups = new Map<string, StoredPoImportRow[]>();
    for (const row of preview.rows) {
      if (row.status !== 'OK' || !row.data) {
        continue;
      }
      const list = groups.get(row.poGroup) ?? [];
      list.push(row);
      groups.set(row.poGroup, list);
    }

    let created = 0;
    let failed = 0;
    const failures: Array<{ poGroup: string; message: string }> = [];

    for (const [poGroup, groupRows] of groups) {
      try {
        const first = groupRows[0].data!;
        await this.purchaseOrdersService.create(tenantId, userId, {
          supplierId: first.supplierId,
          expectedDate: first.expectedDate,
          items: groupRows.map((row) => ({
            productId: row.data!.productId,
            quantity: row.data!.quantity,
            costPrice: row.data!.costPrice,
          })),
        });
        created++;
      } catch (error) {
        failed++;
        failures.push({
          poGroup,
          message:
            error instanceof AppError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Import failed',
        });
      }
    }

    await this.redisService.del(this.previewKey(tenantId, dto.previewToken));

    return {
      created,
      failed,
      skipped: preview.rows.filter((row) => row.status === 'ERROR').length,
      failures,
    };
  }

  private validateRow(
    line: number,
    row: Record<string, string>,
    supplierByPhone: Map<string, SupplierDocument>,
    productBySku: Map<string, ProductDocument>,
    groupMeta: Map<string, GroupMeta>,
    skuInGroup: Map<string, Map<string, number>>,
  ): StoredPoImportRow {
    const errors: string[] = [];
    const poGroup = row.po_group?.trim() ?? '';
    const supplierPhone = row.supplier_phone?.trim() ?? '';
    const productSku = row.product_sku?.trim() ?? '';
    const normalizedPhone = normalizePhone(supplierPhone);
    const normalizedSku = productSku.toLowerCase();
    const quantity = this.parseNumber(row.quantity);
    const costPrice = this.parseNumber(row.cost_price);
    const expectedDateRaw = row.expected_date?.trim() ?? '';

    if (!poGroup) {
      errors.push('po_group is required');
    }
    if (!supplierPhone || !normalizedPhone) {
      errors.push('supplier_phone is required');
    }
    if (!productSku) {
      errors.push('product_sku is required');
    }
    const qty = quantity === null ? null : Math.round(quantity);
    if (qty === null || qty < 1) {
      errors.push('quantity must be an integer >= 1');
    } else if (Math.abs(quantity! - qty) > 1e-9) {
      errors.push('quantity must be an integer >= 1');
    }
    if (costPrice === null || costPrice < 0) {
      errors.push('cost_price must be a number >= 0');
    }

    let expectedDate: string | undefined;
    if (expectedDateRaw) {
      const parsedDate = parseImportDate(expectedDateRaw);
      if (parsedDate === undefined) {
        errors.push('expected_date must be YYYY-MM-DD');
      } else if (parsedDate) {
        expectedDate = parsedDate;
      }
    }

    const supplier = normalizedPhone
      ? supplierByPhone.get(normalizedPhone)
      : undefined;
    if (normalizedPhone && !supplier) {
      errors.push('supplier not found or inactive');
    }

    const product = normalizedSku ? productBySku.get(normalizedSku) : undefined;
    if (normalizedSku && !product) {
      errors.push('product sku not found');
    }

    if (poGroup && errors.length === 0) {
      const existingMeta = groupMeta.get(poGroup);
      if (existingMeta) {
        if (existingMeta.supplierPhone !== supplierPhone) {
          errors.push('po_group has inconsistent supplier_phone');
        }
        if (existingMeta.expectedDate !== (expectedDate ?? '')) {
          errors.push('po_group has inconsistent expected_date');
        }
      } else {
        groupMeta.set(poGroup, {
          supplierPhone,
          expectedDate: expectedDate ?? '',
        });
      }

      const groupSkus = skuInGroup.get(poGroup) ?? new Map<string, number>();
      if (normalizedSku && groupSkus.has(normalizedSku)) {
        errors.push(
          `duplicate product_sku in po_group (line ${groupSkus.get(normalizedSku)})`,
        );
      } else if (normalizedSku) {
        groupSkus.set(normalizedSku, line);
        skuInGroup.set(poGroup, groupSkus);
      }
    }

    if (errors.length > 0) {
      return {
        line,
        status: 'ERROR',
        poGroup,
        supplierPhone,
        productSku,
        quantity: quantity ?? 0,
        errors,
      };
    }

    return {
      line,
      status: 'OK',
      poGroup,
      supplierPhone,
      productSku,
      quantity: qty as number,
      errors: [],
      data: {
        poGroup,
        supplierId: supplier!._id.toString(),
        productId: product!._id.toString(),
        quantity: qty as number,
        costPrice: costPrice as number,
        expectedDate,
      },
    };
  }

  private headersMatch(received: string[], expected: string[]): boolean {
    if (received.length !== expected.length) {
      return false;
    }
    return expected.every((header, index) => received[index] === header);
  }

  private mapRowToRecord(
    headers: string[],
    cells: string[],
  ): Record<string, string> {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = cells[i] ?? '';
    }
    return record;
  }

  private parseNumber(value: string | undefined): number | null {
    if (value === undefined || value.trim() === '') {
      return null;
    }
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private previewKey(tenantId: string, token: string): string {
    return this.redisService.tenantKey(tenantId, 'po-import', token);
  }
}
