import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../modules/auth/auth.module';
import { TenantsModule } from '../modules/tenants/tenants.module';
import { UsersModule } from '../modules/users/users.module';
import { ProductsModule } from '../modules/products/products.module';
import { SuppliersModule } from '../modules/suppliers/suppliers.module';
import { CustomersModule } from '../modules/customers/customers.module';
import { RbacModule } from '../modules/rbac/rbac.module';
import { PurchaseOrdersModule } from '../modules/purchase-orders/purchase-orders.module';
import { InvoicesModule } from '../modules/invoices/invoices.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { Product, ProductSchema } from '../modules/products/schemas/product.schema';
import { Category, CategorySchema } from '../modules/products/schemas/category.schema';
import { Supplier, SupplierSchema } from '../modules/suppliers/schemas/supplier.schema';
import { Customer, CustomerSchema } from '../modules/customers/schemas/customer.schema';
import { User, UserSchema } from '../modules/users/schemas/user.schema';
import { Invoice, InvoiceSchema } from '../modules/invoices/schemas/invoice.schema';
import {
  InvoiceItem,
  InvoiceItemSchema,
} from '../modules/invoices/schemas/invoice-item.schema';
import { Payment, PaymentSchema } from '../modules/invoices/schemas/payment.schema';
import { Refund, RefundSchema } from '../modules/invoices/schemas/refund.schema';
import {
  SequenceCounter,
  SequenceCounterSchema,
} from '../modules/invoices/schemas/sequence-counter.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from '../modules/purchase-orders/schemas/purchase-order.schema';
import {
  PurchaseOrderItem,
  PurchaseOrderItemSchema,
} from '../modules/purchase-orders/schemas/purchase-order-item.schema';
import {
  GoodsReceipt,
  GoodsReceiptSchema,
} from '../modules/purchase-orders/schemas/goods-receipt.schema';
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from '../modules/inventory/schemas/inventory-balance.schema';
import {
  InventoryTransaction,
  InventoryTransactionSchema,
} from '../modules/inventory/schemas/inventory-transaction.schema';
import {
  Notification,
  NotificationSchema,
} from '../modules/notifications/schemas/notification.schema';
import { SeedDemoDataService } from './seed-demo-data.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    UsersModule,
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    RbacModule,
    PurchaseOrdersModule,
    InvoicesModule,
    InventoryModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceItem.name, schema: InvoiceItemSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: SequenceCounter.name, schema: SequenceCounterSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PurchaseOrderItem.name, schema: PurchaseOrderItemSchema },
      { name: GoodsReceipt.name, schema: GoodsReceiptSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [SeedDemoDataService],
  exports: [SeedDemoDataService],
})
export class SeedDemoModule {}
