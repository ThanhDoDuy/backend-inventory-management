import { HttpException } from '@nestjs/common';
import { ErrorDefinition } from './error-definition.interface';

export interface AppErrorOptions {
  message?: string;
  details?: unknown;
}

export class AppError extends HttpException {
  readonly errorCode: number;

  constructor(definition: ErrorDefinition, options?: AppErrorOptions) {
    const message = options?.message ?? definition.message;

    super(
      {
        errorCode: definition.errorCode,
        message,
        ...(options?.details !== undefined && { details: options.details }),
      },
      definition.httpStatus,
    );

    this.errorCode = definition.errorCode;
  }
}
