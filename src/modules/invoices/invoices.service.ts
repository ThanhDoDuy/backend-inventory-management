import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { DomainEventPublisher } from '../../infrastructure/queue/domain-event.publisher';
import { DOMAIN_EVENTS } from '../../infrastructure/queue/queue.constants';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
} from '../../shared/constants/business.enums';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { AppError, ERRORS } from '../../shared/errors';
import { CustomersService } from '../customers/customers.service';
import { InventoryReferenceType } from '../inventory/constants/inventory.enums';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { RbacService } from '../rbac/rbac.service';
import { SettingsService } from '../settings/settings.service';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  RefundInvoiceDto,
} from './dto/invoice.dto';
import { InvoiceItem, InvoiceItemDocument } from './schemas/invoice-item.schema';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Refund, RefundDocument } from './schemas/refund.schema';

interface ResolvedLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface RefundedQuantityMap {
  [productId: string]: number;
}

const INVOICE_NUMBER_PAD = 4;

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name)
    private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceItem.name)
    private invoiceItemModel: Model<InvoiceItemDocument>,
    @InjectModel(Payment.name)
    private paymentModel: Model<PaymentDocument>,
    @InjectModel(Refund.name)
    private refundModel: Model<RefundDocument>,
    @InjectModel(Tenant.name)
    private tenantModel: Model<TenantDocument>,
    @InjectConnection() private connection: Connection,
    private productsService: ProductsService,
    private customersService: CustomersService,
    private inventoryService: InventoryService,
    private settingsService: SettingsService,
    private rbacService: RbacService,
    private domainEventPublisher: DomainEventPublisher,
    private auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async createAndPay(
    tenantId: string,
    userId: string,
    roleId: string,
    dto: CreateInvoiceDto,
  ) {
    this.logger.step('InvoicesService.createAndPay', {
      tenantId,
      itemCount: dto.items.length,
    });

    if (!dto.items?.length) {
      throw new AppError(ERRORS.INVOICE.EMPTY_ITEMS);
    }

    const discountPercent = dto.discount ?? 0;

    if (dto.customerId) {
      const customer = await this.customersService.findByIdInTenant(
        tenantId,
        dto.customerId,
      );
      if (!customer) {
        throw new AppError(ERRORS.INVOICE.CUSTOMER_NOT_FOUND);
      }
    }

    await this.validateDiscountLimit(tenantId, roleId, discountPercent);

    const lineItems = await this.resolveLineItems(tenantId, dto.items);
    await this.assertSufficientStock(tenantId, lineItems);

    const subtotal = this.roundMoney(
      lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const discountAmount = this.roundMoney(subtotal * (discountPercent / 100));
    const tax = 0;
    const total = this.roundMoney(subtotal - discountAmount + tax);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const invoiceNumber = await this.generateInvoiceNumber(tenantId, session);
      const tenantObjectId = new Types.ObjectId(tenantId);
      const userObjectId = new Types.ObjectId(userId);

      const [invoice] = await this.invoiceModel.create(
        [
          {
            tenant_id: tenantObjectId,
            invoice_number: invoiceNumber,
            customer_id: dto.customerId
              ? new Types.ObjectId(dto.customerId)
              : undefined,
            subtotal,
            discount: discountPercent,
            tax,
            total,
            payment_method: dto.paymentMethod,
            status: InvoiceStatus.PAID,
            created_by: userObjectId,
            modified_by: userObjectId,
            is_deleted: false,
            version: 1,
          },
        ],
        { session, ordered: true },
      );

      const invoiceId = invoice._id.toString();

      await this.invoiceItemModel.insertMany(
        lineItems.map((item) => ({
          tenant_id: tenantObjectId,
          invoice_id: invoice._id,
          product_id: new Types.ObjectId(item.productId),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.lineTotal,
        })),
        { session },
      );

      await this.paymentModel.create(
        [
          {
            tenant_id: tenantObjectId,
            invoice_id: invoice._id,
            amount: total,
            method: dto.paymentMethod,
            status: PaymentStatus.SUCCESS,
            paid_at: new Date(),
          },
        ],
        { session, ordered: true },
      );

      for (const item of lineItems) {
        await this.inventoryService.stockOut(
          tenantId,
          item.productId,
          item.quantity,
          InventoryReferenceType.INVOICE,
          `${invoiceId}:${item.productId}`,
          userId,
          session,
        );
      }

      if (dto.customerId) {
        await this.customersService.updateLastPurchaseAt(
          tenantId,
          dto.customerId,
          new Date(),
          session,
        );
      }

      await session.commitTransaction();

      for (const item of lineItems) {
        void this.inventoryService.checkLowStockAlert(tenantId, item.productId);
      }

      void this.domainEventPublisher.publish({
        type: DOMAIN_EVENTS.INVOICE_PAID,
        tenantId,
        actorUserId: userId,
        data: {
          invoiceId,
          invoiceNumber,
          total,
        },
      });

      this.auditService.emit({
        tenantId,
        userId,
        action: AUDIT_ACTIONS.CREATE_INVOICE,
        module: AUDIT_MODULES.INVOICE,
        entityId: invoiceId,
        newValue: { invoice_number: invoiceNumber, total, status: 'PAID' },
      });

      return this.getById(tenantId, invoiceId);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async list(
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: InvoiceStatus;
      customerId?: string;
      paymentMethod?: PaymentMethod;
      from?: string;
      to?: string;
    },
  ) {
    this.logger.step('InvoicesService.list', { tenantId, ...filters });

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.customerId) {
      query.customer_id = new Types.ObjectId(filters.customerId);
    }
    if (filters.paymentMethod) {
      query.payment_method = filters.paymentMethod;
    }
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) {
        createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        createdAt.$lte = new Date(filters.to);
      }
      query.created_at = createdAt;
    }

    const [items, total] = await Promise.all([
      this.invoiceModel
        .find(query)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.invoiceModel.countDocuments(query),
    ]);

    return {
      items: items.map((item) => this.toInvoiceSummary(item)),
      total,
      page,
      limit,
    };
  }

  async getById(tenantId: string, id: string) {
    this.logger.step('InvoicesService.getById', { tenantId, id });

    const invoice = await this.findInvoiceInTenant(tenantId, id);
    if (!invoice) {
      throw new AppError(ERRORS.INVOICE.NOT_FOUND);
    }

    const [items, payments, refunds] = await Promise.all([
      this.invoiceItemModel
        .find({
          tenant_id: new Types.ObjectId(tenantId),
          invoice_id: invoice._id,
        })
        .lean(),
      this.paymentModel
        .find({
          tenant_id: new Types.ObjectId(tenantId),
          invoice_id: invoice._id,
        })
        .lean(),
      this.refundModel
        .find({
          tenant_id: new Types.ObjectId(tenantId),
          invoice_id: invoice._id,
        })
        .sort({ created_at: -1 })
        .lean(),
    ]);

    const productIds = items.map((item) => item.product_id.toString());
    const productMap = await this.loadProductNames(tenantId, productIds);

    return {
      ...this.toInvoiceSummary(invoice),
      items: items.map((item) => ({
        id: item._id,
        product_id: item.product_id,
        product_name: productMap.get(item.product_id.toString()) ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      })),
      payments: payments.map((payment) => ({
        id: payment._id,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
      })),
      refunds: refunds.map((refund) => ({
        id: refund._id,
        items: refund.items.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
        })),
        amount: refund.amount,
        reason: refund.reason,
        created_at: refund.created_at,
      })),
    };
  }

  async cancel(
    tenantId: string,
    userId: string,
    id: string,
    dto: CancelInvoiceDto,
  ) {
    this.logger.step('InvoicesService.cancel', { tenantId, id });

    const invoice = await this.findInvoiceInTenant(tenantId, id);
    if (!invoice) {
      throw new AppError(ERRORS.INVOICE.NOT_FOUND);
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      throw new AppError(ERRORS.INVOICE.INVALID_STATUS, {
        message: 'Only paid invoices can be cancelled',
      });
    }

    const refundCount = await this.refundModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      invoice_id: invoice._id,
    });
    if (refundCount > 0) {
      throw new AppError(ERRORS.INVOICE.HAS_REFUNDS);
    }

    const items = await this.invoiceItemModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        invoice_id: invoice._id,
      })
      .lean();

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      for (const item of items) {
        const productId = item.product_id.toString();
        await this.inventoryService.stockIn(
          tenantId,
          productId,
          item.quantity,
          InventoryReferenceType.INVOICE,
          `${id}:cancel:${productId}`,
          userId,
          session,
        );
      }

      invoice.status = InvoiceStatus.CANCELLED;
      invoice.modified_by = new Types.ObjectId(userId);
      await invoice.save({ session });

      await session.commitTransaction();

      return this.getById(tenantId, id);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async refund(
    tenantId: string,
    userId: string,
    id: string,
    dto: RefundInvoiceDto,
  ) {
    this.logger.step('InvoicesService.refund', {
      tenantId,
      id,
      itemCount: dto.items.length,
    });

    const invoice = await this.findInvoiceInTenant(tenantId, id);
    if (!invoice) {
      throw new AppError(ERRORS.INVOICE.NOT_FOUND);
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      throw new AppError(ERRORS.INVOICE.INVALID_STATUS, {
        message: 'Only paid invoices can be refunded',
      });
    }

    const invoiceItems = await this.invoiceItemModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        invoice_id: invoice._id,
      })
      .lean();

    const purchasedMap = new Map(
      invoiceItems.map((item) => [item.product_id.toString(), item]),
    );
    const refundedMap = await this.getRefundedQuantities(tenantId, id);

    let refundAmount = 0;
    const refundLines: { productId: string; quantity: number }[] = [];

    for (const line of dto.items) {
      const purchased = purchasedMap.get(line.productId);
      if (!purchased) {
        throw new AppError(ERRORS.INVOICE.REFUND_QUANTITY_EXCEEDED, {
          details: { productId: line.productId },
        });
      }

      const alreadyRefunded = refundedMap[line.productId] ?? 0;
      const remaining = purchased.quantity - alreadyRefunded;

      if (line.quantity <= 0 || line.quantity > remaining) {
        throw new AppError(ERRORS.INVOICE.REFUND_QUANTITY_EXCEEDED, {
          details: {
            productId: line.productId,
            purchased: purchased.quantity,
            already_refunded: alreadyRefunded,
            requested: line.quantity,
          },
        });
      }

      refundAmount += purchased.unit_price * line.quantity;
      refundLines.push({
        productId: line.productId,
        quantity: line.quantity,
      });
    }

    refundAmount = this.roundMoney(refundAmount);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const refundId = new Types.ObjectId();

      await this.refundModel.create(
        [
          {
            _id: refundId,
            tenant_id: new Types.ObjectId(tenantId),
            invoice_id: invoice._id,
            items: refundLines.map((line) => ({
              product_id: new Types.ObjectId(line.productId),
              quantity: line.quantity,
            })),
            amount: refundAmount,
            reason: dto.reason?.trim() ?? '',
            created_by: new Types.ObjectId(userId),
          },
        ],
        { session, ordered: true },
      );

      for (const line of refundLines) {
        await this.inventoryService.stockIn(
          tenantId,
          line.productId,
          line.quantity,
          InventoryReferenceType.INVOICE,
          `${id}:refund:${refundId.toString()}:${line.productId}`,
          userId,
          session,
        );
      }

      const updatedRefundedMap = await this.getRefundedQuantities(
        tenantId,
        id,
        session,
      );
      const fullyRefunded = invoiceItems.every((item) => {
        const productId = item.product_id.toString();
        return (updatedRefundedMap[productId] ?? 0) >= item.quantity;
      });

      if (fullyRefunded) {
        invoice.status = InvoiceStatus.REFUNDED;
        invoice.modified_by = new Types.ObjectId(userId);
        await invoice.save({ session });
      }

      await session.commitTransaction();

      return this.getById(tenantId, id);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getPrintData(tenantId: string, id: string) {
    this.logger.step('InvoicesService.getPrintData', { tenantId, id });

    const detail = await this.getById(tenantId, id);
    const tenant = await this.tenantModel
      .findById(new Types.ObjectId(tenantId))
      .lean();

    const discountAmount = this.roundMoney(
      detail.subtotal * (detail.discount / 100),
    );

    return {
      store: {
        name: tenant?.name ?? '',
        slug: tenant?.slug ?? '',
      },
      invoice: {
        id: detail.id,
        invoice_number: detail.invoice_number,
        status: detail.status,
        created_at: detail.created_at,
        payment_method: detail.payment_method,
      },
      customer: detail.customer_id
        ? { id: detail.customer_id }
        : null,
      lines: detail.items.map((item) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      })),
      summary: {
        subtotal: detail.subtotal,
        discount_percent: detail.discount,
        discount_amount: discountAmount,
        tax: detail.tax,
        total: detail.total,
      },
      payments: detail.payments,
      refunds: detail.refunds,
      printed_at: new Date().toISOString(),
    };
  }

  private async validateDiscountLimit(
    tenantId: string,
    roleId: string,
    discountPercent: number,
  ): Promise<void> {
    if (discountPercent <= 0) {
      return;
    }

    const role = await this.rbacService.getRoleById(tenantId, roleId);

    if (role.code === RoleCode.ADMIN) {
      return;
    }

    const settingKey =
      role.code === RoleCode.MANAGER
        ? 'sales.max_discount_manager'
        : 'sales.max_discount_staff';

    const maxDiscount = await this.settingsService.getNumber(
      tenantId,
      settingKey,
      role.code === RoleCode.MANAGER ? 30 : 10,
    );

    if (discountPercent > maxDiscount) {
      throw new AppError(ERRORS.INVOICE.DISCOUNT_EXCEEDED, {
        details: {
          requested: discountPercent,
          max_allowed: maxDiscount,
          role: role.code,
        },
      });
    }
  }

  private async resolveLineItems(
    tenantId: string,
    items: CreateInvoiceDto['items'],
  ): Promise<ResolvedLineItem[]> {
    const resolved: ResolvedLineItem[] = [];

    for (const item of items) {
      const product = await this.productsService.findByIdInTenant(
        tenantId,
        item.productId,
      );

      if (!product) {
        throw new AppError(ERRORS.PRODUCT.NOT_FOUND, {
          details: { productId: item.productId },
        });
      }

      if (product.status !== ProductStatus.ACTIVE) {
        throw new AppError(ERRORS.INVOICE.PRODUCT_INACTIVE, {
          details: { productId: item.productId },
        });
      }

      const unitPrice = item.unitPrice ?? product.selling_price;
      const lineTotal = this.roundMoney(unitPrice * item.quantity);

      resolved.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    return resolved;
  }

  private async assertSufficientStock(
    tenantId: string,
    lineItems: ResolvedLineItem[],
  ): Promise<void> {
    const allowNegative = await this.settingsService.getBoolean(
      tenantId,
      'inventory.allow_negative_stock',
      false,
    );

    if (allowNegative) {
      return;
    }

    for (const item of lineItems) {
      const balance = await this.inventoryService.getBalance(
        tenantId,
        item.productId,
      );

      const available =
        Array.isArray(balance) ? 0 : balance.available_quantity;

      if (available < item.quantity) {
        throw new AppError(ERRORS.INVENTORY.INSUFFICIENT_STOCK, {
          details: {
            productId: item.productId,
            available_quantity: available,
            requested: item.quantity,
          },
        });
      }
    }
  }

  private async generateInvoiceNumber(
    tenantId: string,
    session: ClientSession,
  ): Promise<string> {
    const count = await this.invoiceModel.countDocuments(
      { tenant_id: new Types.ObjectId(tenantId) },
      { session },
    );

    return `INV${String(count + 1).padStart(INVOICE_NUMBER_PAD, '0')}`;
  }

  private async getRefundedQuantities(
    tenantId: string,
    invoiceId: string,
    session?: ClientSession,
  ): Promise<RefundedQuantityMap> {
    const refunds = await this.refundModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        invoice_id: new Types.ObjectId(invoiceId),
      })
      .session(session ?? null)
      .lean();

    const map: RefundedQuantityMap = {};

    for (const refund of refunds) {
      for (const line of refund.items) {
        const productId = line.product_id.toString();
        map[productId] = (map[productId] ?? 0) + line.quantity;
      }
    }

    return map;
  }

  private async loadProductNames(
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    for (const productId of productIds) {
      const product = await this.productsService.findByIdInTenant(
        tenantId,
        productId,
      );
      if (product) {
        map.set(productId, product.name);
      }
    }

    return map;
  }

  private async findInvoiceInTenant(
    tenantId: string,
    id: string,
  ): Promise<InvoiceDocument | null> {
    return this.invoiceModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toInvoiceSummary(
    invoice:
      | InvoiceDocument
      | (Invoice & { _id: Types.ObjectId; created_at?: Date; updated_at?: Date }),
  ) {
    return {
      id: invoice._id,
      invoice_number: invoice.invoice_number,
      customer_id: invoice.customer_id ?? null,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      tax: invoice.tax,
      total: invoice.total,
      payment_method: invoice.payment_method,
      status: invoice.status,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    };
  }
}
