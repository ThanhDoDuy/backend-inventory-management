import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductImageDocument = HydratedDocument<ProductImage>;

@Schema({
  _id: true,
  timestamps: { createdAt: 'uploaded_at', updatedAt: false },
})
export class ProductImage {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  public_id: string;

  @Prop({ required: true })
  secure_url: string;

  @Prop({ required: true, min: 1 })
  width: number;

  @Prop({ required: true, min: 1 })
  height: number;

  @Prop({ required: true })
  format: string;

  @Prop({ required: true, min: 0 })
  bytes: number;

  @Prop({ default: false })
  is_primary: boolean;

  @Prop({ default: 0, min: 0 })
  sort_order: number;

  @Prop({ type: Types.ObjectId, required: true })
  uploaded_by: Types.ObjectId;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: null })
  deleted_at?: Date;

  uploaded_at?: Date;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);
