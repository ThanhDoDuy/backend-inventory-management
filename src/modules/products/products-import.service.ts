import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ProductStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import {
  type ImportFileMeta,
  parseImportFileToRows,
  resolveImportFileType,
} from '../../shared/utils/import-file.util';
import { CategoriesService } from './categories.service';
import {
  APP,
  type ProductImportMode,
} from '../../shared/constants/app.constants';
import { ImportConfirmDto } from './dto/product-import.dto';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductsService } from './products.service';

export type CategoryImportAction = 'NONE' | 'EXISTING' | 'WILL_CREATE';

interface ProductImportRowData {
  sku: string;
  name: string;
  barcode?: string;
  categoryName?: string;
  cost_price: number;
  prices: Record<string, number>;
  minimum_stock: number;
  status: ProductStatus;
  image_url?: string;
}

interface StoredImportRow {
  line: number;
  status: 'OK' | 'ERROR';
  sku: string;
  name: string;
  action?: 'CREATE' | 'UPDATE';
  categoryAction?: CategoryImportAction;
  categoryName?: string;
  errors: string[];
  data?: ProductImportRowData;
  existingProductId?: string;
}

interface StoredProductImportPreview {
  tenantId: string;
  userId: string;
  mode: ProductImportMode;
  rows: StoredImportRow[];
}

@Injectable()
export class ProductsImportService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly priceTiersService: PriceTiersService,
    private readonly redisService: RedisService,
  ) {}

  async previewImport(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    mode: ProductImportMode = 'upsert',
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

    const tiers = await this.priceTiersService.list(tenantId, true);
    const expectedHeaders = this.getExpectedHeaders(tiers);
    const headerRow = parsed[0].map((cell) => cell.trim().toLowerCase());

    if (!this.headersMatch(headerRow, expectedHeaders)) {
      throw new AppError(ERRORS.IMPORT.INVALID_FORMAT, {
        details: { expected: expectedHeaders, received: headerRow },
      });
    }

    const dataRows = parsed.slice(1);
    if (dataRows.length > APP.import.maxRows) {
      throw new AppError(ERRORS.IMPORT.ROW_LIMIT_EXCEEDED, {
        details: { max: APP.import.maxRows, received: dataRows.length },
      });
    }

    const skuInFile = new Map<string, number>();
    const rows: StoredImportRow[] = [];

    for (let index = 0; index < dataRows.length; index++) {
      const line = index + 2;
      const cells = dataRows[index];
      const rowMap = this.mapRowToRecord(headerRow, cells);
      const result = await this.validateRow(
        tenantId,
        line,
        rowMap,
        tiers,
        mode,
        skuInFile,
      );
      rows.push(result);
    }

    const previewToken = randomUUID();
    const payload: StoredProductImportPreview = {
      tenantId,
      userId,
      mode,
      rows,
    };

    await this.redisService.set(
      this.previewKey(tenantId, previewToken),
      JSON.stringify(payload),
      APP.import.previewTtlSeconds,
    );

    const valid = rows.filter((row) => row.status === 'OK').length;
    const errors = rows.filter((row) => row.status === 'ERROR').length;
    const categoriesToCreate = new Set(
      rows
        .filter((row) => row.categoryAction === 'WILL_CREATE' && row.categoryName)
        .map((row) => row.categoryName as string),
    ).size;

    return {
      previewToken,
      expiresInSeconds: APP.import.previewTtlSeconds,
      summary: {
        total: rows.length,
        valid,
        errors,
        categoriesToCreate,
      },
      rows: rows.map((row) => ({
        line: row.line,
        sku: row.sku,
        name: row.name,
        action: row.action,
        status: row.status,
        categoryName: row.categoryName,
        categoryAction: row.categoryAction,
        errors: row.errors,
      })),
    };
  }

  async confirmImport(tenantId: string, userId: string, dto: ImportConfirmDto) {
    const raw = await this.redisService.get(
      this.previewKey(tenantId, dto.previewToken),
    );
    if (!raw) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    const preview = JSON.parse(raw) as StoredProductImportPreview;
    if (preview.tenantId !== tenantId) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const failures: Array<{ line: number; sku: string; message: string }> = [];

    for (const row of preview.rows) {
      if (row.status !== 'OK' || !row.data) {
        continue;
      }

      try {
        let categoryId: string | undefined;
        if (row.data.categoryName) {
          const category = await this.categoriesService.findOrCreateForImport(
            tenantId,
            row.data.categoryName,
            APP.import.product.categoryDescription,
          );
          categoryId = category._id.toString();
        }

        const payload = {
          sku: row.data.sku,
          name: row.data.name,
          barcode: row.data.barcode,
          category_id: categoryId,
          cost_price: row.data.cost_price,
          selling_price: row.data.prices.RETAIL,
          prices: row.data.prices,
          minimum_stock: row.data.minimum_stock,
          image_url: row.data.image_url,
        };

        if (row.action === 'UPDATE' && row.existingProductId) {
          await this.productsService.update(
            tenantId,
            row.existingProductId,
            payload,
          );
          if (row.data.status === ProductStatus.DISABLED) {
            await this.productsService.deactivate(
              tenantId,
              row.existingProductId,
            );
          } else if (row.data.status === ProductStatus.ACTIVE) {
            await this.productsService.activate(
              tenantId,
              row.existingProductId,
            );
          }
          updated++;
        } else {
          const createdProduct = await this.productsService.create(
            tenantId,
            payload,
          );
          if (row.data.status === ProductStatus.DISABLED) {
            await this.productsService.deactivate(
              tenantId,
              createdProduct._id.toString(),
            );
          }
          created++;
        }
      } catch (error) {
        failed++;
        failures.push({
          line: row.line,
          sku: row.sku,
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
      updated,
      failed,
      skipped: preview.rows.filter((row) => row.status === 'ERROR').length,
      failures,
    };
  }

  private async validateRow(
    tenantId: string,
    line: number,
    row: Record<string, string>,
    tiers: Array<{ code: string }>,
    mode: ProductImportMode,
    skuInFile: Map<string, number>,
  ): Promise<StoredImportRow> {
    const errors: string[] = [];
    const sku = row.sku?.trim() ?? '';
    const name = row.name?.trim() ?? '';
    const categoryName = row.category_name?.trim() ?? '';

    if (!sku) {
      errors.push('sku is required');
    }
    if (!name) {
      errors.push('name is required');
    }

    if (sku) {
      const normalizedSku = sku.toLowerCase();
      if (skuInFile.has(normalizedSku)) {
        errors.push(`duplicate sku in file (line ${skuInFile.get(normalizedSku)})`);
      } else {
        skuInFile.set(normalizedSku, line);
      }
    }

    const costPrice = this.parseNumber(row.cost_price);
    if (costPrice === null || costPrice < 0) {
      errors.push('cost_price must be a number >= 0');
    }

    const prices: Record<string, number> = {};
    for (const tier of tiers) {
      const key = `price_${tier.code.toLowerCase()}`;
      const raw = row[key];
      if (raw === undefined || raw.trim() === '') {
        if (tier.code === 'RETAIL') {
          errors.push(`${key} is required`);
        }
        continue;
      }
      const amount = this.parseNumber(raw);
      if (amount === null || amount < 0) {
        errors.push(`${key} must be a number >= 0`);
      } else {
        prices[tier.code] = amount;
      }
    }

    const minimumStock = row.minimum_stock?.trim()
      ? this.parseNumber(row.minimum_stock)
      : 0;
    if (minimumStock === null || minimumStock < 0) {
      errors.push('minimum_stock must be a number >= 0');
    }

    let status = ProductStatus.ACTIVE;
    if (row.status?.trim()) {
      const normalized = row.status.trim().toUpperCase();
      if (
        normalized !== ProductStatus.ACTIVE &&
        normalized !== ProductStatus.DISABLED
      ) {
        errors.push('status must be ACTIVE or DISABLED');
      } else {
        status = normalized as ProductStatus;
      }
    }

    let categoryAction: CategoryImportAction = 'NONE';
    if (categoryName) {
      const existingCategory = await this.categoriesService.findByNameInTenant(
        tenantId,
        categoryName,
      );
      categoryAction = existingCategory ? 'EXISTING' : 'WILL_CREATE';
    }

    let action: 'CREATE' | 'UPDATE' = 'CREATE';
    let existingProductId: string | undefined;

    if (sku && errors.length === 0) {
      const existing = await this.productModel.findOne({
        tenant_id: new Types.ObjectId(tenantId),
        sku,
        is_deleted: false,
      });

      if (existing) {
        if (mode === 'create_only') {
          errors.push('sku already exists');
        } else {
          action = 'UPDATE';
          existingProductId = existing._id.toString();
        }
      }
    }

    if (errors.length > 0) {
      return {
        line,
        status: 'ERROR',
        sku,
        name,
        errors,
        categoryName: categoryName || undefined,
        categoryAction,
      };
    }

    const retail = prices.RETAIL;
    for (const tier of tiers) {
      if (prices[tier.code] === undefined) {
        prices[tier.code] = retail;
      }
    }

    return {
      line,
      status: 'OK',
      sku,
      name,
      action,
      categoryAction,
      categoryName: categoryName || undefined,
      errors: [],
      existingProductId,
      data: {
        sku,
        name,
        barcode: row.barcode?.trim() || undefined,
        categoryName: categoryName || undefined,
        cost_price: costPrice as number,
        prices,
        minimum_stock: minimumStock ?? 0,
        status,
        image_url: row.image_url?.trim() || undefined,
      },
    };
  }

  private getExpectedHeaders(tiers: Array<{ code: string }>): string[] {
    return [
      'sku',
      'name',
      'barcode',
      'category_name',
      'cost_price',
      ...tiers.map((tier) => `price_${tier.code.toLowerCase()}`),
      'minimum_stock',
      'status',
      'image_url',
    ];
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
    return this.redisService.tenantKey(tenantId, 'product-import', token);
  }
}
