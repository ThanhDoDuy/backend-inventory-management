import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  CustomerType,
  PartyStatus,
} from '../../../shared/constants/business.enums';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Customer {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ enum: CustomerType, default: CustomerType.INDIVIDUAL, required: true })
  customer_type: CustomerType;

  @Prop({ required: true })
  name: string;

  /** Normalized lowercase text for case/accent-insensitive search. */
  @Prop({ default: '', index: true })
  search_text: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ default: null })
  email?: string;

  @Prop({ default: null })
  address?: string;

  @Prop({ default: null })
  tax_code?: string;

  @Prop({ default: null })
  contact_person?: string;

  @Prop({ enum: PartyStatus, default: PartyStatus.ACTIVE })
  status: PartyStatus;

  @Prop({ default: null })
  last_purchase_at?: Date;

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

export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index(
  { tenant_id: 1, email: 1 },
  { unique: true, sparse: true },
);
CustomerSchema.index(
  { tenant_id: 1, tax_code: 1 },
  { unique: true, sparse: true },
);
CustomerSchema.index({ tenant_id: 1, customer_type: 1 });
CustomerSchema.index({ tenant_id: 1, name: 1 });
