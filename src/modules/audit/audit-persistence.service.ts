import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditJobPayload } from '../../infrastructure/queue/queue.constants';
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
        tenant_id: payload.tenant_id
          ? new Types.ObjectId(payload.tenant_id)
          : undefined,
        user_id: payload.user_id
          ? new Types.ObjectId(payload.user_id)
          : undefined,
        action: payload.action,
        module: payload.module,
        entity_id: payload.entity_id,
        status: payload.status,
        old_value: payload.old_value ?? {},
        new_value: payload.new_value ?? {},
        ip_address: payload.ip_address ?? '',
        metadata: payload.metadata ?? {},
      },
    ]);

    return created;
  }
}
