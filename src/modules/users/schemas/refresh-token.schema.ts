import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenant_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ required: true })
  expired_at: Date;

  @Prop({ default: false })
  is_deleted: boolean;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
