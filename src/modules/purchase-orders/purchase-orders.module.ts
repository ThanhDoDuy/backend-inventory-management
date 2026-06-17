import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import {
  GoodsReceipt,
  GoodsReceiptSchema,
} from './schemas/goods-receipt.schema';
import {
  PurchaseOrderItem,
  PurchaseOrderItemSchema,
} from './schemas/purchase-order-item.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersImportService } from './purchase-orders-import.service';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [
    InventoryModule,
    SuppliersModule,
    ProductsModule,
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: PurchaseOrderItem.name, schema: PurchaseOrderItemSchema },
      { name: GoodsReceipt.name, schema: GoodsReceiptSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersImportService],
  exports: [PurchaseOrdersService, MongooseModule],
})
export class PurchaseOrdersModule {}
