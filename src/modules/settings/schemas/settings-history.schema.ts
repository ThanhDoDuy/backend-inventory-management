import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SettingsHistoryDocument = HydratedDocument<SettingsHistory>;

@Schema({
  collection: 'settings_history',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class SettingsHistory {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ default: '' })
  old_value: string;

  @Prop({ default: '' })
  new_value: string;

  @Prop({ type: Types.ObjectId, default: null })
  changed_by?: Types.ObjectId;

  @Prop({ default: 'SETTING' })
  change_type: string;

  created_at?: Date;
}

export const SettingsHistorySchema =
  SchemaFactory.createForClass(SettingsHistory);
SettingsHistorySchema.index({ tenant_id: 1, created_at: -1 });
