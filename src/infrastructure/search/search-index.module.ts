import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../../modules/products/schemas/product.schema';
import { Category, CategorySchema } from '../../modules/products/schemas/category.schema';
import { Supplier, SupplierSchema } from '../../modules/suppliers/schemas/supplier.schema';
import { Customer, CustomerSchema } from '../../modules/customers/schemas/customer.schema';
import { User, UserSchema } from '../../modules/users/schemas/user.schema';
import { SearchIndexBackfillService } from './search-index-backfill.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [SearchIndexBackfillService],
})
export class SearchIndexModule {}
