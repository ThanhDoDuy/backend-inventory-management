import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Category, CategorySchema } from './schemas/category.schema';
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from '../inventory/schemas/inventory-balance.schema';
import { Product, ProductSchema } from './schemas/product.schema';

@Module({
  imports: [
    PriceTiersModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
    ]),
  ],
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService],
  exports: [CategoriesService, ProductsService, MongooseModule],
})
export class ProductsModule {}
