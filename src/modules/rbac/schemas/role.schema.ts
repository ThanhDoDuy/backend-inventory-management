import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Role {
  @Prop({ required: true, unique: true, index: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  permission_codes: string[];

  @Prop({ default: false })
  is_wildcard: boolean;

  @Prop({ default: true })
  is_system: boolean;

  @Prop({ default: true })
  is_active: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
