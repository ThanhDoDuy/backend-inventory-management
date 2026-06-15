import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { RequestContextService } from './request-context.service';
import { sanitize } from './sanitize.util';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

@Injectable()
export class AppLoggerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly requestContext: RequestContextService,
  ) {}

  step(fn: string, data?: unknown, level: LogLevel = 'info'): void {
    this.log(level, fn, data);
  }

  warn(fn: string, data?: unknown): void {
    this.log('warn', fn, data);
  }

  error(fn: string, data?: unknown): void {
    this.log('error', fn, data);
  }

  debug(fn: string, data?: unknown): void {
    this.log('debug', fn, data);
  }

  private log(level: LogLevel, fn: string, data?: unknown): void {
    const ctx = this.requestContext.get();
    const sanitized =
      data && typeof data === 'object'
        ? (sanitize(data) as Record<string, unknown>)
        : data;

    this.logger.log(level, {
      requestId: ctx?.requestId ?? 'system',
      fn,
      tenantId: ctx?.tenantId,
      userId: ctx?.userId,
      data: sanitized ?? {},
    });
  }
}
