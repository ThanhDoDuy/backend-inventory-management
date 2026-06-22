import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../logger/request-context.service';
import { QueueService } from './queue.service';
import { DomainEventPayload } from '../../shared/constants/app.constants';

@Injectable()
export class DomainEventPublisher {
  constructor(
    private readonly queueService: QueueService,
    private readonly requestContext: RequestContextService,
  ) {}

  async publish(event: DomainEventPayload): Promise<void> {
    const ctx = this.requestContext.get();
    await this.queueService.enqueueNotification({
      ...event,
      correlationId: event.correlationId ?? ctx?.correlationId ?? ctx?.requestId,
      requestId: event.requestId ?? ctx?.requestId,
    });
  }
}
