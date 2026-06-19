import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import {
  CustomerType,
  PartyStatus,
} from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import {
  type ImportFileMeta,
  parseImportFileToRows,
  resolveImportFileType,
} from '../../shared/utils/import-file.util';
import { normalizePhone } from '../../shared/utils/phone.util';
import {
  APP,
  type CustomerImportMode,
} from '../../shared/constants/app.constants';
import { CustomerImportConfirmDto } from './dto/customer-import.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CustomersService } from './customers.service';

interface CustomerImportRowData {
  customer_type: CustomerType;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tax_code?: string;
  contact_person?: string;
  status: PartyStatus;
}

interface StoredCustomerImportRow {
  line: number;
  status: 'OK' | 'ERROR';
  customer_type: string;
  phone: string;
  name: string;
  tax_code?: string;
  action?: 'CREATE' | 'UPDATE';
  errors: string[];
  data?: CustomerImportRowData;
  existingCustomerId?: string;
}

interface StoredCustomerImportPreview {
  tenantId: string;
  userId: string;
  mode: CustomerImportMode;
  rows: StoredCustomerImportRow[];
}

interface ExistingCustomerMaps {
  individualPhoneMap: Map<string, CustomerDocument>;
  companyTaxMap: Map<string, CustomerDocument>;
  groupKeyMap: Map<string, CustomerDocument>;
  emailMap: Map<string, CustomerDocument>;
}

const TAX_CODE_REGEX = /^\d{10}(\d{3})?$/;
const CUSTOMER_TYPES = new Set<string>(Object.values(CustomerType));

@Injectable()
export class CustomersImportService {
  constructor(
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private readonly customersService: CustomersService,
    private readonly redisService: RedisService,
  ) {}

  async previewImport(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    mode: CustomerImportMode = 'upsert',
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

    const expectedHeaders = [...APP.import.customer.headers];
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

    const maps = await this.loadExistingCustomerMaps(tenantId);
    const keyInFile = new Map<string, number>();
    const emailInFile = new Map<string, number>();
    const rows: StoredCustomerImportRow[] = [];

    for (let index = 0; index < dataRows.length; index++) {
      const line = index + 2;
      const cells = dataRows[index];
      const rowMap = this.mapRowToRecord(headerRow, cells);
      rows.push(
        this.validateRow(line, rowMap, mode, maps, keyInFile, emailInFile),
      );
    }

    const previewToken = randomUUID();
    await this.redisService.set(
      this.previewKey(tenantId, previewToken),
      JSON.stringify({
        tenantId,
        userId,
        mode,
        rows,
      } satisfies StoredCustomerImportPreview),
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
        customer_type: row.customer_type,
        phone: row.phone,
        name: row.name,
        tax_code: row.tax_code,
        action: row.action,
        status: row.status,
        errors: row.errors,
      })),
    };
  }

  async confirmImport(
    tenantId: string,
    userId: string,
    dto: CustomerImportConfirmDto,
  ) {
    const raw = await this.redisService.get(
      this.previewKey(tenantId, dto.previewToken),
    );
    if (!raw) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    const preview = JSON.parse(raw) as StoredCustomerImportPreview;
    if (preview.tenantId !== tenantId) {
      throw new AppError(ERRORS.IMPORT.PREVIEW_EXPIRED);
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const failures: Array<{
      line: number;
      phone: string;
      message: string;
    }> = [];

    for (const row of preview.rows) {
      if (row.status !== 'OK' || !row.data) {
        continue;
      }

      try {
        const payload = {
          customer_type: row.data.customer_type,
          name: row.data.name,
          phone: row.data.phone,
          email: row.data.email,
          address: row.data.address,
          tax_code: row.data.tax_code,
          contact_person: row.data.contact_person,
        };

        if (row.action === 'UPDATE' && row.existingCustomerId) {
          await this.customersService.update(
            tenantId,
            userId,
            row.existingCustomerId,
            payload,
          );
          if (row.data.status === PartyStatus.DISABLED) {
            await this.customersService.disable(
              tenantId,
              userId,
              row.existingCustomerId,
            );
          } else {
            await this.customersService.activate(
              tenantId,
              userId,
              row.existingCustomerId,
            );
          }
          updated++;
        } else {
          const createdCustomer = await this.customersService.create(
            tenantId,
            userId,
            payload,
          );
          if (row.data.status === PartyStatus.DISABLED) {
            await this.customersService.disable(
              tenantId,
              userId,
              createdCustomer._id.toString(),
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

  private async loadExistingCustomerMaps(
    tenantId: string,
  ): Promise<ExistingCustomerMaps> {
    const existingCustomers = await this.customerModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });

    const individualPhoneMap = new Map<string, CustomerDocument>();
    const companyTaxMap = new Map<string, CustomerDocument>();
    const groupKeyMap = new Map<string, CustomerDocument>();
    const emailMap = new Map<string, CustomerDocument>();

    for (const customer of existingCustomers) {
      const upsertKey = this.buildUpsertKey(
        customer.customer_type,
        customer.phone,
        customer.name,
        customer.tax_code,
      );
      if (upsertKey) {
        if (customer.customer_type === CustomerType.INDIVIDUAL) {
          individualPhoneMap.set(upsertKey, customer);
        } else if (customer.customer_type === CustomerType.COMPANY) {
          companyTaxMap.set(upsertKey, customer);
        } else {
          groupKeyMap.set(upsertKey, customer);
        }
      }

      if (customer.email) {
        emailMap.set(customer.email.toLowerCase(), customer);
      }
    }

    return { individualPhoneMap, companyTaxMap, groupKeyMap, emailMap };
  }

  private validateRow(
    line: number,
    row: Record<string, string>,
    mode: CustomerImportMode,
    maps: ExistingCustomerMaps,
    keyInFile: Map<string, number>,
    emailInFile: Map<string, number>,
  ): StoredCustomerImportRow {
    const errors: string[] = [];
    const customerTypeRaw = row.customer_type?.trim().toUpperCase() ?? '';
    const name = row.name?.trim() ?? '';
    const phone = row.phone?.trim() ?? '';
    const email = row.email?.trim().toLowerCase() ?? '';
    const taxCode = row.tax_code?.trim() ?? '';
    const normalizedPhone = normalizePhone(phone);

    if (!CUSTOMER_TYPES.has(customerTypeRaw)) {
      errors.push('customer_type must be INDIVIDUAL, COMPANY, or GROUP');
    }

    const customerType = customerTypeRaw as CustomerType;

    if (!name) {
      errors.push('name is required');
    }
    if (!phone || !normalizedPhone) {
      errors.push('phone is required');
    }

    if (customerTypeRaw === CustomerType.COMPANY) {
      if (!taxCode) {
        errors.push('tax_code is required for COMPANY');
      } else if (!TAX_CODE_REGEX.test(taxCode)) {
        errors.push('tax_code must be 10 or 13 digits');
      }
    } else if (customerTypeRaw && taxCode) {
      errors.push('tax_code is only allowed for COMPANY');
    }

    const upsertKey =
      customerTypeRaw && normalizedPhone
        ? this.buildUpsertKey(customerType, phone, name, taxCode)
        : '';

    if (upsertKey) {
      const fileKey = `${customerTypeRaw}:${upsertKey}`;
      if (keyInFile.has(fileKey)) {
        errors.push(
          `duplicate record in file (line ${keyInFile.get(fileKey)})`,
        );
      } else {
        keyInFile.set(fileKey, line);
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
    let existingCustomerId: string | undefined;
    const existing = upsertKey
      ? this.findExistingCustomer(maps, customerType, upsertKey)
      : undefined;

    if (existing) {
      if (mode === 'create_only') {
        errors.push('customer already exists');
      } else {
        action = 'UPDATE';
        existingCustomerId = existing._id.toString();
      }
    }

    if (email && errors.length === 0) {
      const emailOwner = maps.emailMap.get(email);
      if (emailOwner && emailOwner._id.toString() !== existingCustomerId) {
        errors.push('email already in use');
      }
    }

    if (errors.length > 0) {
      return {
        line,
        status: 'ERROR',
        customer_type: customerTypeRaw,
        phone,
        name,
        tax_code: taxCode || undefined,
        errors,
      };
    }

    return {
      line,
      status: 'OK',
      customer_type: customerTypeRaw,
      phone,
      name,
      tax_code: taxCode || undefined,
      action,
      errors: [],
      existingCustomerId,
      data: {
        customer_type: customerType,
        name,
        phone,
        email: email || undefined,
        address: row.address?.trim() || undefined,
        tax_code:
          customerType === CustomerType.COMPANY ? taxCode : undefined,
        contact_person: row.contact_person?.trim() || undefined,
        status,
      },
    };
  }

  private buildUpsertKey(
    customerType: CustomerType | string,
    phone: string,
    name: string,
    taxCode?: string,
  ): string {
    if (customerType === CustomerType.COMPANY) {
      return taxCode?.trim() ?? '';
    }
    if (customerType === CustomerType.GROUP) {
      const normalizedPhone = normalizePhone(phone);
      return normalizedPhone
        ? `${normalizedPhone}|${name.trim().toLowerCase()}`
        : '';
    }
    return normalizePhone(phone);
  }

  private findExistingCustomer(
    maps: ExistingCustomerMaps,
    customerType: CustomerType,
    upsertKey: string,
  ): CustomerDocument | undefined {
    if (customerType === CustomerType.INDIVIDUAL) {
      return maps.individualPhoneMap.get(upsertKey);
    }
    if (customerType === CustomerType.COMPANY) {
      return maps.companyTaxMap.get(upsertKey);
    }
    return maps.groupKeyMap.get(upsertKey);
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
    return this.redisService.tenantKey(tenantId, 'customer-import', token);
  }
}
