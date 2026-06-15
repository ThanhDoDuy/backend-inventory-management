import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PoStatus } from '../../../shared/constants/business.enums';

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({
  collection: 'purchase_orders',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PurchaseOrder {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  po_number: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  supplier_id: Types.ObjectId;

  @Prop({ enum: PoStatus, default: PoStatus.DRAFT })
  status: PoStatus;

  @Prop({ required: true, min: 0 })
  total_amount: number;

  @Prop({ default: null })
  expected_date?: Date;

  @Prop({ default: null })
  cancel_reason?: string;

  @Prop({ type: Types.ObjectId, default: null })
  created_by?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  modified_by?: Types.ObjectId;

  @Prop({ default: null })
  deleted_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 1 })
  version: number;

  created_at?: Date;
  updated_at?: Date;
}

export const PurchaseOrderSchema =
  SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index(
  { tenant_id: 1, po_number: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);
PurchaseOrderSchema.index({ tenant_id: 1, supplier_id: 1 });
PurchaseOrderSchema.index({ tenant_id: 1, status: 1 });
