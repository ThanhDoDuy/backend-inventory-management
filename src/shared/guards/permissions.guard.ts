import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { AppError, ERRORS } from '../errors';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { RequestUser } from '../interfaces/request-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly logger: AppLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = request.user;
    if (!user?.tenantId) {
      throw new AppError(ERRORS.AUTH.TENANT_CONTEXT_REQUIRED);
    }
    if (!this.rbacService.hasPermission(user.role, required)) {
      this.logger.warn('PermissionsGuard.canActivate', {
        userId: user.userId,
        role: user.role,
        permission: required,
      });
      throw new AppError(ERRORS.AUTH.PERMISSION_DENIED, {
        message: `Permission denied: ${required}`,
      });
    }
    return true;
  }
}
