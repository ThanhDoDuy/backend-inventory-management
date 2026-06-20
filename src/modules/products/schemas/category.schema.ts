import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({
  collection: 'categories',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Category {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  /** Normalized lowercase text for case/accent-insensitive search. */
  @Prop({ default: '', index: true })
  search_text: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: null })
  deleted_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 1 })
  version: number;

  created_at?: Date;
  updated_at?: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index(
  { tenant_id: 1, name: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);
