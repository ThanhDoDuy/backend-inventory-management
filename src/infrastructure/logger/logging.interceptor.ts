import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from './app-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const path = req.route?.path ?? req.path;
    const isHealth = path.includes('/health');

    const start = Date.now();
    const slowMs = this.configService.get<number>('log.slowMs') ?? 500;

    return next.handle().pipe(
      tap({
        next: () => {
          if (isHealth) {
            return;
          }
          const res = http.getResponse<Response>();
          const durationMs = Date.now() - start;
          const fn = `HTTP.${req.method} ${path}.completed`;
          const data = { statusCode: res.statusCode, durationMs };

          if (durationMs >= slowMs) {
            this.logger.warn(fn, data);
          } else {
            this.logger.step(fn, data);
          }
        },
        error: (error: Error) => {
          if (isHealth) {
            return;
          }
          const durationMs = Date.now() - start;
          this.logger.error(`HTTP.${req.method} ${path}.failed`, {
            durationMs,
            error: error.message,
          });
        },
      }),
    );
  }
}
