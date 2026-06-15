import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  InventoryReferenceType,
  InventoryTransactionType,
} from '../constants/inventory.enums';

export type InventoryTransactionDocument =
  HydratedDocument<InventoryTransaction>;

@Schema({
  collection: 'inventory_transactions',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class InventoryTransaction {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  product_id: Types.ObjectId;

  @Prop({ enum: InventoryTransactionType, required: true })
  type: InventoryTransactionType;

  @Prop({ required: true })
  quantity: number;

  @Prop({ required: true })
  balance_after: number;

  @Prop({ enum: InventoryReferenceType, required: true })
  reference_type: InventoryReferenceType;

  @Prop({ required: true })
  reference_id: string;

  @Prop({ default: '' })
  note: string;

  @Prop({ type: Types.ObjectId, required: true })
  created_by: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  modified_by: Types.ObjectId;

  @Prop({ default: null })
  deleted_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 1 })
  version: number;

  created_at?: Date;
  updated_at?: Date;
}

export const InventoryTransactionSchema =
  SchemaFactory.createForClass(InventoryTransaction);

InventoryTransactionSchema.index(
  {
    tenant_id: 1,
    reference_type: 1,
    reference_id: 1,
    product_id: 1,
  },
  { unique: true },
);
