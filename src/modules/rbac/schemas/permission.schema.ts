import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PermissionDocument = HydratedDocument<Permission>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Permission {
  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({ required: true, index: true })
  module: string;

  @Prop({ required: true })
  action: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: true })
  is_active: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
