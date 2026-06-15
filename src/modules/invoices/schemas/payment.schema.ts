import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PaymentMethod,
  PaymentStatus,
} from '../../../shared/constants/business.enums';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  collection: 'payments',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class Payment {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  invoice_id: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ enum: PaymentMethod, required: true })
  method: PaymentMethod;

  @Prop({ enum: PaymentStatus, default: PaymentStatus.SUCCESS })
  status: PaymentStatus;

  @Prop({ default: () => new Date() })
  paid_at: Date;

  created_at?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ tenant_id: 1, invoice_id: 1 });
