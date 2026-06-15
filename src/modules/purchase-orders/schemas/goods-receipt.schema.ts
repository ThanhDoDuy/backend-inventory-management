import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export class GoodsReceiptItem {
  @Prop({ type: Types.ObjectId, required: true })
  product_id: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;
}

export type GoodsReceiptDocument = HydratedDocument<GoodsReceipt>;

@Schema({
  collection: 'goods_receipts',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class GoodsReceipt {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  purchase_order_id: Types.ObjectId;

  @Prop({ type: [GoodsReceiptItem], required: true })
  items: GoodsReceiptItem[];

  @Prop({ type: Types.ObjectId, required: true })
  created_by: Types.ObjectId;

  created_at?: Date;
}

export const GoodsReceiptSchema = SchemaFactory.createForClass(GoodsReceipt);

GoodsReceiptSchema.index({ tenant_id: 1, purchase_order_id: 1 });
