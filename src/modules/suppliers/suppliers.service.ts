import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { PartyStatus } from '../../shared/constants/business.enums';
import { AppError, ERRORS } from '../../shared/errors';
import { APP } from '../../shared/constants/app.constants';
import { buildCsv } from '../../shared/utils/csv.util';
import { buildExcelBuffer } from '../../shared/utils/excel.util';
import { SUPPLIER_IMPORT_COLUMN_FORMATS } from '../../shared/constants/import-template-formats';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';

export interface SupplierHistory {
  count: number;
  total_amount: number;
  last_order_at: Date | null;
}

const EMPTY_SUPPLIER_HISTORY: SupplierHistory = {
  count: 0,
  total_amount: 0,
  last_order_at: null,
};

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name)
    private supplierModel: Model<SupplierDocument>,
    @InjectConnection() private connection: Connection,
    private readonly logger: AppLoggerService,
  ) {}

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<SupplierDocument | null> {
    return this.supplierModel.findOne({
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
    this.logger.step('SuppliersService.list', {
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
      this.supplierModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }),
      this.supplierModel.countDocuments(filter),
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
    dto: CreateSupplierDto,
  ): Promise<SupplierDocument> {
    this.logger.step('SuppliersService.create', { tenantId, name: dto.name });

    if (dto.email) {
      await this.assertEmailAvailable(tenantId, dto.email);
    }

    return this.supplierModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      name: dto.name,
      phone: dto.phone,
      email: dto.email?.toLowerCase(),
      address: dto.address,
      tax_code: dto.tax_code,
      status: PartyStatus.ACTIVE,
      created_by: new Types.ObjectId(userId),
      modified_by: new Types.ObjectId(userId),
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierDocument> {
    this.logger.step('SuppliersService.update', { tenantId, id, ...dto });

    const supplier = await this.findByIdInTenant(tenantId, id);
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }

    if (dto.email !== undefined) {
      if (dto.email) {
        await this.assertEmailAvailable(tenantId, dto.email, id);
        supplier.email = dto.email.toLowerCase();
      } else {
        supplier.email = undefined;
      }
    }

    if (dto.name !== undefined) supplier.name = dto.name;
    if (dto.phone !== undefined) supplier.phone = dto.phone;
    if (dto.address !== undefined) supplier.address = dto.address;
    if (dto.tax_code !== undefined) supplier.tax_code = dto.tax_code;

    supplier.modified_by = new Types.ObjectId(userId);
    await supplier.save();
    return supplier;
  }

  async disable(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<SupplierDocument> {
    this.logger.step('SuppliersService.disable', { tenantId, id });

    const supplier = await this.findByIdInTenant(tenantId, id);
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }
    if (supplier.status === PartyStatus.DISABLED) {
      throw new AppError(ERRORS.SUPPLIER.ALREADY_DISABLED);
    }

    supplier.status = PartyStatus.DISABLED;
    supplier.modified_by = new Types.ObjectId(userId);
    await supplier.save();
    return supplier;
  }

  async activate(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<SupplierDocument> {
    this.logger.step('SuppliersService.activate', { tenantId, id });

    const supplier = await this.findByIdInTenant(tenantId, id);
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }
    if (supplier.status === PartyStatus.ACTIVE) {
      return supplier;
    }

    supplier.status = PartyStatus.ACTIVE;
    supplier.modified_by = new Types.ObjectId(userId);
    await supplier.save();
    return supplier;
  }

  async softDelete(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    this.logger.step('SuppliersService.softDelete', { tenantId, id });

    const supplier = await this.findByIdInTenant(tenantId, id);
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }

    const hasOrders = await this.hasPurchaseOrders(tenantId, id);
    if (hasOrders) {
      throw new AppError(ERRORS.SUPPLIER.HAS_PURCHASE_ORDERS);
    }

    supplier.is_deleted = true;
    supplier.deleted_at = new Date();
    supplier.modified_by = new Types.ObjectId(userId);
    await supplier.save();
  }

  async getHistory(tenantId: string, id: string): Promise<SupplierHistory> {
    this.logger.step('SuppliersService.getHistory', { tenantId, id });

    const supplier = await this.findByIdInTenant(tenantId, id);
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }

    return this.aggregatePurchaseOrderHistory(tenantId, id);
  }

  toResponse(supplier: SupplierDocument) {
    return {
      id: supplier._id,
      tenant_id: supplier.tenant_id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      tax_code: supplier.tax_code,
      status: supplier.status,
      created_at: supplier.created_at,
      updated_at: supplier.updated_at,
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

    const existing = await this.supplierModel.findOne(filter);
    if (existing) {
      throw new AppError(ERRORS.SUPPLIER.EMAIL_IN_USE);
    }
  }

  private async hasPurchaseOrders(
    tenantId: string,
    supplierId: string,
  ): Promise<boolean> {
    try {
      const count = await this.connection
        .collection('purchase_orders')
        .countDocuments({
          tenant_id: new Types.ObjectId(tenantId),
          supplier_id: new Types.ObjectId(supplierId),
          is_deleted: { $ne: true },
        });
      return count > 0;
    } catch {
      return false;
    }
  }

  private async aggregatePurchaseOrderHistory(
    tenantId: string,
    supplierId: string,
  ): Promise<SupplierHistory> {
    try {
      const [result] = await this.connection
        .collection('purchase_orders')
        .aggregate([
          {
            $match: {
              tenant_id: new Types.ObjectId(tenantId),
              supplier_id: new Types.ObjectId(supplierId),
              is_deleted: { $ne: true },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total_amount: { $sum: '$total_amount' },
              last_order_at: { $max: '$created_at' },
            },
          },
        ])
        .toArray();

      if (!result) {
        return EMPTY_SUPPLIER_HISTORY;
      }

      return {
        count: result.count ?? 0,
        total_amount: result.total_amount ?? 0,
        last_order_at: result.last_order_at ?? null,
      };
    } catch {
      return EMPTY_SUPPLIER_HISTORY;
    }
  }

  private static readonly SUPPLIER_CSV_HEADERS = [
    'name',
    'phone',
    'email',
    'address',
    'tax_code',
    'status',
  ] as const;

  async exportCsv(
    tenantId: string,
    search?: string,
    status?: PartyStatus,
  ): Promise<string> {
    const suppliers = await this.findSuppliersForExport(tenantId, search, status);
    const rows = suppliers.map((supplier) => [
      supplier.name,
      supplier.phone,
      supplier.email ?? '',
      supplier.address ?? '',
      supplier.tax_code ?? '',
      supplier.status,
    ]);

    return buildCsv([...SuppliersService.SUPPLIER_CSV_HEADERS], rows);
  }

  async getImportTemplateExcel(): Promise<Buffer> {
    return buildExcelBuffer(
      [...SuppliersService.SUPPLIER_CSV_HEADERS],
      [
        [
          'Công ty TNHH ABC',
          '0901234567',
          'contact@abc.vn',
          '123 Nguyễn Huệ, Q1, TP.HCM',
          '0123456789',
          'ACTIVE',
        ],
      ],
      { columnFormats: SUPPLIER_IMPORT_COLUMN_FORMATS },
    );
  }

  private async findSuppliersForExport(
    tenantId: string,
    search?: string,
    status?: PartyStatus,
  ): Promise<SupplierDocument[]> {
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

    return this.supplierModel
      .find(filter)
      .sort({ name: 1 })
      .limit(APP.csv.exportMaxRows);
  }
}
