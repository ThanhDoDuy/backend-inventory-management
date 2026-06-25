import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import { InvoiceStatus } from '../../shared/constants/business.enums';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { InvoiceItem, InvoiceItemDocument } from '../invoices/schemas/invoice-item.schema';
import {
  InventoryBalance,
  InventoryBalanceDocument,
} from '../inventory/schemas/inventory-balance.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Setting, SettingDocument } from '../settings/schemas/setting.schema';
import {
  APP,
  dashboardCacheKey,
  ReportType,
} from '../../shared/constants/app.constants';

interface DateRange {
  from?: string;
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceItem.name)
    private invoiceItemModel: Model<InvoiceItemDocument>,
    @InjectModel(InventoryBalance.name)
    private balanceModel: Model<InventoryBalanceDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    private redisService: RedisService,
    private auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async getDashboard(tenantId: string, userId: string) {
    const cacheKey = dashboardCacheKey(tenantId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const tenantObjectId = new Types.ObjectId(tenantId);
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      revenueToday,
      revenueMonth,
      ordersToday,
      productsSoldToday,
      lowStockCount,
      topProducts,
    ] = await Promise.all([
      this.sumRevenue(tenantObjectId, startOfToday, now),
      this.sumRevenue(tenantObjectId, startOfMonth, now),
      this.countPaidInvoices(tenantObjectId, startOfToday, now),
      this.sumProductsSold(tenantObjectId, startOfToday, now),
      this.countLowStock(tenantId),
      this.getTopProducts(tenantId, { limit: 5 }),
    ]);

    const dashboard = {
      revenue_today: revenueToday,
      revenue_month: revenueMonth,
      orders_today: ordersToday,
      products_sold_today: productsSoldToday,
      low_stock_count: lowStockCount,
      top_products: topProducts,
      generated_at: now.toISOString(),
    };

    await this.redisService.set(
      cacheKey,
      JSON.stringify(dashboard),
      APP.report.cacheTtlSeconds,
    );

    this.auditService.emit({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.VIEW_REPORT,
      module: AUDIT_MODULES.REPORT,
      metadata: { report: 'dashboard' },
    });

    return dashboard;
  }

  async getRevenue(tenantId: string, range: DateRange) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const { fromDate, toDate } = this.resolveRange(range);

    const [total, daily] = await Promise.all([
      this.sumRevenue(tenantObjectId, fromDate, toDate),
      this.invoiceModel.aggregate([
        {
          $match: {
            tenant_id: tenantObjectId,
            status: InvoiceStatus.PAID,
            is_deleted: false,
            created_at: { $gte: fromDate, $lte: toDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      total_revenue: total,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      daily,
    };
  }

  async getTopProducts(tenantId: string, options?: { limit?: number } & DateRange) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const limit = options?.limit && options.limit > 0 ? options.limit : 10;
    const { fromDate, toDate } = this.resolveRange(options ?? {});

    const rows = await this.invoiceItemModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          created_at: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $lookup: {
          from: 'invoices',
          localField: 'invoice_id',
          foreignField: '_id',
          as: 'invoice',
        },
      },
      { $unwind: '$invoice' },
      {
        $match: {
          'invoice.status': InvoiceStatus.PAID,
          'invoice.is_deleted': false,
        },
      },
      {
        $group: {
          _id: '$product_id',
          quantity_sold: { $sum: '$quantity' },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { quantity_sold: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          product_id: '$_id',
          product_name: '$product.name',
          sku: '$product.sku',
          quantity_sold: 1,
          revenue: 1,
        },
      },
    ]);

    return rows;
  }

  async getLowStock(tenantId: string) {
    const tenantObjectId = new Types.ObjectId(tenantId);

    const rows = await this.productModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          is_deleted: false,
          status: 'ACTIVE',
        },
      },
      {
        $lookup: {
          from: 'inventory_balances',
          let: { productId: '$_id', tenantId: '$tenant_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$product_id', '$$productId'] },
                    { $eq: ['$tenant_id', '$$tenantId'] },
                  ],
                },
              },
            },
          ],
          as: 'balance',
        },
      },
      {
        $addFields: {
          available_quantity: {
            $ifNull: [{ $arrayElemAt: ['$balance.available_quantity', 0] }, 0],
          },
        },
      },
      {
        $match: {
          $expr: { $lte: ['$available_quantity', '$minimum_stock'] },
        },
      },
      {
        $project: {
          product_id: '$_id',
          name: 1,
          sku: 1,
          minimum_stock: 1,
          available_quantity: 1,
        },
      },
      { $sort: { available_quantity: 1 } },
    ]);

    return rows;
  }

  async getDeadStock(
    tenantId: string,
    inactiveDays = 30,
    page = 1,
    limit = 10,
  ) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);

    const soldProductIds = await this.invoiceItemModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          created_at: { $gte: cutoff },
        },
      },
      {
        $lookup: {
          from: 'invoices',
          localField: 'invoice_id',
          foreignField: '_id',
          as: 'invoice',
        },
      },
      { $unwind: '$invoice' },
      {
        $match: {
          'invoice.status': InvoiceStatus.PAID,
          'invoice.is_deleted': false,
        },
      },
      { $group: { _id: '$product_id' } },
    ]);

    const soldIds = soldProductIds.map((row) => row._id);
    const safePage = page > 0 ? page : 1;
    const safeLimit = limit > 0 ? Math.min(limit, 100) : 10;
    const skip = (safePage - 1) * safeLimit;

    const [result] = await this.productModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          is_deleted: false,
          status: 'ACTIVE',
          _id: { $nin: soldIds },
        },
      },
      {
        $lookup: {
          from: 'inventory_balances',
          let: { productId: '$_id', tenantId: '$tenant_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$product_id', '$$productId'] },
                    { $eq: ['$tenant_id', '$$tenantId'] },
                  ],
                },
              },
            },
          ],
          as: 'balance',
        },
      },
      {
        $addFields: {
          available_quantity: {
            $ifNull: [{ $arrayElemAt: ['$balance.available_quantity', 0] }, 0],
          },
          stock_value: {
            $multiply: [
              { $ifNull: [{ $arrayElemAt: ['$balance.available_quantity', 0] }, 0] },
              '$cost_price',
            ],
          },
        },
      },
      {
        $match: {
          available_quantity: { $gt: 0 },
        },
      },
      {
        $project: {
          product_id: '$_id',
          name: 1,
          sku: 1,
          available_quantity: 1,
          stock_value: 1,
          inactive_days: inactiveDays,
        },
      },
      {
        $facet: {
          items: [
            { $sort: { stock_value: -1 } },
            { $skip: skip },
            { $limit: safeLimit },
          ],
          summary: [
            {
              $group: {
                _id: null,
                total_items: { $sum: 1 },
                total_value: { $sum: '$stock_value' },
              },
            },
          ],
        },
      },
    ]);

    const items = result?.items ?? [];
    const summaryRow = result?.summary?.[0] ?? {
      total_items: 0,
      total_value: 0,
    };
    const total = summaryRow.total_items ?? 0;

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: total > 0 ? Math.ceil(total / safeLimit) : 0,
      },
      summary: {
        total_items: total,
        total_value: summaryRow.total_value ?? 0,
      },
    };
  }

  private async getDeadStockRowsForExport(
    tenantId: string,
    inactiveDays: number,
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.getDeadStock(
      tenantId,
      inactiveDays,
      1,
      APP.csv.exportMaxRows,
    );
    return result.items as Array<Record<string, unknown>>;
  }

  async exportCsv(
    tenantId: string,
    userId: string,
    type: ReportType,
    range: DateRange,
    inactiveDays?: number,
  ): Promise<string> {
    let rows: Array<Record<string, unknown>> = [];
    let header = '';

    switch (type) {
      case APP.report.types.REVENUE: {
        const revenue = await this.getRevenue(tenantId, range);
        header = 'date,revenue,orders';
        rows = revenue.daily.map((row) => ({
          date: row._id,
          revenue: row.revenue,
          orders: row.orders,
        }));
        break;
      }
      case APP.report.types.TOP_PRODUCTS: {
        header = 'product_id,product_name,sku,quantity_sold,revenue';
        rows = await this.getTopProducts(tenantId, range);
        break;
      }
      case APP.report.types.LOW_STOCK: {
        header = 'product_id,name,sku,available_quantity,minimum_stock';
        rows = await this.getLowStock(tenantId);
        break;
      }
      case APP.report.types.DEAD_STOCK: {
        header =
          'product_id,name,sku,available_quantity,stock_value,inactive_days';
        rows = await this.getDeadStockRowsForExport(
          tenantId,
          inactiveDays ?? 30,
        );
        break;
      }
      default:
        header = 'message';
        rows = [{ message: 'Unsupported report type' }];
    }

    this.auditService.emit({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.EXPORT_REPORT,
      module: AUDIT_MODULES.REPORT,
      metadata: { type, ...range },
    });

    const csvRows = rows.map((row) =>
      Object.values(row)
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );

    return [header, ...csvRows].join('\n');
  }

  private async sumRevenue(
    tenantObjectId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<number> {
    const [result] = await this.invoiceModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          status: InvoiceStatus.PAID,
          is_deleted: false,
          created_at: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    return result?.total ?? 0;
  }

  private async countPaidInvoices(
    tenantObjectId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.invoiceModel.countDocuments({
      tenant_id: tenantObjectId,
      status: InvoiceStatus.PAID,
      is_deleted: false,
      created_at: { $gte: from, $lte: to },
    });
  }

  private async sumProductsSold(
    tenantObjectId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<number> {
    const [result] = await this.invoiceItemModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          created_at: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: 'invoices',
          localField: 'invoice_id',
          foreignField: '_id',
          as: 'invoice',
        },
      },
      { $unwind: '$invoice' },
      {
        $match: {
          'invoice.status': InvoiceStatus.PAID,
          'invoice.is_deleted': false,
        },
      },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);

    return result?.total ?? 0;
  }

  private async countLowStock(tenantId: string): Promise<number> {
    const rows = await this.getLowStock(tenantId);
    return rows.length;
  }

  private resolveRange(range: DateRange): { fromDate: Date; toDate: Date } {
    const toDate = range.to ? new Date(range.to) : new Date();
    const fromDate = range.from
      ? new Date(range.from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    return { fromDate, toDate };
  }

  async getTaxS1aHkd(tenantId: string, year: number) {
    this.logger.step('ReportsService.getTaxS1aHkd', { tenantId, year });

    const tenantObjectId = new Types.ObjectId(tenantId);
    const startOfYear = new Date(year, 0, 1);
    const startOfNextYear = new Date(year + 1, 0, 1);

    const taxSettings = await this.settingModel
      .find({ tenant_id: tenantObjectId, group: 'TAX', is_active: true })
      .lean();

    const getSetting = (key: string, fallback = '') =>
      taxSettings.find((s) => s.key === key)?.value ?? fallback;

    const group1Label = getSetting('tax.revenue_group_1_label', 'Bán hàng doanh nghiệp');
    const group2Label = getSetting('tax.revenue_group_2_label', 'Bán hàng khách vãng lai');
    const group1Types = new Set(
      getSetting('tax.revenue_group_1_types', 'COMPANY,GROUP').split(',').map((t) => t.trim()),
    );
    const group2Types = new Set(
      getSetting('tax.revenue_group_2_types', 'INDIVIDUAL,NONE').split(',').map((t) => t.trim()),
    );

    const rawRows = await this.invoiceModel.aggregate([
      {
        $match: {
          tenant_id: tenantObjectId,
          status: InvoiceStatus.PAID,
          is_deleted: false,
          created_at: { $gte: startOfYear, $lt: startOfNextYear },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $addFields: {
          customer_type: {
            $cond: {
              if: { $gt: [{ $size: '$customer' }, 0] },
              then: { $arrayElemAt: ['$customer.customer_type', 0] },
              else: 'NONE',
            },
          },
          date_str: {
            $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: '+07:00' },
          },
        },
      },
      {
        $group: {
          _id: { date: '$date_str', customer_type: '$customer_type' },
          count: { $sum: 1 },
          amount: { $sum: '$total' },
        },
      },
      { $sort: { '_id.date': 1, '_id.customer_type': 1 } },
    ]);

    // Map customer_type → group label, then merge rows with the same (date, label)
    const mergedMap = new Map<string, { date: string; label: string; count: number; amount: number }>();
    for (const row of rawRows) {
      const customerType: string = row._id.customer_type;
      const label = group1Types.has(customerType) ? group1Label : group2Label;
      const key = `${row._id.date}||${label}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.count += row.count;
        existing.amount += row.amount;
      } else {
        mergedMap.set(key, { date: row._id.date, label, count: row.count, amount: row.amount });
      }
    }

    const rows = Array.from(mergedMap.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.label === group1Label && b.label !== group1Label) return -1;
      if (a.label !== group1Label && b.label === group1Label) return 1;
      return 0;
    });

    const total = rows.reduce((sum, r) => sum + r.amount, 0);

    return {
      header: {
        business_name: getSetting('tax.business_name'),
        tax_code: getSetting('tax.tax_code'),
        business_location: getSetting('tax.business_location'),
        period: String(year),
      },
      rows,
      total,
    };
  }
}
