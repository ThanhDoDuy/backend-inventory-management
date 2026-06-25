import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ _id: false })
export class AuditErrorInfo {
  @Prop()
  code?: string;

  @Prop()
  message?: string;
}

@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class AuditLog {
  @Prop({ required: true, unique: true, sparse: true, index: true })
  event_id: string;

  @Prop({ type: Types.ObjectId, index: true })
  tenant_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  user_id?: Types.ObjectId;

  @Prop({ default: '' })
  actor_username?: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  module: string;

  @Prop({ required: true, index: true })
  category: string;

  @Prop({ default: null, index: true })
  entity_id?: string;

  @Prop({ default: 'SUCCESS' })
  status: string;

  @Prop({ type: Object, default: {} })
  old_value: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  new_value: Record<string, unknown>;

  @Prop({ default: '' })
  ip_address: string;

  @Prop({ default: '' })
  user_agent: string;

  @Prop({ default: '' })
  request_id: string;

  @Prop({ default: '', index: true })
  correlation_id: string;

  @Prop({ default: 'API' })
  source: string;

  @Prop({ type: AuditErrorInfo })
  error?: AuditErrorInfo;

  @Prop()
  duration_ms?: number;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  created_at?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ tenant_id: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, action: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, module: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, user_id: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, correlation_id: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, entity_id: 1, created_at: -1 });
AuditLogSchema.index({ tenant_id: 1, category: 1, created_at: -1 });
