import { Injectable } from '@nestjs/common';
import { QueueService } from './queue.service';
import { DomainEventPayload } from './queue.constants';

@Injectable()
export class DomainEventPublisher {
  constructor(private readonly queueService: QueueService) {}

  async publish(event: DomainEventPayload): Promise<void> {
    await this.queueService.enqueueNotification(event);
  }
}
