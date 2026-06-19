import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PasswordResetTokenDocument =
  HydratedDocument<PasswordResetToken>;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class PasswordResetToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token_hash: string;

  @Prop({ required: true })
  expired_at: Date;

  @Prop()
  used_at?: Date;

  @Prop({ default: false })
  is_deleted: boolean;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);

PasswordResetTokenSchema.index({ expired_at: 1 }, { expireAfterSeconds: 0 });
