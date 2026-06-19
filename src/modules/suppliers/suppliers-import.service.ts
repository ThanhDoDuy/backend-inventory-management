import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { PartyStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import {
  type ImportFileMeta,
  parseImportFileToRows,
  resolveImportFileType,
} from '../../shared/utils/import-file.util';
import { normalizePhone } from '../../shared/utils/phone.util';
import {
  APP,
  type SupplierImportMode,
} from '../../shared/constants/app.constants';
import { SupplierImportConfirmDto } from './dto/supplier-import.dto';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';
import { SuppliersService } from './suppliers.service';

interface SupplierImportRowData {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tax_code?: string;
  status: PartyStatus;
}

interface StoredSupplierImportRow {
  line: number;
  status: 'OK' | 'ERROR';
  phone: string;
  name: string;
  action?: 'CREATE' | 'UPDATE';
  errors: string[];
  data?: SupplierImportRowData;
  existingSupplierId?: string;
}

interface StoredSupplierImportPreview {
  tenantId: string;
  userId: string;
  mode: SupplierImportMode;
  rows: StoredSupplierImportRow[];
}

@Injectable()
export class SuppliersImportService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    private readonly suppliersService: SuppliersService,
    private readonly redisService: RedisService,
  ) {}

  async previewImport(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    mode: SupplierImportMode = 'upsert',
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

    const expectedHeaders = [...APP.import.supplier.headers];
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

    const existingSuppliers = await this.supplierModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
    const phoneMap = new Map<string, SupplierDocument>();
    const emailMap = new Map<string, SupplierDocument>();
    for (const supplier of existingSuppliers) {
      phoneMap.set(normalizePhone(supplier.phone), supplier);
      if (supplier.email) {
        emailMap.set(supplier.email.toLowerCase(), supplier);
      }
    }

    const phoneInFile = new Map<string, number>();
    const emailInFile = new Map<string, number>();
    const rows: StoredSupplierImportRow[] = [];

    for (let index = 0; index < dataRows.length; index++) {
      const line = index + 2;
      const cells = dataRows[index];
      const rowMap = this.mapRowToRecord(headerRow, cells);
      rows.push(
        this.validateRow(line, rowMap, mode, phoneMap, emailMap, phoneInFile, emailInFile),
      );
    }

    const previewToken = randomUUID();
    await this.redisService.set(
      this.previewKey(tenantId, previewToken),
      JSON.stringify({ tenantId, userId, mode, rows } satisfies StoredSupplierImportPreview),
      APP.import.previewTtlSeconds,
    );

    const valid = rows.filter((row) => row.status === 'OK').length;
    const errors = rows.filter((row) => row.status === 'ERROR').length;

    return {
      previewToken,
      expiresInSeconds: APP.import.previewTtlSeconds,
      summary: { total: rows.length, valid, errors },
      rows: rows.map((row) => ({
        line: row.line,
        phone: row.phone,
        name: row.name,
        action: row.action,
        status: row.status,
        errors: row.errors,
      })),
    };
  }

  async confirmImport(
    tenantId: string,
    userId: string,
    dto: SupplierImportConfirmDto,
  ) {
    const raw = await this.redisService.get(
      this.previewKey(tenantId, dto.previewToken),
    );
    if (!raw) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    const preview = JSON.parse(raw) as StoredSupplierImportPreview;
    if (preview.tenantId !== tenantId) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const failures: Array<{ line: number; phone: string; message: string }> = [];

    for (const row of preview.rows) {
      if (row.status !== 'OK' || !row.data) {
        continue;
      }

      try {
        const payload = {
          name: row.data.name,
          phone: row.data.phone,
          email: row.data.email,
          address: row.data.address,
          tax_code: row.data.tax_code,
        };

        if (row.action === 'UPDATE' && row.existingSupplierId) {
          await this.suppliersService.update(
            tenantId,
            userId,
            row.existingSupplierId,
            payload,
          );
          if (row.data.status === PartyStatus.DISABLED) {
            await this.suppliersService.disable(
              tenantId,
              userId,
              row.existingSupplierId,
            );
          } else {
            await this.suppliersService.activate(
              tenantId,
              userId,
              row.existingSupplierId,
            );
          }
          updated++;
        } else {
          const createdSupplier = await this.suppliersService.create(
            tenantId,
            userId,
            payload,
          );
          if (row.data.status === PartyStatus.DISABLED) {
            await this.suppliersService.disable(
              tenantId,
              userId,
              createdSupplier._id.toString(),
            );
          }
          created++;
        }
      } catch (error) {
        failed++;
        failures.push({
          line: row.line,
          phone: row.phone,
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

  private validateRow(
    line: number,
    row: Record<string, string>,
    mode: SupplierImportMode,
    phoneMap: Map<string, SupplierDocument>,
    emailMap: Map<string, SupplierDocument>,
    phoneInFile: Map<string, number>,
    emailInFile: Map<string, number>,
  ): StoredSupplierImportRow {
    const errors: string[] = [];
    const name = row.name?.trim() ?? '';
    const phone = row.phone?.trim() ?? '';
    const email = row.email?.trim().toLowerCase() ?? '';
    const normalizedPhone = normalizePhone(phone);

    if (!name) {
      errors.push('name is required');
    }
    if (!phone || !normalizedPhone) {
      errors.push('phone is required');
    }

    if (normalizedPhone) {
      if (phoneInFile.has(normalizedPhone)) {
        errors.push(`duplicate phone in file (line ${phoneInFile.get(normalizedPhone)})`);
      } else {
        phoneInFile.set(normalizedPhone, line);
      }
    }

    if (email) {
      if (!email.includes('@')) {
        errors.push('email is invalid');
      } else if (emailInFile.has(email)) {
        errors.push(`duplicate email in file (line ${emailInFile.get(email)})`);
      } else {
        emailInFile.set(email, line);
      }
    }

    let status = PartyStatus.ACTIVE;
    if (row.status?.trim()) {
      const normalized = row.status.trim().toUpperCase();
      if (
        normalized !== PartyStatus.ACTIVE &&
        normalized !== PartyStatus.DISABLED
      ) {
        errors.push('status must be ACTIVE or DISABLED');
      } else {
        status = normalized as PartyStatus;
      }
    }

    let action: 'CREATE' | 'UPDATE' = 'CREATE';
    let existingSupplierId: string | undefined;
    const existing = normalizedPhone ? phoneMap.get(normalizedPhone) : undefined;

    if (existing) {
      if (mode === 'create_only') {
        errors.push('phone already exists');
      } else {
        action = 'UPDATE';
        existingSupplierId = existing._id.toString();
      }
    }

    if (email && errors.length === 0) {
      const emailOwner = emailMap.get(email);
      if (emailOwner && emailOwner._id.toString() !== existingSupplierId) {
        errors.push('email already in use');
      }
    }

    if (errors.length > 0) {
      return { line, status: 'ERROR', phone, name, errors };
    }

    return {
      line,
      status: 'OK',
      phone,
      name,
      action,
      errors: [],
      existingSupplierId,
      data: {
        name,
        phone,
        email: email || undefined,
        address: row.address?.trim() || undefined,
        tax_code: row.tax_code?.trim() || undefined,
        status,
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

  private previewKey(tenantId: string, token: string): string {
    return this.redisService.tenantKey(tenantId, 'supplier-import', token);
  }
}
