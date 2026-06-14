import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError } from '../errors/app.error';
import { ERRORS } from '../errors/errors';

interface ErrorBody {
  errorCode: number;
  message: string;
  details?: unknown;
}

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const body = this.resolveErrorBody(exception);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error('HttpExceptionFilter.catch', body);
      } else if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN
      ) {
        this.logger.warn('HttpExceptionFilter.catch', body);
      }
    } else {
      this.logger.error('HttpExceptionFilter.catch', body);
    }

    response.status(this.resolveHttpStatus(exception)).json({
      success: false,
      data: null,
      error: body,
      meta: {},
    });
  }

  private resolveErrorBody(exception: unknown): ErrorBody {
    if (exception instanceof AppError) {
      return this.extractFromHttpException(exception);
    }

    if (exception instanceof HttpException) {
      const extracted = this.extractFromHttpException(exception);
      if (extracted.errorCode !== ERRORS.COMMON.INTERNAL_ERROR.errorCode) {
        return extracted;
      }
      return this.mapLegacyHttpException(exception, extracted.message);
    }

    return {
      errorCode: ERRORS.COMMON.INTERNAL_ERROR.errorCode,
      message: ERRORS.COMMON.INTERNAL_ERROR.message,
    };
  }

  private extractFromHttpException(exception: HttpException): ErrorBody {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;

      if (typeof obj.errorCode === 'number') {
        return {
          errorCode: obj.errorCode,
          message:
            typeof obj.message === 'string'
              ? obj.message
              : ERRORS.COMMON.INTERNAL_ERROR.message,
          ...(obj.details !== undefined && { details: obj.details }),
        };
      }

      const message = this.extractMessage(obj);
      return {
        errorCode: ERRORS.COMMON.INTERNAL_ERROR.errorCode,
        message,
        ...(Array.isArray(obj.message) && { details: obj.message }),
      };
    }

    return {
      errorCode: ERRORS.COMMON.INTERNAL_ERROR.errorCode,
      message:
        typeof response === 'string'
          ? response
          : ERRORS.COMMON.INTERNAL_ERROR.message,
    };
  }

  private mapLegacyHttpException(
    exception: HttpException,
    message: string,
  ): ErrorBody {
    const status = exception.getStatus();

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return {
          errorCode: ERRORS.COMMON.VALIDATION_FAILED.errorCode,
          message:
            message === ERRORS.COMMON.INTERNAL_ERROR.message
              ? ERRORS.COMMON.VALIDATION_FAILED.message
              : message,
        };
      case HttpStatus.UNAUTHORIZED:
        return {
          errorCode: ERRORS.AUTH.INVALID_TOKEN.errorCode,
          message:
            message === ERRORS.COMMON.INTERNAL_ERROR.message
              ? ERRORS.AUTH.INVALID_TOKEN.message
              : message,
        };
      case HttpStatus.FORBIDDEN:
        return {
          errorCode: ERRORS.AUTH.TENANT_CONTEXT_REQUIRED.errorCode,
          message,
        };
      case HttpStatus.NOT_FOUND:
        return {
          errorCode: ERRORS.USER.NOT_FOUND.errorCode,
          message,
        };
      case HttpStatus.CONFLICT:
        return {
          errorCode: ERRORS.USER.EMAIL_IN_USE.errorCode,
          message,
        };
      default:
        return {
          errorCode: ERRORS.COMMON.INTERNAL_ERROR.errorCode,
          message,
        };
    }
  }

  private extractMessage(obj: Record<string, unknown>): string {
    if (typeof obj.message === 'string') {
      return obj.message;
    }
    if (Array.isArray(obj.message)) {
      return obj.message.join(', ');
    }
    if (typeof obj.error === 'string') {
      return obj.error;
    }
    return ERRORS.COMMON.INTERNAL_ERROR.message;
  }

  private resolveHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
