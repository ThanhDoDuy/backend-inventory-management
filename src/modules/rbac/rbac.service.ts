import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SEED_ROLES } from './constants/rbac-seed.data';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { Role, RoleDocument } from './schemas/role.schema';

const RESERVED_SYSTEM_CODES = new Set<string>(Object.values(RoleCode));

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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async refreshCache(): Promise<void> {
    this.logger.step('RbacService.refreshCache', {});

    const roles = await this.roleModel
      .find({ is_active: true })
      .select('_id is_wildcard permission_codes')
      .lean();

    const nextCache = new Map<string, RoleCacheEntry>();
    for (const role of roles) {
      nextCache.set(role._id.toString(), {
        isWildcard: role.is_wildcard,
        permissions: new Set(role.permission_codes),
      });
    }

    this.roleCache = nextCache;
  }

  hasPermission(roleId: string, required: string): boolean {
    const role = this.roleCache.get(roleId);
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

  async listRoles(tenantId: string) {
    return this.roleModel
      .find({ tenant_id: new Types.ObjectId(tenantId), is_active: true })
      .sort({ is_system: -1, code: 1 })
      .lean();
  }

  async getRoleById(tenantId: string, id: string) {
    const role = await this.roleModel
      .findOne({
        _id: id,
        tenant_id: new Types.ObjectId(tenantId),
        is_active: true,
      })
      .lean();

    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    return role;
  }

  async getRoleByCodeInTenant(tenantId: string, code: RoleCode | string) {
    const role = await this.roleModel
      .findOne({
        tenant_id: new Types.ObjectId(tenantId),
        code,
        is_active: true,
      })
      .lean();

    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    return role;
  }

  async assertRoleInTenant(tenantId: string, roleId: string): Promise<void> {
    const exists = await this.roleModel.exists({
      _id: roleId,
      tenant_id: new Types.ObjectId(tenantId),
      is_active: true,
    });

    if (!exists) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }
  }

  async createRole(tenantId: string, dto: CreateRoleDto) {
    this.logger.step('RbacService.createRole', {
      tenantId,
      code: dto.code,
    });

    if (RESERVED_SYSTEM_CODES.has(dto.code)) {
      throw new AppError(ERRORS.RBAC.ROLE_CODE_RESERVED);
    }

    const duplicate = await this.roleModel.exists({
      tenant_id: new Types.ObjectId(tenantId),
      code: dto.code,
    });
    if (duplicate) {
      throw new AppError(ERRORS.RBAC.ROLE_CODE_EXISTS);
    }

    const permissionCodes = await this.resolvePermissionCodes(
      dto.permission_codes,
      { allowWildcard: false },
    );

    const role = await this.roleModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      code: dto.code,
      name: dto.name,
      description: dto.description ?? '',
      permission_codes: permissionCodes,
      is_wildcard: false,
      is_system: false,
      is_active: true,
    });

    await this.refreshCache();
    return role.toObject();
  }

  async updateRole(tenantId: string, id: string, dto: UpdateRoleDto) {
    this.logger.step('RbacService.updateRole', { tenantId, id });

    const role = await this.roleModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_active: true,
    });

    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    if (role.is_system && role.is_wildcard) {
      throw new AppError(ERRORS.RBAC.SYSTEM_ROLE_PROTECTED);
    }

    if (dto.name !== undefined) {
      role.name = dto.name;
    }
    if (dto.description !== undefined) {
      role.description = dto.description;
    }
    if (dto.permission_codes !== undefined) {
      role.permission_codes = await this.resolvePermissionCodes(
        dto.permission_codes,
        { allowWildcard: role.is_wildcard },
      );
      role.is_wildcard = role.permission_codes.includes(PERMISSIONS.WILDCARD);
    }

    await role.save();
    await this.refreshCache();
    return role.toObject();
  }

  async deleteRole(tenantId: string, id: string) {
    this.logger.step('RbacService.deleteRole', { tenantId, id });

    const role = await this.roleModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_active: true,
    });

    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    if (role.is_system) {
      throw new AppError(ERRORS.RBAC.SYSTEM_ROLE_PROTECTED);
    }

    const usersAssigned = await this.userModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      role_id: role._id,
      is_deleted: false,
    });

    if (usersAssigned > 0) {
      throw new AppError(ERRORS.RBAC.ROLE_IN_USE, {
        details: { usersAssigned },
      });
    }

    role.is_active = false;
    await role.save();
    await this.refreshCache();
    return { message: 'Role deleted successfully' };
  }

  async seedRolesForTenant(tenantId: string): Promise<void> {
    this.logger.step('RbacService.seedRolesForTenant', { tenantId });

    const activePermissionCodes = new Set(
      (
        await this.permissionModel.find({ is_active: true }).select('code').lean()
      ).map((p) => p.code),
    );
    activePermissionCodes.add(PERMISSIONS.WILDCARD);

    const tenantObjectId = new Types.ObjectId(tenantId);

    for (const seedRole of SEED_ROLES) {
      const permissionCodes = seedRole.permission_codes.filter((code) =>
        activePermissionCodes.has(code),
      );

      await this.roleModel.updateOne(
        { tenant_id: tenantObjectId, code: seedRole.code },
        {
          $set: {
            name: seedRole.name,
            description: seedRole.description,
            is_system: true,
            is_active: true,
          },
          $setOnInsert: {
            tenant_id: tenantObjectId,
            code: seedRole.code,
            is_wildcard: seedRole.is_wildcard,
            permission_codes: permissionCodes,
          },
        },
        { upsert: true },
      );
    }
  }

  private async resolvePermissionCodes(
    permissionCodes: string[],
    options: { allowWildcard: boolean },
  ): Promise<string[]> {
    const uniqueCodes = [...new Set(permissionCodes)];

    if (uniqueCodes.length === 0) {
      throw new AppError(ERRORS.RBAC.INVALID_PERMISSIONS, {
        message: 'At least one permission is required',
      });
    }

    if (uniqueCodes.includes(PERMISSIONS.WILDCARD)) {
      if (!options.allowWildcard) {
        throw new AppError(ERRORS.RBAC.INVALID_PERMISSIONS, {
          message: 'Wildcard permission is not allowed for this role',
        });
      }
      return [PERMISSIONS.WILDCARD];
    }

    const existing = await this.permissionModel
      .find({ code: { $in: uniqueCodes }, is_active: true })
      .select('code')
      .lean();
    const existingCodes = new Set(existing.map((p) => p.code));
    const invalid = uniqueCodes.filter((code) => !existingCodes.has(code));

    if (invalid.length > 0) {
      throw new AppError(ERRORS.RBAC.INVALID_PERMISSIONS, {
        details: { invalid },
      });
    }

    return uniqueCodes;
  }
}
