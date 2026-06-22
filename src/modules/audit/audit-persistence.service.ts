import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditJobPayload } from '../../shared/constants/app.constants';
import { sanitizeAuditRecord } from './utils/audit-sanitizer.util';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditPersistenceService {
  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async write(payload: AuditJobPayload): Promise<AuditLogDocument> {
    const [created] = await this.auditLogModel.create([
      {
        event_id: payload.event_id,
        tenant_id: payload.tenant_id
          ? new Types.ObjectId(payload.tenant_id)
          : undefined,
        user_id: payload.user_id
          ? new Types.ObjectId(payload.user_id)
          : undefined,
        actor_username: payload.actor_username ?? '',
        action: payload.action,
        module: payload.module,
        category: payload.category,
        entity_id: payload.entity_id,
        status: payload.status,
        old_value: sanitizeAuditRecord(payload.old_value),
        new_value: sanitizeAuditRecord(payload.new_value),
        ip_address: payload.ip_address ?? '',
        user_agent: payload.user_agent ?? '',
        request_id: payload.request_id ?? '',
        correlation_id: payload.correlation_id ?? '',
        source: payload.source ?? 'API',
        error: payload.error,
        duration_ms: payload.duration_ms,
        metadata: sanitizeAuditRecord(payload.metadata),
      },
    ]);

    return created;
  }
}
