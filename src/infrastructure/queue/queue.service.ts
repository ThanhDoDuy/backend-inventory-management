import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { AppLoggerService } from '../logger/app-logger.service';
import { AuditPersistenceService } from '../../modules/audit/audit-persistence.service';
import { NotificationsProcessorService } from '../../modules/notifications/notifications-processor.service';
import {
  APP,
  AuditJobPayload,
  DomainEventPayload,
} from '../../shared/constants/app.constants';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private auditQueue?: Queue;
  private auditDlq?: Queue;
  private notificationQueue?: Queue;
  private auditWorker?: Worker;
  private notificationWorker?: Worker;
  private readonly seedMode = process.env.SEED_DEMO === 'true';

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
    private auditPersistenceService: AuditPersistenceService,
    private notificationsProcessorService: NotificationsProcessorService,
  ) {}

  onModuleInit(): void {
    if (this.seedMode) {
      this.logger.step('QueueService.initialized', {
        mode: 'seed (queues disabled, audit sync fallback)',
      });
      return;
    }

    const url = this.configService.get<string>('redisUrl')!;
    const connection = { url, maxRetriesPerRequest: null };

    this.auditQueue = new Queue(APP.queue.audit, { connection });
    this.auditDlq = new Queue(APP.queue.auditDlq, { connection });
    this.notificationQueue = new Queue(APP.queue.notification, { connection });

    const workerOptions = {
      connection,
      drainDelay: APP.queue.workerDrainDelaySeconds,
      stalledInterval: APP.queue.workerStalledIntervalMs,
    };

    this.auditWorker = new Worker(
      APP.queue.audit,
      async (job) => {
        await this.auditPersistenceService.write(
          job.data as AuditJobPayload,
        );
      },
      workerOptions,
    );

    this.notificationWorker = new Worker(
      APP.queue.notification,
      async (job) => {
        await this.notificationsProcessorService.processEvent(
          job.data as DomainEventPayload,
        );
      },
      workerOptions,
    );

    this.auditWorker.on('failed', (job, error) => {
      const maxAttempts = job?.opts.attempts ?? APP.queue.auditAttempts;
      if (job && job.attemptsMade >= maxAttempts) {
        void this.moveAuditToDlq(job.data as AuditJobPayload, error, job.id);
      }

      this.logger.error('QueueService.auditWorker.failed', {
        jobId: job?.id,
        attempts: job?.attemptsMade,
        error: error.message,
      });
    });

    this.notificationWorker.on('failed', (job, error) => {
      this.logger.error('QueueService.notificationWorker.failed', {
        jobId: job?.id,
        error: error.message,
      });
    });

    this.logger.step('QueueService.initialized', {
      auditQueue: APP.queue.audit,
      auditDlq: APP.queue.auditDlq,
      notificationQueue: APP.queue.notification,
    });
  }

  async enqueueAudit(payload: AuditJobPayload): Promise<void> {
    if (!this.auditQueue) {
      await this.auditPersistenceService.write(payload);
      return;
    }

    await this.auditQueue.add('audit', payload, {
      attempts: APP.queue.auditAttempts,
      backoff: {
        type: 'exponential',
        delay: APP.queue.auditBackoffMs,
      },
      removeOnComplete: APP.queue.removeOnComplete,
      removeOnFail: APP.queue.removeOnFail,
    });
  }

  async enqueueNotification(payload: DomainEventPayload): Promise<void> {
    if (this.seedMode || !this.notificationQueue) {
      return;
    }

    await this.notificationQueue.add('notification', payload, {
      removeOnComplete: APP.queue.removeOnComplete,
      removeOnFail: APP.queue.removeOnFail,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.seedMode) {
      return;
    }

    await Promise.allSettled([
      this.auditWorker?.close(),
      this.notificationWorker?.close(),
      this.auditQueue?.close(),
      this.auditDlq?.close(),
      this.notificationQueue?.close(),
    ]);
  }

  private async moveAuditToDlq(
    payload: AuditJobPayload,
    error: Error,
    jobId?: string,
  ): Promise<void> {
    if (!this.auditDlq) {
      return;
    }

    try {
      await this.auditDlq.add('audit-failed', {
        original_payload: payload,
        error_message: error.message,
        failed_at: new Date().toISOString(),
        original_job_id: jobId,
      });
    } catch (dlqError) {
      this.logger.error('QueueService.auditDlq.enqueue_failed', {
        eventId: payload.event_id,
        error: (dlqError as Error).message,
      });
    }
  }
}
