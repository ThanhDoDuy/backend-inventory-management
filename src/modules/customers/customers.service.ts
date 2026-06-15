import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { InvoiceStatus, PartyStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
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

@Injectable()
export class CustomersService {
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
  ) {
    this.logger.step('CustomersService.list', {
      tenantId,
      page,
      limit,
      search,
      status,
    });

    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

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
    this.logger.step('CustomersService.create', { tenantId, name: dto.name });

    if (dto.email) {
      await this.assertEmailAvailable(tenantId, dto.email);
    }

    return this.customerModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      name: dto.name,
      phone: dto.phone,
      email: dto.email?.toLowerCase(),
      address: dto.address,
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

    if (dto.email !== undefined) {
      if (dto.email) {
        await this.assertEmailAvailable(tenantId, dto.email, id);
        customer.email = dto.email.toLowerCase();
      } else {
        customer.email = undefined;
      }
    }

    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.phone !== undefined) customer.phone = dto.phone;
    if (dto.address !== undefined) customer.address = dto.address;

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

  toResponse(customer: CustomerDocument) {
    return {
      id: customer._id,
      tenant_id: customer.tenant_id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      status: customer.status,
      last_purchase_at: customer.last_purchase_at,
      created_at: customer.created_at,
      updated_at: customer.updated_at,
    };
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
