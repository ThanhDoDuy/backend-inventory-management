import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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
      } else       if (typeof body === 'object' && body !== null) {
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
      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
      }
      if (status === HttpStatus.UNAUTHORIZED) {
        code = 'UNAUTHORIZED';
      }
      if (status === HttpStatus.FORBIDDEN) {
        code = 'FORBIDDEN';
      }
      if (status === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
      }
      if (status === HttpStatus.CONFLICT) {
        code = 'CONFLICT';
      }
    }

    response.status(status).json({
      success: false,
      data: null,
      error: { code, message },
      meta: {},
    });
  }
}
