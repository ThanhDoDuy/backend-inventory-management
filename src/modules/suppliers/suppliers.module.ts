import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import { SuppliersController } from './suppliers.controller';
import { SuppliersImportService } from './suppliers-import.service';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersImportService],
  exports: [SuppliersService, MongooseModule],
})
export class SuppliersModule {}
