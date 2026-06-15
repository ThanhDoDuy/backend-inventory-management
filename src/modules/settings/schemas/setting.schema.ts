import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SettingDocument = HydratedDocument<Setting>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Setting {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  group: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: true })
  is_active: boolean;

  @Prop({ default: 1 })
  version: number;

  @Prop({ type: Types.ObjectId, default: null })
  modified_by?: Types.ObjectId;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
SettingSchema.index({ tenant_id: 1, key: 1 }, { unique: true });
