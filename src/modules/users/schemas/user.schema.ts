import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role, UserStatus } from '../../../shared/constants/roles.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class User {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop({ enum: Role, required: true })
  role: Role;

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ default: null })
  last_login_at?: Date;

  @Prop({ default: null })
  deleted_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ default: 1 })
  version: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ tenant_id: 1, username: 1 }, { unique: true });
