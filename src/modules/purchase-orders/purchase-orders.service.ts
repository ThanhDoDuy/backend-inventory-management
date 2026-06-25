import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { DomainEventPublisher } from '../../infrastructure/queue/domain-event.publisher';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import { PoStatus } from '../../shared/constants/business.enums';
import { APP } from '../../shared/constants/app.constants';
import { AppError, ERRORS } from '../../shared/errors';
import { buildCsv } from '../../shared/utils/csv.util';
import { acquireLockWithRetry } from '../../shared/utils/redis-lock.util';
import { InventoryReferenceType } from '../inventory/constants/inventory.enums';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { SuppliersService } from '../suppliers/suppliers.service';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderItemInputDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
} from './schemas/goods-receipt.schema';
import {
  PurchaseOrderItem,
  PurchaseOrderItemDocument,
} from './schemas/purchase-order-item.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from './schemas/purchase-order.schema';

export interface PurchaseOrderItemView {
  id: string;
  productId: string;
  quantity: number;
  received_quantity: number;
  cost_price: number;
  remaining_quantity: number;
}

export interface PurchaseOrderView {
  id: string;
  po_number: string;
  supplierId: string;
  status: PoStatus;
  total_amount: number;
  expected_date?: Date;
  cancel_reason?: string;
  created_at?: Date;
  updated_at?: Date;
  items?: PurchaseOrderItemView[];
}

export interface ListPurchaseOrdersResult {
  items: PurchaseOrderView[];
  total: number;
  page: number;
  limit: number;
}

type PurchaseOrderExportType = 'summary' | 'detail';

interface PurchaseOrderListFilters {
  status?: PoStatus;
  supplierId?: string;
  from?: string;
  to?: string;
}

const PO_SUMMARY_CSV_HEADERS = [
  'po_number',
  'supplier_name',
  'supplier_phone',
  'status',
  'total_amount',
  'expected_date',
  'cancel_reason',
  'created_at',
  'updated_at',
] as const;

const PO_DETAIL_CSV_HEADERS = [
  'po_number',
  'supplier_name',
  'status',
  'product_sku',
  'product_name',
  'quantity',
  'received_quantity',
  'remaining_quantity',
  'cost_price',
  'line_total',
  'created_at',
] as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(PurchaseOrderItem.name)
    private purchaseOrderItemModel: Model<PurchaseOrderItemDocument>,
    @InjectModel(GoodsReceipt.name)
    private goodsReceiptModel: Model<GoodsReceiptDocument>,
    @InjectModel(Supplier.name)
    private supplierModel: Model<SupplierDocument>,
    @InjectModel(Product.name)
    private productModel: Model<ProductDocument>,
    @InjectConnection() private connection: Connection,
    private suppliersService: SuppliersService,
    private productsService: ProductsService,
    private inventoryService: InventoryService,
    private redisService: RedisService,
    private domainEventPublisher: DomainEventPublisher,
    private auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.create', {
      tenantId,
      supplierId: dto.supplierId,
      itemCount: dto.items.length,
    });

    await this.assertSupplierExists(tenantId, dto.supplierId);
    await this.validateItems(tenantId, dto.items);

    const totalAmount = this.calculateTotalAmount(dto.items);
    const tenantObjectId = new Types.ObjectId(tenantId);
    const userObjectId = new Types.ObjectId(userId);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const poNumber = await this.generatePoNumber(tenantId, session);

      const [purchaseOrder] = await this.purchaseOrderModel.create(
        [
          {
            tenant_id: tenantObjectId,
            po_number: poNumber,
            supplier_id: new Types.ObjectId(dto.supplierId),
            status: PoStatus.DRAFT,
            total_amount: totalAmount,
            expected_date: dto.expectedDate
              ? new Date(dto.expectedDate)
              : undefined,
            created_by: userObjectId,
            modified_by: userObjectId,
            is_deleted: false,
            version: 1,
          },
        ],
        { session, ordered: true },
      );

      await this.purchaseOrderItemModel.insertMany(
        dto.items.map((item) => ({
          tenant_id: tenantObjectId,
          purchase_order_id: purchaseOrder._id,
          product_id: new Types.ObjectId(item.productId),
          quantity: item.quantity,
          received_quantity: 0,
          cost_price: item.costPrice,
        })),
        { session },
      );

      await session.commitTransaction();

      this.auditService.emit({
        tenantId,
        userId,
        action: AUDIT_ACTIONS.CREATE_PO,
        module: AUDIT_MODULES.PO,
        entityId: purchaseOrder._id.toString(),
        newValue: {
          po_number: poNumber,
          supplier_id: dto.supplierId,
          total_amount: totalAmount,
          item_count: dto.items.length,
        },
      });

      return this.getById(tenantId, purchaseOrder._id.toString());
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.update', { tenantId, id, ...dto });

    const purchaseOrder = await this.findByIdInTenant(tenantId, id);
    if (!purchaseOrder) {
      throw new AppError(ERRORS.PO.NOT_FOUND);
    }
    if (purchaseOrder.status !== PoStatus.DRAFT) {
      throw new AppError(ERRORS.PO.NOT_DRAFT);
    }

    if (dto.supplierId) {
      await this.assertSupplierExists(tenantId, dto.supplierId);
      purchaseOrder.supplier_id = new Types.ObjectId(dto.supplierId);
    }

    if (dto.expectedDate !== undefined) {
      purchaseOrder.expected_date = dto.expectedDate
        ? new Date(dto.expectedDate)
        : undefined;
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      if (dto.items) {
        await this.validateItems(tenantId, dto.items);
        purchaseOrder.total_amount = this.calculateTotalAmount(dto.items);

        await this.purchaseOrderItemModel.deleteMany(
          {
            tenant_id: new Types.ObjectId(tenantId),
            purchase_order_id: purchaseOrder._id,
          },
          { session },
        );

        await this.purchaseOrderItemModel.insertMany(
          dto.items.map((item) => ({
            tenant_id: new Types.ObjectId(tenantId),
            purchase_order_id: purchaseOrder._id,
            product_id: new Types.ObjectId(item.productId),
            quantity: item.quantity,
            received_quantity: 0,
            cost_price: item.costPrice,
          })),
          { session },
        );
      }

      purchaseOrder.modified_by = new Types.ObjectId(userId);
      await purchaseOrder.save({ session });
      await session.commitTransaction();

      return this.getById(tenantId, id);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async approve(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.approve', { tenantId, id });

    return this.withPoLock(tenantId, id, async () => {
      const purchaseOrder = await this.findByIdInTenant(tenantId, id);
      if (!purchaseOrder) {
        throw new AppError(ERRORS.PO.NOT_FOUND);
      }
      if (purchaseOrder.status !== PoStatus.DRAFT) {
        throw new AppError(ERRORS.PO.INVALID_STATUS, {
          message: 'Only DRAFT purchase orders can be approved',
        });
      }

      const itemCount = await this.purchaseOrderItemModel.countDocuments({
        tenant_id: new Types.ObjectId(tenantId),
        purchase_order_id: purchaseOrder._id,
      });
      if (itemCount === 0) {
        throw new AppError(ERRORS.PO.NO_ITEMS);
      }

      purchaseOrder.status = PoStatus.APPROVED;
      purchaseOrder.modified_by = new Types.ObjectId(userId);
      await purchaseOrder.save();

      this.auditService.emit({
        tenantId,
        userId,
        action: AUDIT_ACTIONS.APPROVE_PO,
        module: AUDIT_MODULES.PO,
        entityId: id,
        oldValue: { status: PoStatus.DRAFT },
        newValue: { status: PoStatus.APPROVED },
      });

      return this.getById(tenantId, id);
    });
  }

  async cancel(
    tenantId: string,
    userId: string,
    id: string,
    dto: CancelPurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.cancel', { tenantId, id });

    const purchaseOrder = await this.findByIdInTenant(tenantId, id);
    if (!purchaseOrder) {
      throw new AppError(ERRORS.PO.NOT_FOUND);
    }
    if (purchaseOrder.status === PoStatus.CANCELLED) {
      throw new AppError(ERRORS.PO.ALREADY_CANCELLED);
    }
    if (
      purchaseOrder.status === PoStatus.RECEIVED ||
      purchaseOrder.status === PoStatus.PARTIALLY_RECEIVED
    ) {
      throw new AppError(ERRORS.PO.INVALID_STATUS, {
        message: 'Cannot cancel a purchase order that has received goods',
      });
    }

    purchaseOrder.status = PoStatus.CANCELLED;
    purchaseOrder.cancel_reason = dto.reason;
    purchaseOrder.modified_by = new Types.ObjectId(userId);
    await purchaseOrder.save();

    return this.getById(tenantId, id);
  }

  async receive(
    tenantId: string,
    userId: string,
    id: string,
    dto: ReceivePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.receive', {
      tenantId,
      id,
      itemCount: dto.items.length,
    });

    return this.withPoLock(tenantId, id, async () => {
      const purchaseOrder = await this.findByIdInTenant(tenantId, id);
      if (!purchaseOrder) {
        throw new AppError(ERRORS.PO.NOT_FOUND);
      }
      if (
        purchaseOrder.status !== PoStatus.APPROVED &&
        purchaseOrder.status !== PoStatus.PARTIALLY_RECEIVED
      ) {
        throw new AppError(ERRORS.PO.INVALID_STATUS, {
          message:
            'Only APPROVED or PARTIALLY_RECEIVED purchase orders can be received',
        });
      }

      const poItems = await this.purchaseOrderItemModel.find({
        tenant_id: new Types.ObjectId(tenantId),
        purchase_order_id: purchaseOrder._id,
      });

      const itemMap = new Map(
        poItems.map((item) => [item.product_id.toString(), item]),
      );

      for (const receiveItem of dto.items) {
        const poItem = itemMap.get(receiveItem.productId);
        if (!poItem) {
          throw new AppError(ERRORS.PO.ITEM_NOT_FOUND, {
            details: { productId: receiveItem.productId },
          });
        }

        const remaining = poItem.quantity - poItem.received_quantity;
        if (receiveItem.receivedQuantity > remaining) {
          throw new AppError(ERRORS.PO.RECEIVE_QUANTITY_EXCEEDED, {
            details: {
              productId: receiveItem.productId,
              ordered: poItem.quantity,
              already_received: poItem.received_quantity,
              requested: receiveItem.receivedQuantity,
              remaining,
            },
          });
        }
      }

      const session = await this.connection.startSession();
      session.startTransaction();

      try {
        const tenantObjectId = new Types.ObjectId(tenantId);
        const userObjectId = new Types.ObjectId(userId);

        const [grn] = await this.goodsReceiptModel.create(
          [
            {
              tenant_id: tenantObjectId,
              purchase_order_id: purchaseOrder._id,
              items: dto.items.map((item) => ({
                product_id: new Types.ObjectId(item.productId),
                quantity: item.receivedQuantity,
              })),
              created_by: userObjectId,
            },
          ],
          { session, ordered: true },
        );

        const grnId = grn._id.toString();

        for (const receiveItem of dto.items) {
          const poItem = itemMap.get(receiveItem.productId)!;

          await this.inventoryService.stockIn(
            tenantId,
            receiveItem.productId,
            receiveItem.receivedQuantity,
            InventoryReferenceType.PURCHASE_ORDER,
            `${grnId}:${receiveItem.productId}`,
            userId,
            session,
          );

          poItem.received_quantity += receiveItem.receivedQuantity;
          await poItem.save({ session });
        }

        const updatedItems = await this.purchaseOrderItemModel
          .find({
            tenant_id: tenantObjectId,
            purchase_order_id: purchaseOrder._id,
          })
          .session(session);

        const allReceived = updatedItems.every(
          (item) => item.received_quantity >= item.quantity,
        );
        const anyReceived = updatedItems.some(
          (item) => item.received_quantity > 0,
        );

        if (allReceived) {
          purchaseOrder.status = PoStatus.RECEIVED;
        } else if (anyReceived) {
          purchaseOrder.status = PoStatus.PARTIALLY_RECEIVED;
        }

        purchaseOrder.modified_by = userObjectId;
        await purchaseOrder.save({ session });

        await session.commitTransaction();

        for (const receiveItem of dto.items) {
          void this.inventoryService.checkLowStockAlert(
            tenantId,
            receiveItem.productId,
          );
        }

        void this.domainEventPublisher.publish({
          type: APP.queue.domainEvents.PO_RECEIVED,
          tenantId,
          actorUserId: userId,
          data: {
            purchaseOrderId: id,
            poNumber: purchaseOrder.po_number,
            status: purchaseOrder.status,
          },
        });

        this.auditService.emit({
          tenantId,
          userId,
          action: AUDIT_ACTIONS.RECEIVE_PO,
          module: AUDIT_MODULES.PO,
          entityId: id,
          newValue: {
            po_number: purchaseOrder.po_number,
            status: purchaseOrder.status,
          },
        });

        return this.getById(tenantId, id);
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    });
  }

  async list(
    tenantId: string,
    page = 1,
    limit = 10,
    status?: PoStatus,
    supplierId?: string,
    from?: string,
    to?: string,
  ): Promise<ListPurchaseOrdersResult> {
    this.logger.step('PurchaseOrdersService.list', {
      tenantId,
      page,
      limit,
      status,
      supplierId,
      from,
      to,
    });

    const filter = this.buildListFilter(tenantId, { status, supplierId, from, to });

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.purchaseOrderModel
        .find(filter)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      this.purchaseOrderModel.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      total,
      page,
      limit,
    };
  }

  async exportCsv(
    tenantId: string,
    filters: PurchaseOrderListFilters,
    exportType: PurchaseOrderExportType = 'summary',
  ): Promise<string> {
    this.logger.step('PurchaseOrdersService.exportCsv', {
      tenantId,
      exportType,
      ...filters,
    });

    const filter = this.buildListFilter(tenantId, filters);
    const orders = await this.purchaseOrderModel
      .find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(APP.csv.exportMaxRows)
      .lean();

    if (exportType === 'detail') {
      return this.buildPurchaseOrderDetailCsv(tenantId, orders);
    }

    return this.buildPurchaseOrderSummaryCsv(tenantId, orders);
  }

  async getById(tenantId: string, id: string): Promise<PurchaseOrderView> {
    this.logger.step('PurchaseOrdersService.getById', { tenantId, id });

    const purchaseOrder = await this.findByIdInTenant(tenantId, id);
    if (!purchaseOrder) {
      throw new AppError(ERRORS.PO.NOT_FOUND);
    }

    const items = await this.purchaseOrderItemModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      purchase_order_id: purchaseOrder._id,
    });

    return {
      ...this.toResponse(purchaseOrder),
      items: items.map((item) => this.toItemResponse(item)),
    };
  }

  private async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<PurchaseOrderDocument | null> {
    return this.purchaseOrderModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
  }

  private async assertSupplierExists(
    tenantId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.suppliersService.findByIdInTenant(
      tenantId,
      supplierId,
    );
    if (!supplier) {
      throw new AppError(ERRORS.SUPPLIER.NOT_FOUND);
    }
  }

  private async validateItems(
    tenantId: string,
    items: PurchaseOrderItemInputDto[],
  ): Promise<void> {
    if (items.length === 0) {
      throw new AppError(ERRORS.PO.NO_ITEMS);
    }

    const productIds = new Set<string>();
    for (const item of items) {
      if (productIds.has(item.productId)) {
        throw new AppError(ERRORS.COMMON.VALIDATION_FAILED, {
          message: 'Duplicate product in purchase order items',
        });
      }
      productIds.add(item.productId);

      const product = await this.productsService.findByIdInTenant(
        tenantId,
        item.productId,
      );
      if (!product) {
        throw new AppError(ERRORS.PRODUCT.NOT_FOUND, {
          details: { productId: item.productId },
        });
      }
    }
  }

  private calculateTotalAmount(items: PurchaseOrderItemInputDto[]): number {
    return items.reduce(
      (sum, item) => sum + item.quantity * item.costPrice,
      0,
    );
  }

  private async generatePoNumber(
    tenantId: string,
    session: ClientSession,
  ): Promise<string> {
    const count = await this.purchaseOrderModel.countDocuments(
      { tenant_id: new Types.ObjectId(tenantId) },
      { session },
    );
    return `PO${String(count + 1).padStart(4, '0')}`;
  }

  private lockKey(tenantId: string, poId: string): string {
    return this.redisService.tenantKey(tenantId, 'lock:po', poId);
  }

  private async withPoLock<T>(
    tenantId: string,
    poId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = this.lockKey(tenantId, poId);
    const handle = await acquireLockWithRetry(
      this.redisService,
      key,
      APP.redis.lock.poTtlSeconds,
    );

    if (!handle) {
      throw new AppError(ERRORS.PO.LOCK_ACQUISITION_FAILED);
    }

    try {
      return await fn();
    } finally {
      await this.redisService.releaseLock(handle);
    }
  }

  private toResponse(purchaseOrder: PurchaseOrderDocument): PurchaseOrderView {
    return {
      id: purchaseOrder._id.toString(),
      po_number: purchaseOrder.po_number,
      supplierId: purchaseOrder.supplier_id.toString(),
      status: purchaseOrder.status,
      total_amount: purchaseOrder.total_amount,
      expected_date: purchaseOrder.expected_date,
      cancel_reason: purchaseOrder.cancel_reason,
      created_at: purchaseOrder.created_at,
      updated_at: purchaseOrder.updated_at,
    };
  }

  private toItemResponse(item: PurchaseOrderItemDocument): PurchaseOrderItemView {
    return {
      id: item._id.toString(),
      productId: item.product_id.toString(),
      quantity: item.quantity,
      received_quantity: item.received_quantity,
      cost_price: item.cost_price,
      remaining_quantity: item.quantity - item.received_quantity,
    };
  }

  private buildListFilter(
    tenantId: string,
    filters: PurchaseOrderListFilters,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (filters.status) {
      filter.status = filters.status;
    }
    if (filters.supplierId) {
      filter.supplier_id = new Types.ObjectId(filters.supplierId);
    }
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) {
        createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        createdAt.$lte = new Date(filters.to);
      }
      filter.created_at = createdAt;
    }

    return filter;
  }

  private async loadSupplierMap(
    tenantId: string,
    supplierIds: string[],
  ): Promise<Map<string, SupplierDocument>> {
    const uniqueIds = [...new Set(supplierIds.filter(Boolean))];
    const map = new Map<string, SupplierDocument>();

    if (uniqueIds.length === 0) {
      return map;
    }

    const suppliers = await this.supplierModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
      is_deleted: false,
    });

    for (const supplier of suppliers) {
      map.set(supplier._id.toString(), supplier);
    }

    return map;
  }

  private async loadProductMap(
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, ProductDocument>> {
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    const map = new Map<string, ProductDocument>();

    if (uniqueIds.length === 0) {
      return map;
    }

    const products = await this.productModel.find({
      tenant_id: new Types.ObjectId(tenantId),
      _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
      is_deleted: false,
    });

    for (const product of products) {
      map.set(product._id.toString(), product);
    }

    return map;
  }

  private async buildPurchaseOrderSummaryCsv(
    tenantId: string,
    orders: Array<
      PurchaseOrder & {
        _id: Types.ObjectId;
        created_at?: Date;
        updated_at?: Date;
        supplier_id: Types.ObjectId;
      }
    >,
  ): Promise<string> {
    const supplierIds = orders.map((order) => order.supplier_id.toString());
    const supplierMap = await this.loadSupplierMap(tenantId, supplierIds);

    const rows = orders.map((order) => {
      const supplier = supplierMap.get(order.supplier_id.toString());

      return [
        order.po_number,
        supplier?.name ?? '',
        supplier?.phone ?? '',
        order.status,
        order.total_amount,
        order.expected_date?.toISOString().slice(0, 10) ?? '',
        order.cancel_reason ?? '',
        order.created_at?.toISOString() ?? '',
        order.updated_at?.toISOString() ?? '',
      ];
    });

    return buildCsv([...PO_SUMMARY_CSV_HEADERS], rows);
  }

  private async buildPurchaseOrderDetailCsv(
    tenantId: string,
    orders: Array<
      PurchaseOrder & {
        _id: Types.ObjectId;
        created_at?: Date;
        po_number: string;
        status: PoStatus;
        supplier_id: Types.ObjectId;
      }
    >,
  ): Promise<string> {
    if (orders.length === 0) {
      return buildCsv([...PO_DETAIL_CSV_HEADERS], []);
    }

    const tenantObjectId = new Types.ObjectId(tenantId);
    const orderIds = orders.map((order) => order._id);
    const orderMap = new Map(
      orders.map((order) => [order._id.toString(), order]),
    );

    const items = await this.purchaseOrderItemModel
      .find({
        tenant_id: tenantObjectId,
        purchase_order_id: { $in: orderIds },
      })
      .sort({ created_at: -1, _id: -1 })
      .limit(APP.csv.exportMaxRows)
      .lean();

    const supplierIds = orders.map((order) => order.supplier_id.toString());
    const productIds = items.map((item) => item.product_id.toString());

    const [supplierMap, productMap] = await Promise.all([
      this.loadSupplierMap(tenantId, supplierIds),
      this.loadProductMap(tenantId, productIds),
    ]);

    const rows = items.map((item) => {
      const order = orderMap.get(item.purchase_order_id.toString());
      const supplier = order
        ? supplierMap.get(order.supplier_id.toString())
        : undefined;
      const product = productMap.get(item.product_id.toString());
      const remaining = item.quantity - item.received_quantity;

      return [
        order?.po_number ?? '',
        supplier?.name ?? '',
        order?.status ?? '',
        product?.sku ?? '',
        product?.name ?? '',
        item.quantity,
        item.received_quantity,
        remaining,
        item.cost_price,
        item.quantity * item.cost_price,
        order?.created_at?.toISOString() ?? '',
      ];
    });

    return buildCsv([...PO_DETAIL_CSV_HEADERS], rows);
  }
}
