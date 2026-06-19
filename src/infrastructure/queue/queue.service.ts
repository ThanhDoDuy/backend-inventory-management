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
  private auditQueue: Queue;
  private notificationQueue: Queue;
  private auditWorker?: Worker;
  private notificationWorker?: Worker;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
    private auditPersistenceService: AuditPersistenceService,
    private notificationsProcessorService: NotificationsProcessorService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redisUrl')!;
    const connection = { url, maxRetriesPerRequest: null };

    this.auditQueue = new Queue(APP.queue.audit, { connection });
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
      this.logger.error('QueueService.auditWorker.failed', {
        jobId: job?.id,
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
      notificationQueue: APP.queue.notification,
    });
  }

  async enqueueAudit(payload: AuditJobPayload): Promise<void> {
    await this.auditQueue.add('audit', payload, {
      removeOnComplete: APP.queue.removeOnComplete,
      removeOnFail: APP.queue.removeOnFail,
    });
  }

  async enqueueNotification(payload: DomainEventPayload): Promise<void> {
    await this.notificationQueue.add('notification', payload, {
      removeOnComplete: APP.queue.removeOnComplete,
      removeOnFail: APP.queue.removeOnFail,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.auditWorker?.close();
    await this.notificationWorker?.close();
    await this.auditQueue?.close();
    await this.notificationQueue?.close();
  }
}
