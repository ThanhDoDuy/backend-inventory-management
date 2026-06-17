import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { PriceTiersController } from './price-tiers.controller';
import { PriceTiersService } from './price-tiers.service';
import { PriceTier, PriceTierSchema } from './schemas/price-tier.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PriceTier.name, schema: PriceTierSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [PriceTiersController],
  providers: [PriceTiersService],
  exports: [PriceTiersService],
})
export class PriceTiersModule {}
