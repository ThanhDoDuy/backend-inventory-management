import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';
import { sanitize } from './sanitize.util';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: AppLoggerService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers['x-request-id'];
    const incoming =
      typeof header === 'string' && UUID_V4_REGEX.test(header)
        ? header
        : randomUUID();

    req.requestId = incoming;
    res.setHeader('x-request-id', incoming);

    const path = req.originalUrl.split('?')[0];
    const isHealth = path.includes('/health');

    this.requestContext.run(
      {
        requestId: incoming,
        method: req.method,
        path: req.originalUrl,
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
