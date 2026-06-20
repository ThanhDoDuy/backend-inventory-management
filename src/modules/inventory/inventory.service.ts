import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  Connection,
  Model,
  Types,
} from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { DomainEventPublisher } from '../../infrastructure/queue/domain-event.publisher';
import { APP } from '../../shared/constants/app.constants';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppError, ERRORS } from '../../shared/errors';
import { buildCsv } from '../../shared/utils/csv.util';
import { applySearchTextFilter } from '../../shared/utils/search.util';
import { acquireLockWithRetry } from '../../shared/utils/redis-lock.util';
import { ProductsService } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { ProductStatus } from '../../shared/constants/business.enums';
import { SettingsService } from '../settings/settings.service';
import {
  AdjustmentReason,
  InventoryReferenceType,
  InventoryTransactionType,
} from './constants/inventory.enums';
import { AdjustmentDto } from './dto/inventory.dto';
import {
  InventoryBalance,
  InventoryBalanceDocument,
} from '../inventory/schemas/inventory-balance.schema';
import {
  InventoryTransaction,
  InventoryTransactionDocument,
} from './schemas/inventory-transaction.schema';

interface ApplyMovementParams {
  tenantId: string;
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  referenceType: InventoryReferenceType;
  referenceId: string;
  userId: string;
  note?: string;
  session: ClientSession;
}

export interface InventoryBalanceView {
  productId: string;
  available_quantity: number;
  reserved_quantity: number;
}

export interface InventoryTransactionView {
  id: string;
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  balance_after: number;
  reference_type: InventoryReferenceType;
  reference_id: string;
  note: string;
  created_at?: Date;
  created_by: string;
}

export interface ListTransactionsResult {
  items: InventoryTransactionView[];
  total: number;
  page: number;
  limit: number;
}

export interface RebuildResult {
  products_rebuilt: number;
}

const BALANCE_CSV_HEADERS = [
  'product_sku',
  'product_name',
  'category_name',
  'available_quantity',
  'reserved_quantity',
  'minimum_stock',
  'cost_price',
  'retail_price',
  'status',
] as const;

const TRANSACTION_CSV_HEADERS = [
  'created_at',
  'type',
  'product_sku',
  'product_name',
  'quantity',
  'balance_after',
  'reference_type',
  'reference_id',
  'note',
  'created_by',
] as const;

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryTransaction.name)
    private transactionModel: Model<InventoryTransactionDocument>,
    @InjectModel(InventoryBalance.name)
    private balanceModel: Model<InventoryBalanceDocument>,
    @InjectModel(Product.name)
    private productModel: Model<ProductDocument>,
    @InjectConnection() private connection: Connection,
    private productsService: ProductsService,
    private settingsService: SettingsService,
    private redisService: RedisService,
    private domainEventPublisher: DomainEventPublisher,
    private readonly logger: AppLoggerService,
  ) {}

  async stockIn(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceType: InventoryReferenceType,
    referenceId: string,
    userId: string,
    session?: ClientSession,
  ): Promise<InventoryTransactionDocument> {
    this.logger.step('InventoryService.stockIn', {
      tenantId,
      productId,
      quantity,
      referenceType,
      referenceId,
    });

    if (quantity <= 0) {
      throw new AppError(ERRORS.INVENTORY.INVALID_QUANTITY, {
        message: 'Stock in quantity must be greater than zero',
      });
    }

    return this.withProductLock(tenantId, productId, () =>
      this.runWithOptionalSession(session, async (activeSession) => {
        await this.assertProductExists(tenantId, productId);
        return this.applyMovement(
          {
            tenantId,
            productId,
            type: InventoryTransactionType.IN,
            quantity,
            referenceType,
            referenceId,
            userId,
            session: activeSession,
          },
          activeSession,
        );
      }),
    );
  }

  async stockOut(
    tenantId: string,
    productId: string,
    quantity: number,
    referenceType: InventoryReferenceType,
    referenceId: string,
    userId: string,
    session?: ClientSession,
    options?: {
      skipProductExistsCheck?: boolean;
      allowNegativeStock?: boolean;
    },
  ): Promise<InventoryTransactionDocument> {
    this.logger.step('InventoryService.stockOut', {
      tenantId,
      productId,
      quantity,
      referenceType,
      referenceId,
    });

    if (quantity <= 0) {
      throw new AppError(ERRORS.INVENTORY.INVALID_QUANTITY, {
        message: 'Stock out quantity must be greater than zero',
      });
    }

    return this.withProductLock(tenantId, productId, () =>
      this.runWithOptionalSession(session, async (activeSession) => {
        if (!options?.skipProductExistsCheck) {
          await this.assertProductExists(tenantId, productId);
        }
        const allowNegative =
          options?.allowNegativeStock ??
          (await this.settingsService.getBoolean(
            tenantId,
            'inventory.allow_negative_stock',
            false,
          ));
        return this.applyMovement(
          {
            tenantId,
            productId,
            type: InventoryTransactionType.OUT,
            quantity,
            referenceType,
            referenceId,
            userId,
            session: activeSession,
          },
          activeSession,
          allowNegative,
        );
      }),
    );
  }

  async adjust(
    tenantId: string,
    dto: AdjustmentDto,
    userId: string,
  ): Promise<InventoryTransactionView> {
    this.logger.step('InventoryService.adjust', {
      tenantId,
      productId: dto.productId,
      quantity: dto.quantity,
      reason: dto.reason,
    });

    const referenceId = new Types.ObjectId().toString();
    const note = this.buildAdjustmentNote(dto.reason, dto.note);

    const transaction = await this.withProductLock(
      tenantId,
      dto.productId,
      () =>
        this.runInTransaction(async (session) => {
          await this.assertProductExists(tenantId, dto.productId);
          const allowNegative = await this.settingsService.getBoolean(
            tenantId,
            'inventory.allow_negative_stock',
            false,
          );
          return this.applyMovement(
            {
              tenantId,
              productId: dto.productId,
              type: InventoryTransactionType.ADJUST,
              quantity: dto.quantity,
              referenceType: InventoryReferenceType.MANUAL,
              referenceId,
              userId,
              note,
              session,
            },
            session,
            allowNegative,
          );
        }),
    );

    void this.checkLowStockAlert(tenantId, dto.productId);
    return this.toTransactionView(transaction);
  }

  async checkLowStockAlerts(
    tenantId: string,
    productIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    const enabled = await this.settingsService.isFeatureEnabled(
      tenantId,
      'enable_low_stock_alert',
      true,
    );
    if (!enabled) {
      return;
    }

    const [productMap, balanceMap, defaultThreshold] = await Promise.all([
      this.productsService.findManyByIdsInTenant(tenantId, uniqueIds),
      this.getBalanceMap(tenantId, uniqueIds),
      this.settingsService.getNumber(
        tenantId,
        'inventory.low_stock_threshold',
        20,
      ),
    ]);

    for (const productId of uniqueIds) {
      const product = productMap.get(productId);
      if (!product) {
        continue;
      }

      const availableQuantity = balanceMap.get(productId) ?? 0;
      const minimumStock =
        product.minimum_stock > 0 ? product.minimum_stock : defaultThreshold;

      if (availableQuantity > minimumStock) {
        continue;
      }

      await this.domainEventPublisher.publish({
        type: APP.queue.domainEvents.INVENTORY_LOW_STOCK,
        tenantId,
        data: {
          productId,
          productName: product.name,
          availableQuantity,
          minimumStock,
        },
      });
    }
  }

  async checkLowStockAlert(tenantId: string, productId: string): Promise<void> {
    const enabled = await this.settingsService.isFeatureEnabled(
      tenantId,
      'enable_low_stock_alert',
      true,
    );
    if (!enabled) {
      return;
    }

    const product = await this.productsService.findByIdInTenant(
      tenantId,
      productId,
    );
    if (!product) {
      return;
    }

    const balance = await this.balanceModel
      .findOne({
        tenant_id: new Types.ObjectId(tenantId),
        product_id: new Types.ObjectId(productId),
      })
      .lean();

    const availableQuantity = balance?.available_quantity ?? 0;
    let minimumStock = product.minimum_stock;
    if (minimumStock <= 0) {
      minimumStock = await this.settingsService.getNumber(
        tenantId,
        'inventory.low_stock_threshold',
        20,
      );
    }

    if (availableQuantity > minimumStock) {
      return;
    }

    await this.domainEventPublisher.publish({
      type: APP.queue.domainEvents.INVENTORY_LOW_STOCK,
      tenantId,
      data: {
        productId,
        productName: product.name,
        availableQuantity,
        minimumStock,
      },
    });
  }

  async getBalanceMap(
    tenantId: string,
    productIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    const map = new Map<string, number>();

    if (uniqueIds.length === 0) {
      return map;
    }

    const balances = await this.balanceModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        product_id: {
          $in: uniqueIds.map((productId) => new Types.ObjectId(productId)),
        },
      })
      .select('product_id available_quantity')
      .lean();

    for (const balance of balances) {
      map.set(balance.product_id.toString(), balance.available_quantity);
    }

    return map;
  }

  async getBalance(
    tenantId: string,
    productId?: string,
  ): Promise<InventoryBalanceView | InventoryBalanceView[]> {
    this.logger.step('InventoryService.getBalance', { tenantId, productId });

    const tenantObjectId = new Types.ObjectId(tenantId);

    if (productId) {
      const balance = await this.balanceModel
        .findOne({
          tenant_id: tenantObjectId,
          product_id: new Types.ObjectId(productId),
        })
        .lean();

      return {
        productId,
        available_quantity: balance?.available_quantity ?? 0,
        reserved_quantity: balance?.reserved_quantity ?? 0,
      };
    }

    const balances = await this.balanceModel
      .find({ tenant_id: tenantObjectId })
      .sort({ product_id: 1 })
      .lean();

    return balances.map((balance) => ({
      productId: balance.product_id.toString(),
      available_quantity: balance.available_quantity,
      reserved_quantity: balance.reserved_quantity,
    }));
  }

  async listTransactions(
    tenantId: string,
    filters: {
      productId?: string;
      type?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<ListTransactionsResult> {
    this.logger.step('InventoryService.listTransactions', {
      tenantId,
      ...filters,
    });

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const query = this.buildTransactionListQuery(tenantId, filters);

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      items: items.map((item) => this.toTransactionView(item)),
      total,
      page,
      limit,
    };
  }

  async exportBalancesCsv(
    tenantId: string,
    filters: {
      search?: string;
      category_id?: string;
      status?: ProductStatus;
      low_stock_only?: boolean;
    },
  ): Promise<string> {
    this.logger.step('InventoryService.exportBalancesCsv', { tenantId, ...filters });

    const tenantObjectId = new Types.ObjectId(tenantId);
    const productFilter = this.buildProductExportFilter(tenantId, filters);
    const products = await this.productModel
      .find(productFilter)
      .populate('category_id', 'name')
      .sort({ sku: 1 })
      .limit(APP.csv.exportMaxRows);

    const balances = await this.balanceModel
      .find({ tenant_id: tenantObjectId })
      .select('product_id available_quantity reserved_quantity')
      .lean();
    const balanceMap = new Map(
      balances.map((balance) => [balance.product_id.toString(), balance]),
    );

    const rows: unknown[][] = [];
    for (const product of products) {
      const balance = balanceMap.get(product._id.toString());
      const available = balance?.available_quantity ?? 0;
      const reserved = balance?.reserved_quantity ?? 0;

      if (filters.low_stock_only && available > product.minimum_stock) {
        continue;
      }

      const category = product.populated('category_id')
        ? (product.category_id as unknown as { name?: string })
        : null;

      rows.push([
        product.sku,
        product.name,
        category?.name ?? '',
        available,
        reserved,
        product.minimum_stock,
        product.cost_price,
        product.selling_price,
        product.status,
      ]);
    }

    return buildCsv([...BALANCE_CSV_HEADERS], rows);
  }

  async exportTransactionsCsv(
    tenantId: string,
    filters: {
      productId?: string;
      type?: string;
      from?: string;
      to?: string;
    },
  ): Promise<string> {
    this.logger.step('InventoryService.exportTransactionsCsv', {
      tenantId,
      ...filters,
    });

    const query = this.buildTransactionListQuery(tenantId, filters);
    const transactions = await this.transactionModel
      .find(query)
      .sort({ created_at: -1, _id: -1 })
      .limit(APP.csv.exportMaxRows)
      .lean();

    const productIds = transactions.map((item) => item.product_id.toString());
    const productMap = await this.productsService.findManyByIdsInTenant(
      tenantId,
      productIds,
    );

    const rows = transactions.map((transaction) => {
      const product = productMap.get(transaction.product_id.toString());

      return [
        transaction.created_at?.toISOString() ?? '',
        transaction.type,
        product?.sku ?? '',
        product?.name ?? '',
        transaction.quantity,
        transaction.balance_after,
        transaction.reference_type,
        transaction.reference_id,
        transaction.note ?? '',
        transaction.created_by.toString(),
      ];
    });

    return buildCsv([...TRANSACTION_CSV_HEADERS], rows);
  }

  async rebuild(tenantId: string): Promise<RebuildResult> {
    this.logger.step('InventoryService.rebuild', { tenantId });

    const tenantObjectId = new Types.ObjectId(tenantId);

    const aggregated = await this.transactionModel.aggregate<{
      _id: Types.ObjectId;
      available_quantity: number;
    }>([
      {
        $match: {
          tenant_id: tenantObjectId,
          is_deleted: false,
        },
      },
      { $sort: { created_at: 1, _id: 1 } },
      {
        $group: {
          _id: '$product_id',
          available_quantity: { $last: '$balance_after' },
        },
      },
    ]);

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      await this.balanceModel.deleteMany(
        { tenant_id: tenantObjectId },
        { session },
      );

      if (aggregated.length > 0) {
        await this.balanceModel.insertMany(
          aggregated.map((row) => ({
            tenant_id: tenantObjectId,
            product_id: row._id,
            available_quantity: row.available_quantity,
            reserved_quantity: 0,
            updated_at: new Date(),
            version: 1,
          })),
          { session },
        );
      }

      await session.commitTransaction();

      this.logger.step('InventoryService.rebuild.completed', {
        tenantId,
        products_rebuilt: aggregated.length,
      });

      return { products_rebuilt: aggregated.length };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async applyMovement(
    params: ApplyMovementParams,
    session: ClientSession,
    allowNegativeStock = true,
  ): Promise<InventoryTransactionDocument> {
    const tenantObjectId = new Types.ObjectId(params.tenantId);
    const productObjectId = new Types.ObjectId(params.productId);
    const userObjectId = new Types.ObjectId(params.userId);

    const currentBalance = await this.balanceModel
      .findOne({
        tenant_id: tenantObjectId,
        product_id: productObjectId,
      })
      .session(session)
      .lean();

    const currentQty = currentBalance?.available_quantity ?? 0;
    const delta = this.computeDelta(params.type, params.quantity);
    const newBalance = currentQty + delta;

    if (
      !allowNegativeStock &&
      params.type === InventoryTransactionType.OUT &&
      newBalance < 0
    ) {
      throw new AppError(ERRORS.INVENTORY.INSUFFICIENT_STOCK, {
        details: {
          productId: params.productId,
          available_quantity: currentQty,
          requested: params.quantity,
        },
      });
    }

    if (
      !allowNegativeStock &&
      params.type === InventoryTransactionType.ADJUST &&
      newBalance < 0
    ) {
      throw new AppError(ERRORS.INVENTORY.INSUFFICIENT_STOCK, {
        details: {
          productId: params.productId,
          available_quantity: currentQty,
          adjustment: params.quantity,
        },
      });
    }

    let transaction: InventoryTransactionDocument;

    try {
      const [created] = await this.transactionModel.create(
        [
          {
            tenant_id: tenantObjectId,
            product_id: productObjectId,
            type: params.type,
            quantity: params.quantity,
            balance_after: newBalance,
            reference_type: params.referenceType,
            reference_id: params.referenceId,
            note: params.note ?? '',
            created_by: userObjectId,
            modified_by: userObjectId,
            is_deleted: false,
            version: 1,
          },
        ],
        { session, ordered: true },
      );
      transaction = created;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppError(ERRORS.INVENTORY.DUPLICATE_TRANSACTION);
      }
      throw error;
    }

    await this.balanceModel.findOneAndUpdate(
      {
        tenant_id: tenantObjectId,
        product_id: productObjectId,
      },
      {
        $set: {
          available_quantity: newBalance,
          updated_at: new Date(),
        },
        $setOnInsert: {
          tenant_id: tenantObjectId,
          product_id: productObjectId,
          reserved_quantity: 0,
          version: 1,
        },
      },
      { upsert: true, session, returnDocument: 'after' },
    );

    return transaction;
  }

  private computeDelta(
    type: InventoryTransactionType,
    quantity: number,
  ): number {
    if (type === InventoryTransactionType.IN) {
      return quantity;
    }
    if (type === InventoryTransactionType.OUT) {
      return -quantity;
    }
    return quantity;
  }

  private async assertProductExists(
    tenantId: string,
    productId: string,
  ): Promise<void> {
    const product = await this.productsService.findByIdInTenant(
      tenantId,
      productId,
    );

    if (!product) {
      throw new AppError(ERRORS.INVENTORY.PRODUCT_NOT_FOUND);
    }
  }

  private lockKey(tenantId: string, productId: string): string {
    return this.redisService.tenantKey(tenantId, 'lock:inventory', productId);
  }

  private async withProductLock<T>(
    tenantId: string,
    productId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = this.lockKey(tenantId, productId);
    const handle = await acquireLockWithRetry(
      this.redisService,
      key,
      APP.redis.lock.inventoryTtlSeconds,
    );

    if (!handle) {
      throw new AppError(ERRORS.INVENTORY.LOCK_ACQUISITION_FAILED);
    }

    try {
      return await fn();
    } finally {
      await this.redisService.releaseLock(handle);
    }
  }

  private async runWithOptionalSession<T>(
    session: ClientSession | undefined,
    fn: (activeSession: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (session) {
      return fn(session);
    }
    return this.runInTransaction(fn);
  }

  private async runInTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private buildAdjustmentNote(
    reason: AdjustmentReason,
    note?: string,
  ): string {
    if (note?.trim()) {
      return `${reason}: ${note.trim()}`;
    }
    return reason;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }

  private toTransactionView(
    transaction:
      | InventoryTransactionDocument
      | (InventoryTransaction & { _id: Types.ObjectId; created_at?: Date }),
  ): InventoryTransactionView {
    return {
      id: transaction._id.toString(),
      productId: transaction.product_id.toString(),
      type: transaction.type,
      quantity: transaction.quantity,
      balance_after: transaction.balance_after,
      reference_type: transaction.reference_type,
      reference_id: transaction.reference_id,
      note: transaction.note,
      created_at: transaction.created_at,
      created_by: transaction.created_by.toString(),
    };
  }

  private buildTransactionListQuery(
    tenantId: string,
    filters: {
      productId?: string;
      type?: string;
      from?: string;
      to?: string;
    },
  ): Record<string, unknown> {
    const query: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (filters.productId) {
      query.product_id = new Types.ObjectId(filters.productId);
    }

    if (filters.type) {
      const normalizedType = filters.type.toUpperCase();
      if (
        !Object.values(InventoryTransactionType).includes(
          normalizedType as InventoryTransactionType,
        )
      ) {
        throw new AppError(ERRORS.COMMON.VALIDATION_FAILED, {
          message: 'Invalid transaction type filter',
        });
      }
      query.type = normalizedType;
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

  private buildProductExportFilter(
    tenantId: string,
    filters: {
      search?: string;
      category_id?: string;
      status?: ProductStatus;
    },
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };

    if (filters.category_id) {
      filter.category_id = new Types.ObjectId(filters.category_id);
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    const trimmed = filters.search?.trim();
    if (trimmed) {
      applySearchTextFilter(filter, trimmed);
    }

    return filter;
  }
}
