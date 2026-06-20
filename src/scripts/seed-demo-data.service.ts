import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthService } from '../modules/auth/auth.service';
import { CategoriesService } from '../modules/products/categories.service';
import { ProductsService } from '../modules/products/products.service';
import { SuppliersService } from '../modules/suppliers/suppliers.service';
import { CustomersService } from '../modules/customers/customers.service';
import { UsersService } from '../modules/users/users.service';
import { TenantsService } from '../modules/tenants/tenants.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { PurchaseOrdersService } from '../modules/purchase-orders/purchase-orders.service';
import { InvoicesService } from '../modules/invoices/invoices.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { Product, ProductDocument } from '../modules/products/schemas/product.schema';
import { Category, CategoryDocument } from '../modules/products/schemas/category.schema';
import { Supplier, SupplierDocument } from '../modules/suppliers/schemas/supplier.schema';
import { Customer, CustomerDocument } from '../modules/customers/schemas/customer.schema';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { Invoice, InvoiceDocument } from '../modules/invoices/schemas/invoice.schema';
import { InvoiceItem, InvoiceItemDocument } from '../modules/invoices/schemas/invoice-item.schema';
import { Payment, PaymentDocument } from '../modules/invoices/schemas/payment.schema';
import { Refund, RefundDocument } from '../modules/invoices/schemas/refund.schema';
import {
  SequenceCounter,
  SequenceCounterDocument,
} from '../modules/invoices/schemas/sequence-counter.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from '../modules/purchase-orders/schemas/purchase-order.schema';
import {
  PurchaseOrderItem,
  PurchaseOrderItemDocument,
} from '../modules/purchase-orders/schemas/purchase-order-item.schema';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
} from '../modules/purchase-orders/schemas/goods-receipt.schema';
import {
  InventoryBalance,
  InventoryBalanceDocument,
} from '../modules/inventory/schemas/inventory-balance.schema';
import {
  InventoryTransaction,
  InventoryTransactionDocument,
} from '../modules/inventory/schemas/inventory-transaction.schema';
import {
  Notification,
  NotificationDocument,
} from '../modules/notifications/schemas/notification.schema';
import { toObjectIdString } from '../shared/utils/mongo-id.util';
import {
  DEMO_ACCOUNT,
  DEMO_ADJUSTMENTS,
  DEMO_CATEGORIES,
  DEMO_CUSTOMERS,
  DEMO_EXTRA_USERS,
  DEMO_INVOICES,
  DEMO_PRODUCTS,
  DEMO_PURCHASE_ORDERS,
  DEMO_SUPPLIERS,
  DEMO_TENANT_PROFILE,
  type DemoPoPlan,
} from './demo-data.constants';

export interface SeedDemoOptions {
  reset?: boolean;
}

export interface SeedDemoResult {
  tenantId: string;
  tenantName: string;
  skipped: boolean;
  summary: {
    categories: number;
    products: number;
    suppliers: number;
    customers: number;
    users: number;
    purchaseOrders: number;
    invoices: number;
    adjustments: number;
  };
  accounts: Array<{ role: string; email: string; password: string }>;
}

@Injectable()
export class SeedDemoDataService {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantsService: TenantsService,
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
    private readonly customersService: CustomersService,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly inventoryService: InventoryService,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(InvoiceItem.name)
    private invoiceItemModel: Model<InvoiceItemDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Refund.name) private refundModel: Model<RefundDocument>,
    @InjectModel(SequenceCounter.name)
    private sequenceCounterModel: Model<SequenceCounterDocument>,
    @InjectModel(PurchaseOrder.name)
    private purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(PurchaseOrderItem.name)
    private purchaseOrderItemModel: Model<PurchaseOrderItemDocument>,
    @InjectModel(GoodsReceipt.name)
    private goodsReceiptModel: Model<GoodsReceiptDocument>,
    @InjectModel(InventoryBalance.name)
    private inventoryBalanceModel: Model<InventoryBalanceDocument>,
    @InjectModel(InventoryTransaction.name)
    private inventoryTransactionModel: Model<InventoryTransactionDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  async run(options: SeedDemoOptions = {}): Promise<SeedDemoResult> {
    const context = await this.ensureTenant(options.reset ?? false);

    if (context.skipped) {
      return {
        tenantId: context.tenantId,
        tenantName: DEMO_ACCOUNT.tenantName,
        skipped: true,
        summary: {
          categories: 0,
          products: 0,
          suppliers: 0,
          customers: 0,
          users: 0,
          purchaseOrders: 0,
          invoices: 0,
          adjustments: 0,
        },
        accounts: this.buildAccountList(),
      };
    }

    await this.tenantsService.updateProfile(context.tenantId, {
      name: DEMO_ACCOUNT.tenantName,
      ...DEMO_TENANT_PROFILE,
    });

    const categoryIds = await this.seedCategories(context.tenantId);
    const productIds = await this.seedProducts(context.tenantId, categoryIds);
    const supplierIds = await this.seedSuppliers(
      context.tenantId,
      context.ownerId,
    );
    const customerIds = await this.seedCustomers(
      context.tenantId,
      context.ownerId,
    );
    const extraUsers = await this.seedExtraUsers(context.tenantId);

    const poCount = await this.seedPurchaseOrders(
      context.tenantId,
      context.ownerId,
      productIds,
      supplierIds,
    );

    const invoiceCount = await this.seedInvoices(
      context.tenantId,
      context.ownerId,
      context.ownerRoleId,
      productIds,
      customerIds,
    );

    const adjustmentCount = await this.seedAdjustments(
      context.tenantId,
      context.ownerId,
      productIds,
    );

    return {
      tenantId: context.tenantId,
      tenantName: DEMO_ACCOUNT.tenantName,
      skipped: false,
      summary: {
        categories: DEMO_CATEGORIES.length,
        products: DEMO_PRODUCTS.length,
        suppliers: DEMO_SUPPLIERS.length,
        customers: DEMO_CUSTOMERS.length,
        users: 1 + extraUsers,
        purchaseOrders: poCount,
        invoices: invoiceCount,
        adjustments: adjustmentCount,
      },
      accounts: this.buildAccountList(),
    };
  }

  private buildAccountList() {
    return [
      {
        role: 'Admin (owner)',
        email: DEMO_ACCOUNT.email,
        password: DEMO_ACCOUNT.password,
      },
      ...DEMO_EXTRA_USERS.map((user) => ({
        role: user.roleCode,
        email: user.email,
        password: user.password,
      })),
    ];
  }

  private async ensureTenant(reset: boolean): Promise<{
    tenantId: string;
    ownerId: string;
    ownerRoleId: string;
    skipped: boolean;
  }> {
    const existing = await this.usersService.findByEmail(DEMO_ACCOUNT.email);

    if (existing) {
      const tenantId = toObjectIdString(existing.tenant_id);
      const ownerId = existing._id.toString();
      const ownerRoleId = toObjectIdString(existing.role_id as Types.ObjectId);

      const productCount = await this.productModel.countDocuments({
        tenant_id: new Types.ObjectId(tenantId),
        is_deleted: false,
      });

      if (productCount > 0 && !reset) {
        return { tenantId, ownerId, ownerRoleId, skipped: true };
      }

      if (reset) {
        await this.wipeBusinessData(tenantId, ownerId);
      }

      return { tenantId, ownerId, ownerRoleId, skipped: false };
    }

    const registered = await this.authService.register({
      tenantName: DEMO_ACCOUNT.tenantName,
      username: DEMO_ACCOUNT.username,
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
    });

    const ownerId = toObjectIdString(registered.user.id);
    const tenantId = toObjectIdString(registered.tenant.id);
    const adminRole = await this.rbacService.getRoleByCodeInTenant(tenantId, 'ADMIN');
    const ownerRoleId = adminRole._id.toString();

    return { tenantId, ownerId, ownerRoleId, skipped: false };
  }

  private async wipeBusinessData(tenantId: string, ownerId: string): Promise<void> {
    const tenantObjectId = new Types.ObjectId(tenantId);

    await Promise.all([
      this.refundModel.deleteMany({ tenant_id: tenantObjectId }),
      this.paymentModel.deleteMany({ tenant_id: tenantObjectId }),
      this.invoiceItemModel.deleteMany({ tenant_id: tenantObjectId }),
      this.invoiceModel.deleteMany({ tenant_id: tenantObjectId }),
      this.goodsReceiptModel.deleteMany({ tenant_id: tenantObjectId }),
      this.purchaseOrderItemModel.deleteMany({ tenant_id: tenantObjectId }),
      this.purchaseOrderModel.deleteMany({ tenant_id: tenantObjectId }),
      this.inventoryTransactionModel.deleteMany({ tenant_id: tenantObjectId }),
      this.inventoryBalanceModel.deleteMany({ tenant_id: tenantObjectId }),
      this.productModel.deleteMany({ tenant_id: tenantObjectId }),
      this.categoryModel.deleteMany({ tenant_id: tenantObjectId }),
      this.customerModel.deleteMany({ tenant_id: tenantObjectId }),
      this.supplierModel.deleteMany({ tenant_id: tenantObjectId }),
      this.notificationModel.deleteMany({ tenant_id: tenantObjectId }),
      this.sequenceCounterModel.deleteMany({ tenant_id: tenantObjectId }),
    ]);

    await this.userModel.deleteMany({
      tenant_id: tenantObjectId,
      _id: { $ne: new Types.ObjectId(ownerId) },
      is_deleted: false,
    });
  }

  private async seedCategories(tenantId: string): Promise<Record<string, string>> {
    const map: Record<string, string> = {};

    for (const category of DEMO_CATEGORIES) {
      const created = await this.categoriesService.create(tenantId, {
        name: category.name,
        description: category.description,
      });
      map[category.key] = created._id.toString();
    }

    return map;
  }

  private async seedProducts(
    tenantId: string,
    categoryIds: Record<string, string>,
  ): Promise<Record<string, string>> {
    const map: Record<string, string> = {};

    for (const product of DEMO_PRODUCTS) {
      const created = await this.productsService.create(tenantId, {
        sku: product.sku,
        name: product.name,
        category_id: categoryIds[product.categoryKey],
        cost_price: product.cost_price,
        selling_price: product.selling_price,
        minimum_stock: product.minimum_stock,
        barcode: product.barcode,
      });
      map[product.key] = created._id.toString();
    }

    return map;
  }

  private async seedSuppliers(
    tenantId: string,
    userId: string,
  ): Promise<Record<string, string>> {
    const map: Record<string, string> = {};

    for (const supplier of DEMO_SUPPLIERS) {
      const created = await this.suppliersService.create(tenantId, userId, {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        tax_code: supplier.tax_code,
      });
      map[supplier.key] = created._id.toString();
    }

    return map;
  }

  private async seedCustomers(
    tenantId: string,
    userId: string,
  ): Promise<Record<string, string>> {
    const map: Record<string, string> = {};

    for (const customer of DEMO_CUSTOMERS) {
      const created = await this.customersService.create(tenantId, userId, {
        customer_type: customer.customer_type,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        tax_code: 'tax_code' in customer ? customer.tax_code : undefined,
        contact_person:
          'contact_person' in customer ? customer.contact_person : undefined,
      });
      map[customer.key] = created._id.toString();
    }

    return map;
  }

  private async seedExtraUsers(tenantId: string): Promise<number> {
    let created = 0;

    for (const user of DEMO_EXTRA_USERS) {
      const existing = await this.usersService.findByEmail(user.email);
      if (existing) {
        continue;
      }

      const role = await this.rbacService.getRoleByCodeInTenant(
        tenantId,
        user.roleCode,
      );

      await this.usersService.create(tenantId, {
        username: user.username,
        email: user.email,
        password: user.password,
        role_id: role._id.toString(),
      });
      created += 1;
    }

    return created;
  }

  private async seedPurchaseOrders(
    tenantId: string,
    userId: string,
    productIds: Record<string, string>,
    supplierIds: Record<string, string>,
  ): Promise<number> {
    let count = 0;

    for (const plan of DEMO_PURCHASE_ORDERS) {
      await this.createPurchaseOrderPlan(
        tenantId,
        userId,
        plan,
        productIds,
        supplierIds,
      );
      count += 1;
    }

    return count;
  }

  private async createPurchaseOrderPlan(
    tenantId: string,
    userId: string,
    plan: DemoPoPlan,
    productIds: Record<string, string>,
    supplierIds: Record<string, string>,
  ): Promise<void> {
    const po = await this.purchaseOrdersService.create(tenantId, userId, {
      supplierId: supplierIds[plan.supplierKey],
      expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      items: plan.items.map((item) => ({
        productId: productIds[item.productKey],
        quantity: item.quantity,
        costPrice:
          item.costPrice ??
          DEMO_PRODUCTS.find((product) => product.key === item.productKey)!
            .cost_price,
      })),
    });

    if (plan.status === 'DRAFT') {
      return;
    }

    await this.purchaseOrdersService.approve(tenantId, userId, po.id);

    if (plan.status === 'APPROVED') {
      return;
    }

    const receiveItems =
      plan.status === 'PARTIAL_RECEIVED' && plan.partialReceive
        ? plan.partialReceive.map((item) => ({
            productId: productIds[item.productKey],
            receivedQuantity: item.receivedQuantity,
          }))
        : plan.items.map((item) => ({
            productId: productIds[item.productKey],
            receivedQuantity: item.quantity,
          }));

    await this.purchaseOrdersService.receive(tenantId, userId, po.id, {
      items: receiveItems,
    });
  }

  private async seedInvoices(
    tenantId: string,
    userId: string,
    roleId: string,
    productIds: Record<string, string>,
    customerIds: Record<string, string>,
  ): Promise<number> {
    let count = 0;

    for (const invoice of DEMO_INVOICES) {
      await this.invoicesService.createAndPay(tenantId, userId, roleId, {
        customerId: invoice.customerKey
          ? customerIds[invoice.customerKey]
          : undefined,
        paymentMethod: invoice.paymentMethod,
        discountPercent: 'discountPercent' in invoice ? invoice.discountPercent : undefined,
        items: invoice.items.map((item) => ({
          productId: productIds[item.productKey],
          quantity: item.quantity,
        })),
      });
      count += 1;
    }

    return count;
  }

  private async seedAdjustments(
    tenantId: string,
    userId: string,
    productIds: Record<string, string>,
  ): Promise<number> {
    let count = 0;

    for (const adjustment of DEMO_ADJUSTMENTS) {
      await this.inventoryService.adjust(
        tenantId,
        {
          productId: productIds[adjustment.productKey],
          quantity: adjustment.quantity,
          reason: adjustment.reason,
          note: adjustment.note,
        },
        userId,
      );
      count += 1;
    }

    return count;
  }
}
