import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { hasPermission } from '../constants/permissions';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { RequestUser } from '../interfaces/request-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
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
      throw new ForbiddenException('Tenant context required');
    }
    if (!hasPermission(user.role, required)) {
      this.logger.warn('PermissionsGuard.canActivate', {
        userId: user.userId,
        role: user.role,
        permission: required,
      });
      throw new ForbiddenException(`Permission denied: ${required}`);
    }
    return true;
  }
}
