import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { Role, RoleDocument } from './schemas/role.schema';

interface RoleCacheEntry {
  isWildcard: boolean;
  permissions: Set<string>;
}

@Injectable()
export class RbacService {
  private roleCache = new Map<string, RoleCacheEntry>();

  constructor(
    @InjectModel(Permission.name)
    private permissionModel: Model<PermissionDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async refreshCache(): Promise<void> {
    this.logger.step('RbacService.refreshCache', {});

    const roles = await this.roleModel
      .find({ is_active: true })
      .select('code is_wildcard permission_codes')
      .lean();

    const nextCache = new Map<string, RoleCacheEntry>();
    for (const role of roles) {
      nextCache.set(role.code, {
        isWildcard: role.is_wildcard,
        permissions: new Set(role.permission_codes),
      });
    }

    this.roleCache = nextCache;
  }

  hasPermission(roleCode: RoleCode | string, required: string): boolean {
    const role = this.roleCache.get(roleCode);
    if (!role) {
      return false;
    }

    if (role.isWildcard || role.permissions.has(PERMISSIONS.WILDCARD)) {
      return true;
    }

    if (role.permissions.has(required)) {
      return true;
    }

    const [resource] = required.split(':');
    return role.permissions.has(`${resource}:*`);
  }

  async listPermissions() {
    return this.permissionModel
      .find({ is_active: true })
      .sort({ module: 1, action: 1 })
      .lean();
  }

  async listRoles() {
    return this.roleModel.find({ is_active: true }).sort({ code: 1 }).lean();
  }

  async getRoleByCode(code: string) {
    const role = await this.roleModel.findOne({ code, is_active: true }).lean();
    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }
    return role;
  }

  async updateRolePermissions(code: string, dto: UpdateRolePermissionsDto) {
    this.logger.step('RbacService.updateRolePermissions', {
      code,
      count: dto.permission_codes.length,
    });

    const role = await this.roleModel.findOne({ code, is_active: true });
    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    if (role.is_system && role.is_wildcard) {
      throw new AppError(ERRORS.RBAC.SYSTEM_ROLE_PROTECTED);
    }

    const uniqueCodes = [...new Set(dto.permission_codes)];
    if (uniqueCodes.includes(PERMISSIONS.WILDCARD)) {
      role.is_wildcard = true;
      role.permission_codes = [PERMISSIONS.WILDCARD];
    } else {
      const existing = await this.permissionModel
        .find({ code: { $in: uniqueCodes }, is_active: true })
        .select('code')
        .lean();
      const existingCodes = new Set(existing.map((p) => p.code));
      const invalid = uniqueCodes.filter((c) => !existingCodes.has(c));
      if (invalid.length > 0) {
        throw new AppError(ERRORS.RBAC.INVALID_PERMISSIONS, {
          details: { invalid },
        });
      }

      role.is_wildcard = false;
      role.permission_codes = uniqueCodes;
    }

    await role.save();
    await this.refreshCache();
    return role.toObject();
  }
}
