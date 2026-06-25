import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../modules/users/users.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { InvoicesService } from '../modules/invoices/invoices.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { Invoice, InvoiceDocument } from '../modules/invoices/schemas/invoice.schema';
import { InvoiceItem, InvoiceItemDocument } from '../modules/invoices/schemas/invoice-item.schema';
import { Product, ProductDocument } from '../modules/products/schemas/product.schema';
import { Customer, CustomerDocument } from '../modules/customers/schemas/customer.schema';
import { Setting, SettingDocument } from '../modules/settings/schemas/setting.schema';
import { AdjustmentReason } from '../modules/inventory/constants/inventory.enums';
import { PaymentMethod } from '../shared/constants/business.enums';
import { DEMO_ACCOUNT } from './demo-data.constants';

interface InvoicePlan {
  date: string;
  customerEmail: string | null;
  productSku: string;
  quantity: number;
  method: PaymentMethod;
}

const INVOICE_PLANS: InvoicePlan[] = [
  // ── Jan 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-01-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 5,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-01-05', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-01-05', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 1,  method: PaymentMethod.CASH },
  { date: '2025-01-05', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 1,  method: PaymentMethod.CASH },
  { date: '2025-01-12', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 2,  method: PaymentMethod.E_WALLET },
  { date: '2025-01-12', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-EL001',  quantity: 3,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-01-20', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 2,  method: PaymentMethod.CARD },
  { date: '2025-01-20', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 1,  method: PaymentMethod.CASH },
  { date: '2025-01-28', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-01-28', customerEmail: 'group-q1@example.com',   productSku: 'SKU-PN002',  quantity: 2,  method: PaymentMethod.CARD },

  // ── Feb 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-02-03', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-02-03', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 6,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-02-10', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 5,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-02-10', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 1,  method: PaymentMethod.CASH },
  { date: '2025-02-14', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-02-14', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-02-14', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 1,  method: PaymentMethod.E_WALLET },
  { date: '2025-02-22', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 3,  method: PaymentMethod.CARD },
  { date: '2025-02-22', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 2,  method: PaymentMethod.CASH },

  // ── Mar 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-03-05', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-03-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-EL003',  quantity: 4,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-03-08', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 8,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-03-08', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-03-08', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 1,  method: PaymentMethod.CASH },
  { date: '2025-03-18', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 3,  method: PaymentMethod.E_WALLET },
  { date: '2025-03-18', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 2,  method: PaymentMethod.CARD },
  { date: '2025-03-25', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 2,  method: PaymentMethod.CARD },
  { date: '2025-03-25', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 3,  method: PaymentMethod.CASH },

  // ── Apr 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-04-05', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-04-05', customerEmail: 'group-q1@example.com',   productSku: 'SKU-SRM002', quantity: 4,  method: PaymentMethod.CARD },
  { date: '2025-04-15', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-PN002',  quantity: 4,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-04-15', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-04-15', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 3,  method: PaymentMethod.E_WALLET },
  { date: '2025-04-25', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-04-25', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-EL001',  quantity: 2,  method: PaymentMethod.BANK_TRANSFER },

  // ── May 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-05-01', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-05-01', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-05-10', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 7,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-05-10', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 2,  method: PaymentMethod.E_WALLET },
  { date: '2025-05-15', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 2,  method: PaymentMethod.CARD },
  { date: '2025-05-15', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-05-25', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-05-25', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 3,  method: PaymentMethod.CARD },

  // ── Jun 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-06-01', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 10, method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-06-01', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-06-10', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-06-10', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 4,  method: PaymentMethod.CARD },
  { date: '2025-06-15', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 4,  method: PaymentMethod.E_WALLET },
  { date: '2025-06-15', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 1,  method: PaymentMethod.CARD },
  { date: '2025-06-25', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-06-25', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 6,  method: PaymentMethod.BANK_TRANSFER },

  // ── Jul 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-07-04', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-07-04', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-PN002',  quantity: 3,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-07-15', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 6,  method: PaymentMethod.CASH },
  { date: '2025-07-15', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 3,  method: PaymentMethod.CARD },
  { date: '2025-07-20', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 3,  method: PaymentMethod.E_WALLET },
  { date: '2025-07-20', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-EL003',  quantity: 5,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-07-28', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-07-28', customerEmail: 'group-q1@example.com',   productSku: 'SKU-PN002',  quantity: 2,  method: PaymentMethod.CARD },

  // ── Aug 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-08-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 8,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-08-05', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-08-15', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-08-15', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-08-20', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 5,  method: PaymentMethod.CARD },
  { date: '2025-08-20', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 4,  method: PaymentMethod.E_WALLET },
  { date: '2025-08-28', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 2,  method: PaymentMethod.CASH },
  { date: '2025-08-28', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 7,  method: PaymentMethod.BANK_TRANSFER },

  // ── Sep 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-09-02', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 6,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-09-02', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-09-10', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 4,  method: PaymentMethod.CARD },
  { date: '2025-09-10', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-09-20', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 4,  method: PaymentMethod.E_WALLET },
  { date: '2025-09-20', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-PN002',  quantity: 5,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-09-28', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 6,  method: PaymentMethod.CASH },
  { date: '2025-09-28', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 3,  method: PaymentMethod.CARD },

  // ── Oct 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-10-05', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 3,  method: PaymentMethod.CASH },
  { date: '2025-10-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 9,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-10-10', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 4,  method: PaymentMethod.CARD },
  { date: '2025-10-10', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 4,  method: PaymentMethod.E_WALLET },
  { date: '2025-10-20', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 6,  method: PaymentMethod.CASH },
  { date: '2025-10-20', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 3,  method: PaymentMethod.CARD },
  { date: '2025-10-30', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 7,  method: PaymentMethod.CASH },
  { date: '2025-10-30', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 5,  method: PaymentMethod.BANK_TRANSFER },

  // ── Nov 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-11-05', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-11-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-EL001',  quantity: 6,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-11-11', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-11-11', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-11-11', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 2,  method: PaymentMethod.CARD },
  { date: '2025-11-20', customerEmail: null,                      productSku: 'SKU-PN002',  quantity: 5,  method: PaymentMethod.E_WALLET },
  { date: '2025-11-20', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 10, method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-11-28', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-11-28', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 5,  method: PaymentMethod.CARD },

  // ── Dec 2025 ──────────────────────────────────────────────────────────────
  { date: '2025-12-05', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 6,  method: PaymentMethod.CASH },
  { date: '2025-12-05', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-KCN003', quantity: 8,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-12-15', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 5,  method: PaymentMethod.CASH },
  { date: '2025-12-15', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL003',  quantity: 4,  method: PaymentMethod.CARD },
  { date: '2025-12-20', customerEmail: null,                      productSku: 'SKU-SRM002', quantity: 6,  method: PaymentMethod.E_WALLET },
  { date: '2025-12-20', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-PN002',  quantity: 7,  method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-12-24', customerEmail: 'mua-hang@beautyplus.vn', productSku: 'SKU-SRM002', quantity: 15, method: PaymentMethod.BANK_TRANSFER },
  { date: '2025-12-24', customerEmail: null,                      productSku: 'SKU-MN001',  quantity: 6,  method: PaymentMethod.CASH },
  { date: '2025-12-24', customerEmail: null,                      productSku: 'SKU-SM001',  quantity: 4,  method: PaymentMethod.CASH },
  { date: '2025-12-31', customerEmail: null,                      productSku: 'SKU-KCN003', quantity: 5,  method: PaymentMethod.E_WALLET },
  { date: '2025-12-31', customerEmail: 'group-q1@example.com',   productSku: 'SKU-EL001',  quantity: 3,  method: PaymentMethod.CARD },
];

const TAX_SETTINGS = [
  { key: 'tax.business_name', value: 'Nguyễn Văn Demo' },
  { key: 'tax.tax_code', value: '8123456789' },
  { key: 'tax.business_location', value: '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh' },
  { key: 'tax.revenue_group_1_label', value: 'Bán hàng doanh nghiệp' },
  { key: 'tax.revenue_group_1_types', value: 'COMPANY,GROUP' },
  { key: 'tax.revenue_group_2_label', value: 'Bán hàng khách vãng lai' },
  { key: 'tax.revenue_group_2_types', value: 'INDIVIDUAL,NONE' },
];

@Injectable()
export class SeedTaxReportService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly invoicesService: InvoicesService,
    private readonly inventoryService: InventoryService,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceItem.name) private invoiceItemModel: Model<InvoiceItemDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
  ) {}

  async run(): Promise<void> {
    const owner = await this.usersService.findByEmail(DEMO_ACCOUNT.email);
    if (!owner) {
      throw new Error(
        'Demo account not found. Run "npm run seed:demo" first.',
      );
    }

    const tenantId = owner.tenant_id.toString();
    const userId = owner._id.toString();
    const adminRole = await this.rbacService.getRoleByCodeInTenant(tenantId, 'ADMIN');
    const roleId = adminRole._id.toString();
    const tenantObjectId = new Types.ObjectId(tenantId);

    // Build lookup maps
    const productMap = await this.buildProductMap(tenantObjectId);
    const customerMap = await this.buildCustomerMap(tenantObjectId);

    // Check if tax invoices already seeded (check for a 2025 invoice)
    const alreadySeeded = await this.invoiceModel.findOne({
      tenant_id: tenantObjectId,
      created_at: { $gte: new Date('2025-01-01'), $lt: new Date('2026-01-01') },
    });
    if (alreadySeeded) {
      console.log('Tax report seed data already exists for 2025. Skipping.');
      console.log('Use --reset flag on seed:demo to wipe all data and re-seed.\n');
      return;
    }

    // Replenish stock so invoices don't fail
    console.log('Adjusting inventory (+500 per product)...');
    for (const [, productId] of Object.entries(productMap)) {
      await this.inventoryService.adjust(
        tenantId,
        { productId, quantity: 500, reason: AdjustmentReason.CORRECTION, note: 'Tax report seed restock' },
        userId,
      );
    }

    // Seed tax settings
    console.log('Seeding tax settings...');
    await this.seedTaxSettings(tenantObjectId, userId);

    // Create invoices and backdate
    console.log(`Creating ${INVOICE_PLANS.length} invoices across 2025...`);
    let created = 0;

    for (const plan of INVOICE_PLANS) {
      const productId = productMap[plan.productSku];
      if (!productId) {
        console.warn(`  ⚠ Product SKU not found: ${plan.productSku} — skipping`);
        continue;
      }

      const customerId = plan.customerEmail
        ? customerMap[plan.customerEmail]
        : undefined;

      if (plan.customerEmail && !customerId) {
        console.warn(`  ⚠ Customer email not found: ${plan.customerEmail} — creating as walk-in`);
      }

      const invoice = await this.invoicesService.createAndPay(tenantId, userId, roleId, {
        customerId,
        paymentMethod: plan.method,
        items: [{ productId, quantity: plan.quantity }],
      });

      const backdateMs = new Date(`${plan.date}T10:00:00+07:00`).getTime();

      await this.invoiceModel.updateOne(
        { _id: new Types.ObjectId(invoice.id) },
        { $set: { created_at: new Date(backdateMs) } },
      );
      await this.invoiceItemModel.updateMany(
        { invoice_id: new Types.ObjectId(invoice.id) },
        { $set: { created_at: new Date(backdateMs) } },
      );

      created += 1;
    }

    console.log(`\nDone — ${created} invoices created and backdated to 2025.`);
  }

  private async buildProductMap(tenantObjectId: Types.ObjectId): Promise<Record<string, string>> {
    const products = await this.productModel
      .find({ tenant_id: tenantObjectId, is_deleted: false })
      .lean();
    const map: Record<string, string> = {};
    for (const p of products) {
      map[p.sku] = p._id.toString();
    }
    return map;
  }

  private async buildCustomerMap(tenantObjectId: Types.ObjectId): Promise<Record<string, string>> {
    const customers = await this.customerModel
      .find({ tenant_id: tenantObjectId, is_deleted: false })
      .lean();
    const map: Record<string, string> = {};
    for (const c of customers) {
      if (c.email) map[c.email] = c._id.toString();
    }
    return map;
  }

  private async seedTaxSettings(tenantObjectId: Types.ObjectId, userId: string): Promise<void> {
    for (const setting of TAX_SETTINGS) {
      await this.settingModel.updateOne(
        { tenant_id: tenantObjectId, key: setting.key },
        {
          $set: {
            value: setting.value,
            modified_by: new Types.ObjectId(userId),
          },
          $setOnInsert: {
            tenant_id: tenantObjectId,
            key: setting.key,
            type: 'STRING',
            group: 'TAX',
            description: '',
            is_active: true,
            version: 1,
          },
        },
        { upsert: true },
      );
    }
  }
}
