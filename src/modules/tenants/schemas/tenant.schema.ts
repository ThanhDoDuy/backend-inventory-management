import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TenantStatus } from '../../../shared/constants/roles.enum';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Tenant {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  address: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: '' })
  state: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  owner_user_id?: Types.ObjectId;

  @Prop({ default: 20 })
  max_users: number;

  @Prop({ default: 1 })
  version: number;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
