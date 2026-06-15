import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../../modules/audit/constants/audit.constants';
import { RbacService } from '../../modules/rbac/rbac.service';
import { AppError, ERRORS } from '../errors';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { RequestUser } from '../interfaces/request-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const allowed = await this.rbacService.hasPermission(
      user.tenantId,
      user.roleId,
      required,
    );

    if (!allowed) {
      this.auditService.emit({
        tenantId: user.tenantId,
        userId: user.userId,
        action: AUDIT_ACTIONS.PERMISSION_DENIED,
        module: AUDIT_MODULES.SECURITY,
        status: 'FAILED',
        metadata: { permission: required },
      });
      this.logger.warn('PermissionsGuard.canActivate', {
        userId: user.userId,
        roleId: user.roleId,
        permission: required,
      });
      throw new AppError(ERRORS.AUTH.PERMISSION_DENIED, {
        message: `Permission denied: ${required}`,
      });
    }

    return true;
  }
}
