import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsModule } from '../settings/settings.module';
import { ProductsModule } from '../products/products.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from './schemas/inventory-balance.schema';
import {
  InventoryTransaction,
  InventoryTransactionSchema,
} from './schemas/inventory-transaction.schema';

@Module({
  imports: [
    SettingsModule,
    ProductsModule,
    MongooseModule.forFeature([
      { name: InventoryTransaction.name, schema: InventoryTransactionSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService, MongooseModule],
})
export class InventoryModule {}
