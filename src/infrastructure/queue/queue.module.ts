import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../../modules/audit/audit.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { DomainEventPublisher } from './domain-event.publisher';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [AuditModule, NotificationsModule, EmailModule],
  providers: [QueueService, DomainEventPublisher],
  exports: [QueueService, DomainEventPublisher],
})
export class QueueModule {}
