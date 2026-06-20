import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { ProductsImportService } from './products-import.service';
import { ProductsService } from './products.service';
import { Category, CategorySchema } from './schemas/category.schema';
import {
  InventoryBalance,
  InventoryBalanceSchema,
} from '../inventory/schemas/inventory-balance.schema';
import { Product, ProductSchema } from './schemas/product.schema';

@Module({
  imports: [
    TenantsModule,
    PriceTiersModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: InventoryBalance.name, schema: InventoryBalanceSchema },
    ]),
  ],
  controllers: [CategoriesController, ProductsController, ProductImagesController],
  providers: [CategoriesService, ProductsService, ProductsImportService, ProductImagesService],
  exports: [CategoriesService, ProductsService, ProductImagesService, MongooseModule],
})
export class ProductsModule {}
