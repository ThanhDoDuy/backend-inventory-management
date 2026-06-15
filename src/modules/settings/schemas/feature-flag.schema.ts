import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FeatureFlagDocument = HydratedDocument<FeatureFlag>;

@Schema({
  collection: 'feature_flags',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class FeatureFlag {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, default: null })
  modified_by?: Types.ObjectId;

  created_at?: Date;
  updated_at?: Date;
}

export const FeatureFlagSchema = SchemaFactory.createForClass(FeatureFlag);
FeatureFlagSchema.index({ tenant_id: 1, key: 1 }, { unique: true });
