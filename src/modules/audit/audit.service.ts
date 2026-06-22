import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RequestContextService } from '../../infrastructure/logger/request-context.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import {
  AuditErrorPayload,
  AuditJobPayload,
} from '../../shared/constants/app.constants';
import { AppError, ERRORS } from '../../shared/errors';
import {
  resolveAuditCategory,
  SECURITY_AUDIT_ACTIONS,
} from './constants/audit.constants';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { sanitizeAuditRecord } from './utils/audit-sanitizer.util';

export interface AuditEmitParams {
  tenantId?: string;
  userId?: string;
  actorUsername?: string;
  action: string;
  module: string;
  category?: string;
  entityId?: string;
  status?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  source?: string;
  error?: AuditErrorPayload;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLogDocument>,
    private auditPersistenceService: AuditPersistenceService,
    private requestContext: RequestContextService,
    private moduleRef: ModuleRef,
    private readonly logger: AppLoggerService,
  ) {}

  emit(params: AuditEmitParams): void {
    const ctx = this.requestContext.get();
    const payload: AuditJobPayload = {
      event_id: randomUUID(),
      tenant_id: params.tenantId ?? ctx?.tenantId,
      user_id: params.userId ?? ctx?.userId,
      actor_username: params.actorUsername,
      action: params.action,
      module: params.module,
      category: params.category ?? resolveAuditCategory(params.module),
      entity_id: params.entityId,
      status: params.status ?? 'SUCCESS',
      old_value: sanitizeAuditRecord(params.oldValue),
      new_value: sanitizeAuditRecord(params.newValue),
      ip_address: params.ipAddress ?? ctx?.ipAddress ?? '',
      user_agent: params.userAgent ?? ctx?.userAgent ?? '',
      request_id: params.requestId ?? ctx?.requestId ?? '',
      correlation_id:
        params.correlationId ?? ctx?.correlationId ?? ctx?.requestId ?? '',
      source: params.source ?? ctx?.source ?? 'API',
      error: params.error,
      duration_ms: params.durationMs,
      metadata: sanitizeAuditRecord(params.metadata),
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
      entityId?: string;
      correlationId?: string;
      category?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const query = this.buildFilterQuery(tenantId, filters);

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

  async listByCorrelation(tenantId: string, correlationId: string, limit = 50) {
    const items = await this.auditLogModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        correlation_id: correlationId,
      })
      .sort({ created_at: 1 })
      .limit(limit)
      .lean();

    return { items };
  }

  async exportCsv(
    tenantId: string,
    filters: {
      userId?: string;
      action?: string;
      module?: string;
      entityId?: string;
      correlationId?: string;
      category?: string;
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
      'event_id,created_at,user_id,action,module,category,entity_id,status,ip_address,request_id,correlation_id';
    const rows = result.items.map((item) => {
      const values = [
        item.event_id ?? '',
        item.created_at?.toISOString() ?? '',
        item.user_id?.toString() ?? '',
        item.action,
        item.module,
        item.category ?? '',
        item.entity_id ?? '',
        item.status,
        item.ip_address ?? '',
        item.request_id ?? '',
        item.correlation_id ?? '',
      ];
      return values
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    return [header, ...rows].join('\n');
  }

  private buildFilterQuery(
    tenantId: string,
    filters: {
      userId?: string;
      action?: string;
      module?: string;
      entityId?: string;
      correlationId?: string;
      category?: string;
      from?: string;
      to?: string;
    },
  ): Record<string, unknown> {
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
    if (filters.entityId) {
      query.entity_id = filters.entityId;
    }
    if (filters.correlationId) {
      query.correlation_id = filters.correlationId;
    }
    if (filters.category) {
      query.category = filters.category;
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

    return query;
  }

  private getQueueService(): QueueService {
    return this.moduleRef.get(QueueService, { strict: false });
  }
}
