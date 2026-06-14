import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        if (typeof obj.code === 'string') {
          code = obj.code;
        }
        if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (Array.isArray(obj.message)) {
          message = obj.message.join(', ');
        } else if (typeof obj.error === 'string') {
          code = obj.error;
        }
      }
      if (status === HttpStatus.BAD_REQUEST && code === 'INTERNAL_ERROR') {
        code = 'VALIDATION_ERROR';
      }
      if (status === HttpStatus.UNAUTHORIZED && code === 'INTERNAL_ERROR') {
        code = 'UNAUTHORIZED';
      }
      if (status === HttpStatus.FORBIDDEN && code === 'INTERNAL_ERROR') {
        code = 'FORBIDDEN';
      }
      if (status === HttpStatus.NOT_FOUND && code === 'INTERNAL_ERROR') {
        code = 'NOT_FOUND';
      }
      if (status === HttpStatus.CONFLICT && code === 'INTERNAL_ERROR') {
        code = 'CONFLICT';
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error('HttpExceptionFilter.catch', { code, message, status });
    } else if (
      status === HttpStatus.UNAUTHORIZED ||
      status === HttpStatus.FORBIDDEN
    ) {
      this.logger.warn('HttpExceptionFilter.catch', { code, message, status });
    }

    response.status(status).json({
      success: false,
      data: null,
      error: { code, message },
      meta: {},
    });
  }
}
