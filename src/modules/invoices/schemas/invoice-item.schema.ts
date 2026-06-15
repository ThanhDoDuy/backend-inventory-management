import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InvoiceItemDocument = HydratedDocument<InvoiceItem>;

@Schema({
  collection: 'invoice_items',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class InvoiceItem {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  invoice_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  product_id: Types.ObjectId;

  @Prop({ required: true, min: 0.001 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unit_price: number;

  @Prop({ required: true, min: 0 })
  total: number;

  created_at?: Date;
  updated_at?: Date;
}

export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);
InvoiceItemSchema.index({ tenant_id: 1, invoice_id: 1 });
