import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class RefundLineItem {
  @Prop({ type: Types.ObjectId, required: true })
  product_id: Types.ObjectId;

  @Prop({ required: true, min: 0.001 })
  quantity: number;
}

export const RefundLineItemSchema = SchemaFactory.createForClass(RefundLineItem);

export type RefundDocument = HydratedDocument<Refund>;

@Schema({
  collection: 'refunds',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class Refund {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  invoice_id: Types.ObjectId;

  @Prop({ type: [RefundLineItemSchema], required: true })
  items: RefundLineItem[];

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: '' })
  reason: string;

  @Prop({ type: Types.ObjectId, default: null })
  created_by?: Types.ObjectId;

  created_at?: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);
RefundSchema.index({ tenant_id: 1, invoice_id: 1, created_at: -1 });
