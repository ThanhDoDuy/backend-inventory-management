import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { AuditJobPayload } from '../../infrastructure/queue/queue.constants';
import { AppError, ERRORS } from '../../shared/errors';
import { SECURITY_AUDIT_ACTIONS } from './constants/audit.constants';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditEmitParams {
  tenantId?: string;
  userId?: string;
  action: string;
  module: string;
  entityId?: string;
  status?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLogDocument>,
    private auditPersistenceService: AuditPersistenceService,
    private moduleRef: ModuleRef,
    private readonly logger: AppLoggerService,
  ) {}

  emit(params: AuditEmitParams): void {
    const payload: AuditJobPayload = {
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      module: params.module,
      entity_id: params.entityId,
      status: params.status ?? 'SUCCESS',
      old_value: params.oldValue,
      new_value: params.newValue,
      ip_address: params.ipAddress,
      metadata: params.metadata,
    };

    if (SECURITY_AUDIT_ACTIONS.has(params.action)) {
      void this.auditPersistenceService.write(payload).catch((error) => {
        this.logger.error('AuditService.emit.sync_failed', {
          action: params.action,
          error: (error as Error).message,
        });
      });
      return;
    }

    void this.getQueueService()
      .enqueueAudit(payload)
      .catch((error) => {
      this.logger.error('AuditService.emit.async_failed', {
        action: params.action,
        error: (error as Error).message,
      });
    });
  }

  async list(
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      module?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 50;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
    };

    if (filters.userId) {
      query.user_id = new Types.ObjectId(filters.userId);
    }
    if (filters.action) {
      query.action = filters.action;
    }
    if (filters.module) {
      query.module = filters.module;
    }
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) {
        createdAt.$gte = new Date(filters.from);
      }
      if (filters.to) {
        createdAt.$lte = new Date(filters.to);
      }
      query.created_at = createdAt;
    }

    const [items, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getById(tenantId: string, id: string) {
    const log = await this.auditLogModel
      .findOne({
        _id: id,
        tenant_id: new Types.ObjectId(tenantId),
      })
      .lean();

    if (!log) {
      throw new AppError(ERRORS.AUDIT.NOT_FOUND);
    }

    return log;
  }

  async exportCsv(
    tenantId: string,
    filters: {
      userId?: string;
      action?: string;
      module?: string;
      from?: string;
      to?: string;
    },
  ): Promise<string> {
    const result = await this.list(tenantId, {
      ...filters,
      page: 1,
      limit: 5000,
    });

    const header =
      'id,created_at,user_id,action,module,entity_id,status,ip_address';
    const rows = result.items.map((item) => {
      const values = [
        item._id.toString(),
        item.created_at?.toISOString() ?? '',
        item.user_id?.toString() ?? '',
        item.action,
        item.module,
        item.entity_id ?? '',
        item.status,
        item.ip_address ?? '',
      ];
      return values
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    return [header, ...rows].join('\n');
  }

  private getQueueService(): QueueService {
    return this.moduleRef.get(QueueService, { strict: false });
  }
}
