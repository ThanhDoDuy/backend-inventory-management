import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { APP } from '../../shared/constants/app.constants';
import { CUSTOMER_IMPORT_COLUMN_FORMATS } from '../../shared/constants/import-template-formats';
import {
  CustomerType,
  InvoiceStatus,
  PartyStatus,
} from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import { buildCsv } from '../../shared/utils/csv.util';
import { buildExcelBuffer } from '../../shared/utils/excel.util';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';

export interface CustomerHistory {
  count: number;
  total_spent: number;
  last_purchase_at: Date | null;
}

const EMPTY_CUSTOMER_HISTORY: CustomerHistory = {
  count: 0,
  total_spent: 0,
  last_purchase_at: null,
};

const TAX_CODE_REGEX = /^\d{10}(\d{3})?$/;

@Injectable()
export class CustomersService {
  private static readonly CUSTOMER_CSV_HEADERS = [
    'customer_type',
    'name',
    'phone',
    'email',
    'address',
    'tax_code',
    'contact_person',
    'status',
  ] as const;

  constructor(
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
    @InjectModel(Invoice.name)
    private invoiceModel: Model<InvoiceDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<CustomerDocument | null> {
    return this.customerModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
  }

  async list(
    tenantId: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: PartyStatus,
    customerType?: CustomerType,
  ) {
    this.logger.step('CustomersService.list', {
      tenantId,
      page,
      limit,
      search,
      status,
      customerType,
    });

    const filter = this.buildListFilter(tenantId, search, status, customerType);

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }),
      this.customerModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerDocument> {
    this.logger.step('CustomersService.create', {
      tenantId,
      name: dto.name,
      customer_type: dto.customer_type,
    });

    this.validateCustomerPayload(dto.customer_type, {
      tax_code: dto.tax_code,
    });

    if (dto.email) {
      await this.assertEmailAvailable(tenantId, dto.email);
    }

    if (dto.customer_type === CustomerType.COMPANY && dto.tax_code) {
      await this.assertTaxCodeAvailable(tenantId, dto.tax_code);
    }

    return this.customerModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      customer_type: dto.customer_type,
      name: dto.name,
      phone: dto.phone,
      email: dto.email?.toLowerCase(),
      address: dto.address,
      tax_code:
        dto.customer_type === CustomerType.COMPANY
          ? dto.tax_code?.trim()
          : undefined,
      contact_person: dto.contact_person?.trim() || undefined,
      status: PartyStatus.ACTIVE,
      created_by: new Types.ObjectId(userId),
      modified_by: new Types.ObjectId(userId),
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerDocument> {
    this.logger.step('CustomersService.update', { tenantId, id, ...dto });

    const customer = await this.findByIdInTenant(tenantId, id);
    if (!customer) {
      throw new AppError(ERRORS.CUSTOMER.NOT_FOUND);
    }

    const nextType = dto.customer_type ?? customer.customer_type;
    const nextTaxCode =
      dto.tax_code !== undefined ? dto.tax_code : customer.tax_code;

    this.validateCustomerPayload(nextType, { tax_code: nextTaxCode });

    if (dto.email !== undefined) {
      if (dto.email) {
        await this.assertEmailAvailable(tenantId, dto.email, id);
        customer.email = dto.email.toLowerCase();
      } else {
        customer.email = undefined;
      }
    }

    if (dto.customer_type !== undefined) {
      customer.customer_type = dto.customer_type;
    }
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.phone !== undefined) customer.phone = dto.phone;
    if (dto.address !== undefined) customer.address = dto.address;
    if (dto.contact_person !== undefined) {
      customer.contact_person = dto.contact_person?.trim() || undefined;
    }

    if (nextType === CustomerType.COMPANY) {
      const taxCode = nextTaxCode?.trim();
      if (taxCode && taxCode !== customer.tax_code) {
        await this.assertTaxCodeAvailable(tenantId, taxCode, id);
      }
      customer.tax_code = taxCode;
    } else {
      customer.tax_code = undefined;
    }

    customer.modified_by = new Types.ObjectId(userId);
    await customer.save();
    return customer;
  }

  async disable(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<CustomerDocument> {
    this.logger.step('CustomersService.disable', { tenantId, id });

    const customer = await this.findByIdInTenant(tenantId, id);
    if (!customer) {
      throw new AppError(ERRORS.CUSTOMER.NOT_FOUND);
    }
    if (customer.status === PartyStatus.DISABLED) {
      throw new AppError(ERRORS.CUSTOMER.ALREADY_DISABLED);
    }

    customer.status = PartyStatus.DISABLED;
    customer.modified_by = new Types.ObjectId(userId);
    await customer.save();
    return customer;
  }

  async activate(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<CustomerDocument> {
    this.logger.step('CustomersService.activate', { tenantId, id });

    const customer = await this.findByIdInTenant(tenantId, id);
    if (!customer) {
      throw new AppError(ERRORS.CUSTOMER.NOT_FOUND);
    }
    if (customer.status === PartyStatus.ACTIVE) {
      return customer;
    }

    customer.status = PartyStatus.ACTIVE;
    customer.modified_by = new Types.ObjectId(userId);
    await customer.save();
    return customer;
  }

  async softDelete(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    this.logger.step('CustomersService.softDelete', { tenantId, id });

    const customer = await this.findByIdInTenant(tenantId, id);
    if (!customer) {
      throw new AppError(ERRORS.CUSTOMER.NOT_FOUND);
    }

    const hasInvoices = await this.hasInvoices(tenantId, id);
    if (hasInvoices) {
      throw new AppError(ERRORS.CUSTOMER.HAS_INVOICES);
    }

    customer.is_deleted = true;
    customer.deleted_at = new Date();
    customer.modified_by = new Types.ObjectId(userId);
    await customer.save();
  }

  async getHistory(tenantId: string, id: string): Promise<CustomerHistory> {
    this.logger.step('CustomersService.getHistory', { tenantId, id });

    const customer = await this.findByIdInTenant(tenantId, id);
    if (!customer) {
      throw new AppError(ERRORS.CUSTOMER.NOT_FOUND);
    }

    return this.aggregateInvoiceHistory(tenantId, id);
  }

  async updateLastPurchaseAt(
    tenantId: string,
    customerId: string,
    purchasedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    await this.customerModel.updateOne(
      {
        _id: new Types.ObjectId(customerId),
        tenant_id: new Types.ObjectId(tenantId),
        is_deleted: false,
      },
      {
        $set: {
          last_purchase_at: purchasedAt,
        },
      },
      session ? { session } : undefined,
    );
  }

  async exportCsv(
    tenantId: string,
    search?: string,
    status?: PartyStatus,
    customerType?: CustomerType,
  ): Promise<string> {
    const customers = await this.findCustomersForExport(
      tenantId,
      search,
      status,
      customerType,
    );
    const rows = customers.map((customer) => [
      customer.customer_type,
      customer.name,
      customer.phone,
      customer.email ?? '',
      customer.address ?? '',
      customer.tax_code ?? '',
      customer.contact_person ?? '',
      customer.status,
    ]);

    return buildCsv([...CustomersService.CUSTOMER_CSV_HEADERS], rows);
  }

  async getImportTemplateExcel(): Promise<Buffer> {
    return buildExcelBuffer(
      [...CustomersService.CUSTOMER_CSV_HEADERS],
      [
        [
          CustomerType.INDIVIDUAL,
          'Nguyễn Văn A',
          '0901234567',
          'nguyenvana@gmail.com',
          '123 Lê Lợi, Q1, TP.HCM',
          '',
          '',
          PartyStatus.ACTIVE,
        ],
        [
          CustomerType.COMPANY,
          'Công ty TNHH ABC',
          '0281234567',
          'contact@abc.vn',
          '456 Nguyễn Huệ, Q1, TP.HCM',
          '0123456789',
          'Trần Thị B',
          PartyStatus.ACTIVE,
        ],
        [
          CustomerType.GROUP,
          'Gia đình Nguyễn',
          '0912345678',
          '',
          '789 Pasteur, Q3, TP.HCM',
          '',
          'Nguyễn Văn C',
          PartyStatus.ACTIVE,
        ],
      ],
      { columnFormats: CUSTOMER_IMPORT_COLUMN_FORMATS },
    );
  }

  validateCustomerPayload(
    type: CustomerType,
    payload: { tax_code?: string | null },
  ): void {
    const taxCode = payload.tax_code?.trim();

    if (type === CustomerType.COMPANY) {
      if (!taxCode) {
        throw new AppError(ERRORS.CUSTOMER.TAX_CODE_REQUIRED);
      }
      if (!TAX_CODE_REGEX.test(taxCode)) {
        throw new AppError(ERRORS.CUSTOMER.INVALID_TAX_CODE);
      }
      return;
    }

    if (taxCode) {
      throw new AppError(ERRORS.CUSTOMER.TAX_CODE_NOT_ALLOWED);
    }
  }

  toResponse(customer: CustomerDocument) {
    return {
      id: customer._id,
      tenant_id: customer.tenant_id,
      customer_type: customer.customer_type,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      tax_code: customer.tax_code,
      contact_person: customer.contact_person,
      status: customer.status,
      last_purchase_at: customer.last_purchase_at,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    };
  }

  private buildListFilter(
    tenantId: string,
    search?: string,
    status?: PartyStatus,
    customerType?: CustomerType,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (status) {
      filter.status = status;
    }

    if (customerType) {
      filter.customer_type = customerType;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { tax_code: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } },
      ];
    }

    return filter;
  }

  private async findCustomersForExport(
    tenantId: string,
    search?: string,
    status?: PartyStatus,
    customerType?: CustomerType,
  ): Promise<CustomerDocument[]> {
    const filter = this.buildListFilter(
      tenantId,
      search,
      status,
      customerType,
    );

    return this.customerModel
      .find(filter)
      .sort({ name: 1 })
      .limit(APP.csv.exportMaxRows);
  }

  private async assertEmailAvailable(
    tenantId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      email: email.toLowerCase(),
      is_deleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existing = await this.customerModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.CUSTOMER.EMAIL_IN_USE);
    }
  }

  private async assertTaxCodeAvailable(
    tenantId: string,
    taxCode: string,
    excludeId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      tax_code: taxCode.trim(),
      is_deleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const existing = await this.customerModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.CUSTOMER.TAX_CODE_IN_USE);
    }
  }

  private async hasInvoices(
    tenantId: string,
    customerId: string,
  ): Promise<boolean> {
    const count = await this.invoiceModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      customer_id: new Types.ObjectId(customerId),
      is_deleted: false,
    });
    return count > 0;
  }

  private async aggregateInvoiceHistory(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerHistory> {
    const [result] = await this.invoiceModel.aggregate([
      {
        $match: {
          tenant_id: new Types.ObjectId(tenantId),
          customer_id: new Types.ObjectId(customerId),
          is_deleted: false,
          status: InvoiceStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total_spent: { $sum: '$total' },
          last_purchase_at: { $max: '$created_at' },
        },
      },
    ]);

    if (!result) {
      return EMPTY_CUSTOMER_HISTORY;
    }

    return {
      count: result.count ?? 0,
      total_spent: result.total_spent ?? 0,
      last_purchase_at: result.last_purchase_at ?? null,
    };
  }
}
