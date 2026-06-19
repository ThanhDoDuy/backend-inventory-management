import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SequenceCounterDocument = HydratedDocument<SequenceCounter>;

@Schema({ collection: 'counters' })
export class SequenceCounter {
  @Prop({ type: Types.ObjectId, required: true })
  tenant_id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: 0, min: 0 })
  seq: number;
}

export const SequenceCounterSchema =
  SchemaFactory.createForClass(SequenceCounter);

SequenceCounterSchema.index({ tenant_id: 1, name: 1 }, { unique: true });
