import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProductStatus } from '../../../shared/constants/business.enums';

export type ProductDocument = HydratedDocument<Product>;

@Schema({
  collection: 'products',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Product {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  sku: string;

  @Prop({ default: null })
  barcode?: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, default: null, ref: 'Category', index: true })
  category_id?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  cost_price: number;

  @Prop({ required: true, min: 0 })
  selling_price: number;

  @Prop({ default: 0, min: 0 })
  minimum_stock: number;

  @Prop({ default: '' })
  image_url: string;

  @Prop({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Prop({ default: null })
  deleted_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 1 })
  version: number;

  created_at?: Date;
  updated_at?: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index(
  { tenant_id: 1, sku: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);
ProductSchema.index(
  { tenant_id: 1, barcode: 1 },
  { unique: true, sparse: true, partialFilterExpression: { is_deleted: false } },
);
