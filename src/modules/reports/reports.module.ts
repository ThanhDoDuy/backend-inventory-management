import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceItem, InvoiceItemSchema } from '../invoices/schemas/invoice-item.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from '../inventory/schemas/inventory-balance.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceItem.name, schema: InvoiceItemSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
