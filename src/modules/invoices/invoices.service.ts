import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { DomainEventPublisher } from '../../infrastructure/queue/domain-event.publisher';
import { APP } from '../../shared/constants/app.constants';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import {
  CustomerType,
  InvoiceStatus,
  PartyStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
} from '../../shared/constants/business.enums';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { AppError, ERRORS } from '../../shared/errors';
import { buildCsv } from '../../shared/utils/csv.util';
import { CustomersService } from '../customers/customers.service';
import { InventoryReferenceType } from '../inventory/constants/inventory.enums';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
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
import { InvoiceSequenceService } from './invoice-sequence.service';
import { ProductDocument } from '../products/schemas/product.schema';
import { PriceTierDocument } from '../price-tiers/schemas/price-tier.schema';

interface ResolvedLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  priceTierCode: string;
  priceTierLabel: string;
}

interface RefundedQuantityMap {
  [productId: string]: number;
}

type InvoiceExportType = 'summary' | 'detail';

interface InvoiceListFilters {
  status?: InvoiceStatus;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
}

const INVOICE_SUMMARY_CSV_HEADERS = [
  'invoice_number',
  'customer_name',
  'customer_type',
  'customer_tax_code',
  'subtotal',
  'discount_percent',
  'discount_amount',
  'tax_percent',
  'tax',
  'total',
  'payment_method',
  'status',
  'created_at',
] as const;

const INVOICE_DETAIL_CSV_HEADERS = [
  'invoice_number',
  'created_at',
  'status',
  'customer_name',
  'customer_tax_code',
  'product_sku',
  'product_name',
  'quantity',
  'unit_price',
  'line_total',
  'price_tier_code',
] as const;

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
    private priceTiersService: PriceTiersService,
    private customersService: CustomersService,
    private inventoryService: InventoryService,
    private settingsService: SettingsService,
    private rbacService: RbacService,
    private domainEventPublisher: DomainEventPublisher,
    private auditService: AuditService,
    private invoiceSequenceService: InvoiceSequenceService,
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

    const discountPercent = dto.discountPercent ?? dto.discount ?? 0;
    const discountAmountFixed = dto.discountAmount ?? 0;
    const taxPercent = dto.taxPercent ?? 0;

    if (dto.customerId) {
      const customer = await this.customersService.findByIdInTenant(
        tenantId,
        dto.customerId,
      );
      if (!customer) {
        throw new AppError(ERRORS.INVOICE.CUSTOMER_NOT_FOUND);
      }
      if (customer.status === PartyStatus.DISABLED) {
        throw new AppError(ERRORS.INVOICE.CUSTOMER_DISABLED);
      }
      if (
        customer.customer_type !== CustomerType.COMPANY &&
        customer.customer_type !== CustomerType.GROUP
      ) {
        throw new AppError(ERRORS.INVOICE.CUSTOMER_TYPE_NOT_ALLOWED);
      }
    }

    await this.validateDiscountLimit(tenantId, roleId, discountPercent);

    const productIds = dto.items.map((item) => item.productId);
    const [productMap, tierMap, allowNegativeStock] = await Promise.all([
      this.productsService.findManyByIdsInTenant(tenantId, productIds),
      this.priceTiersService.getTierMap(tenantId),
      this.settingsService.getBoolean(
        tenantId,
        'inventory.allow_negative_stock',
        false,
      ),
    ]);

    const lineItems = this.resolveLineItems(dto.items, productMap, tierMap);
    await this.assertSufficientStock(tenantId, lineItems, allowNegativeStock);

    const subtotal = this.roundMoney(
      lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    const discountFromPercent = this.roundMoney(
      subtotal * (discountPercent / 100),
    );
    const discountAmount = this.roundMoney(
      discountFromPercent + discountAmountFixed,
    );
    const taxableAmount = this.roundMoney(subtotal - discountAmount);
    const tax = this.roundMoney(taxableAmount * (taxPercent / 100));
    const total = this.roundMoney(taxableAmount + tax);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const invoiceNumber = await this.invoiceSequenceService.nextInvoiceNumber(
        tenantId,
        session,
      );
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
            discount_amount: discountAmount,
            tax_percent: taxPercent,
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
          price_tier_code: item.priceTierCode,
          price_tier_label: item.priceTierLabel,
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
          `${invoiceId}:${item.productId}:${item.priceTierCode}`,
          userId,
          session,
          {
            skipProductExistsCheck: true,
            allowNegativeStock,
          },
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

      void this.inventoryService.checkLowStockAlerts(tenantId, productIds);

      void this.domainEventPublisher.publish({
        type: APP.queue.domainEvents.INVOICE_PAID,
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
    filters: InvoiceListFilters & {
      page?: number;
      limit?: number;
    },
  ) {
    this.logger.step('InvoicesService.list', { tenantId, ...filters });

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const query = this.buildInvoiceListQuery(tenantId, filters);

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

  async exportCsv(
    tenantId: string,
    filters: InvoiceListFilters,
    exportType: InvoiceExportType = 'summary',
  ): Promise<string> {
    this.logger.step('InvoicesService.exportCsv', {
      tenantId,
      exportType,
      ...filters,
    });

    const query = this.buildInvoiceListQuery(tenantId, filters);
    const invoices = await this.invoiceModel
      .find(query)
      .sort({ created_at: -1, _id: -1 })
      .limit(APP.csv.exportMaxRows)
      .lean();

    if (exportType === 'detail') {
      return this.buildInvoiceDetailCsv(tenantId, invoices);
    }

    return this.buildInvoiceSummaryCsv(tenantId, invoices);
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
        price_tier_code: item.price_tier_code ?? 'RETAIL',
        price_tier_label: item.price_tier_label ?? '',
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
          `${id}:cancel:${productId}:${item.price_tier_code ?? 'RETAIL'}`,
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

  private resolveLineItems(
    items: CreateInvoiceDto['items'],
    productMap: Map<string, ProductDocument>,
    tierMap: Map<string, PriceTierDocument>,
  ): ResolvedLineItem[] {
    const resolved: ResolvedLineItem[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);

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

      const tierCode = item.priceTierCode ?? 'RETAIL';
      const tier = tierMap.get(tierCode);
      if (!tier) {
        throw new AppError(ERRORS.PRICE_TIER.INVALID_FOR_TENANT, {
          details: { code: tierCode },
        });
      }

      const expectedPrice = this.priceTiersService.getPriceForTier(
        product,
        tierCode,
      );
      if (expectedPrice === undefined) {
        throw new AppError(ERRORS.PRICE_TIER.MISSING_SYSTEM_PRICE, {
          details: { productId: item.productId, code: tierCode },
        });
      }

      const unitPrice = item.unitPrice ?? expectedPrice;
      if (Math.abs(unitPrice - expectedPrice) > 0.01) {
        throw new AppError(ERRORS.INVOICE.PRICE_MISMATCH, {
          details: {
            productId: item.productId,
            tierCode,
            expected: expectedPrice,
            received: unitPrice,
          },
        });
      }

      const lineTotal = this.roundMoney(unitPrice * item.quantity);

      resolved.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        priceTierCode: tierCode,
        priceTierLabel: tier.label,
      });
    }

    return resolved;
  }

  private async assertSufficientStock(
    tenantId: string,
    lineItems: ResolvedLineItem[],
    allowNegativeStock: boolean,
  ): Promise<void> {
    if (allowNegativeStock) {
      return;
    }

    const requiredByProduct = new Map<string, number>();
    for (const item of lineItems) {
      requiredByProduct.set(
        item.productId,
        (requiredByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const balanceMap = await this.inventoryService.getBalanceMap(
      tenantId,
      [...requiredByProduct.keys()],
    );

    for (const [productId, required] of requiredByProduct) {
      const available = balanceMap.get(productId) ?? 0;
      if (available < required) {
        throw new AppError(ERRORS.INVENTORY.INSUFFICIENT_STOCK, {
          details: {
            productId,
            available_quantity: available,
            requested: required,
          },
        });
      }
    }
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
    const productMap = await this.productsService.findManyByIdsInTenant(
      tenantId,
      productIds,
    );
    const map = new Map<string, string>();

    for (const [productId, product] of productMap) {
      map.set(productId, product.name);
    }

    return map;
  }

  private buildInvoiceListQuery(
    tenantId: string,
    filters: InvoiceListFilters,
  ): Record<string, unknown> {
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

    return query;
  }

  private async buildInvoiceSummaryCsv(
    tenantId: string,
    invoices: Array<
      Invoice & { _id: Types.ObjectId; created_at?: Date; customer_id?: Types.ObjectId }
    >,
  ): Promise<string> {
    const customerIds = invoices
      .map((invoice) => invoice.customer_id?.toString())
      .filter((id): id is string => Boolean(id));
    const customerMap =
      await this.customersService.findManyByIdsInTenant(tenantId, customerIds);

    const rows = invoices.map((invoice) => {
      const customer = invoice.customer_id
        ? customerMap.get(invoice.customer_id.toString())
        : undefined;

      return [
        invoice.invoice_number,
        customer?.name ?? 'Walk-in',
        customer?.customer_type ?? '',
        customer?.tax_code ?? '',
        invoice.subtotal,
        invoice.discount,
        invoice.discount_amount ?? 0,
        invoice.tax_percent ?? 0,
        invoice.tax,
        invoice.total,
        invoice.payment_method,
        invoice.status,
        invoice.created_at?.toISOString() ?? '',
      ];
    });

    return buildCsv([...INVOICE_SUMMARY_CSV_HEADERS], rows);
  }

  private async buildInvoiceDetailCsv(
    tenantId: string,
    invoices: Array<
      Invoice & {
        _id: Types.ObjectId;
        created_at?: Date;
        customer_id?: Types.ObjectId;
        invoice_number: string;
        status: InvoiceStatus;
      }
    >,
  ): Promise<string> {
    if (invoices.length === 0) {
      return buildCsv([...INVOICE_DETAIL_CSV_HEADERS], []);
    }

    const tenantObjectId = new Types.ObjectId(tenantId);
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const invoiceMap = new Map(
      invoices.map((invoice) => [invoice._id.toString(), invoice]),
    );

    const items = await this.invoiceItemModel
      .find({
        tenant_id: tenantObjectId,
        invoice_id: { $in: invoiceIds },
      })
      .sort({ created_at: -1, _id: -1 })
      .limit(APP.csv.exportMaxRows)
      .lean();

    const customerIds = invoices
      .map((invoice) => invoice.customer_id?.toString())
      .filter((id): id is string => Boolean(id));
    const productIds = items.map((item) => item.product_id.toString());

    const [customerMap, productMap] = await Promise.all([
      this.customersService.findManyByIdsInTenant(tenantId, customerIds),
      this.productsService.findManyByIdsInTenant(tenantId, productIds),
    ]);

    const rows = items.map((item) => {
      const invoice = invoiceMap.get(item.invoice_id.toString());
      const customer = invoice?.customer_id
        ? customerMap.get(invoice.customer_id.toString())
        : undefined;
      const product = productMap.get(item.product_id.toString());

      return [
        invoice?.invoice_number ?? '',
        invoice?.created_at?.toISOString() ?? '',
        invoice?.status ?? '',
        customer?.name ?? 'Walk-in',
        customer?.tax_code ?? '',
        product?.sku ?? '',
        product?.name ?? '',
        item.quantity,
        item.unit_price,
        item.total,
        item.price_tier_code ?? 'RETAIL',
      ];
    });

    return buildCsv([...INVOICE_DETAIL_CSV_HEADERS], rows);
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
      discount_amount: invoice.discount_amount ?? 0,
      tax_percent: invoice.tax_percent ?? 0,
      tax: invoice.tax,
      total: invoice.total,
      payment_method: invoice.payment_method,
      status: invoice.status,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    };
  }
}
