import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  InvoiceStatus,
  PaymentMethod,
} from '../../../shared/constants/business.enums';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({
  collection: 'invoices',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Invoice {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  invoice_number: string;

  @Prop({ type: Types.ObjectId, default: null })
  customer_id?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, max: 100 })
  discount: number;

  @Prop({ default: 0, min: 0 })
  discount_amount: number;

  @Prop({ default: 0, min: 0, max: 100 })
  tax_percent: number;

  @Prop({ default: 0, min: 0 })
  tax: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ enum: PaymentMethod, required: true })
  payment_method: PaymentMethod;

  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

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

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index(
  { tenant_id: 1, invoice_number: 1 },
  { unique: true },
);
InvoiceSchema.index({ tenant_id: 1, status: 1, created_at: -1 });
InvoiceSchema.index({ tenant_id: 1, customer_id: 1, created_at: -1 });
