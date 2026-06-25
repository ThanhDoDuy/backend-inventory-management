import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';
import { sanitize } from './sanitize.util';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && UUID_V4_REGEX.test(header)) {
    return header;
  }
  return randomUUID();
}

function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? '';
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: AppLoggerService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = resolveRequestId(req.headers['x-request-id']);
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationId =
      typeof correlationHeader === 'string' &&
      UUID_V4_REGEX.test(correlationHeader)
        ? correlationHeader
        : incoming;

    req.requestId = incoming;
    res.setHeader('x-request-id', incoming);
    res.setHeader('x-correlation-id', correlationId);

    const path = req.originalUrl.split('?')[0];
    const isHealth = path.includes('/health');

    this.requestContext.run(
      {
        requestId: incoming,
        correlationId,
        method: req.method,
        path: req.originalUrl,
        ipAddress: resolveClientIp(req),
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : '',
        source: 'API',
      },
      () => {
        if (!isHealth) {
          this.logger.step(`HTTP.${req.method} ${path}`, {
            query: sanitize(req.query),
            params: sanitize(req.params),
            body: sanitize(req.body),
          });
        }
        next();
      },
    );
  }
}
