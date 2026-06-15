import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InventoryBalanceDocument = HydratedDocument<InventoryBalance>;

@Schema({ collection: 'inventory_balances' })
export class InventoryBalance {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  product_id: Types.ObjectId;

  @Prop({ default: 0 })
  available_quantity: number;

  @Prop({ default: 0 })
  reserved_quantity: number;

  @Prop({ default: () => new Date() })
  updated_at: Date;

  @Prop({ default: 1 })
  version: number;
}

export const InventoryBalanceSchema =
  SchemaFactory.createForClass(InventoryBalance);

InventoryBalanceSchema.index({ tenant_id: 1, product_id: 1 }, { unique: true });
