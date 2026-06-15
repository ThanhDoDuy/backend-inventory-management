import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class AuditLog {
  @Prop({ type: Types.ObjectId, index: true })
  tenant_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  user_id?: Types.ObjectId;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  module: string;

  @Prop({ default: null })
  entity_id?: string;

  @Prop({ default: 'SUCCESS' })
  status: string;

  @Prop({ type: Object, default: {} })
  old_value: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  new_value: Record<string, unknown>;

  @Prop({ default: '' })
  ip_address: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  created_at?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ tenant_id: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, action: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, module: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, user_id: 1, created_at: -1 });
