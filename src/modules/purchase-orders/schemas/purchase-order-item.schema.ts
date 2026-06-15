import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PurchaseOrderItemDocument = HydratedDocument<PurchaseOrderItem>;

@Schema({ collection: 'purchase_order_items' })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  purchase_order_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  product_id: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ default: 0, min: 0 })
  received_quantity: number;

  @Prop({ required: true, min: 0 })
  cost_price: number;
}

export const PurchaseOrderItemSchema =
  SchemaFactory.createForClass(PurchaseOrderItem);

PurchaseOrderItemSchema.index(
  { tenant_id: 1, purchase_order_id: 1, product_id: 1 },
  { unique: true },
);
