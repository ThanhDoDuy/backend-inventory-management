import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceTierDocument = HydratedDocument<PriceTier>;

@Schema({
  collection: 'price_tiers',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PriceTier {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: false })
  is_system: boolean;

  @Prop({ default: true })
  is_active: boolean;

  @Prop({ default: 0 })
  sort_order: number;

  created_at?: Date;
  updated_at?: Date;
}

export const PriceTierSchema = SchemaFactory.createForClass(PriceTier);
PriceTierSchema.index({ tenant_id: 1, code: 1 }, { unique: true });
