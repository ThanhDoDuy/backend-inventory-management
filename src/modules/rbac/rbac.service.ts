import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppError, ERRORS } from '../../shared/errors';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SEED_ROLES } from './constants/rbac-seed.data';
import {
  APP,
  rbacRoleCacheKey,
  rbacTenantRolesCachePattern,
} from '../../shared/constants/app.constants';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { Role, RoleDocument } from './schemas/role.schema';

const RESERVED_SYSTEM_CODES = new Set<string>(Object.values(RoleCode));

interface RoleCachePayload {
  isWildcard: boolean;
  permissionCodes: string[];
}

@Injectable()
export class RbacService {
  constructor(
    @InjectModel(Permission.name)
    private permissionModel: Model<PermissionDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly redisService: RedisService,
    private readonly logger: AppLoggerService,
  ) {}

  async hasPermission(
    tenantId: string,
    roleId: string,
    required: string,
  ): Promise<boolean> {
    const role = await this.getRolePermissions(tenantId, roleId);
    if (!role) {
      return false;
    }

    if (role.isWildcard || role.permissionCodes.includes(PERMISSIONS.WILDCARD)) {
      return true;
    }

    if (role.permissionCodes.includes(required)) {
      return true;
    }

    const [resource] = required.split(':');
    return role.permissionCodes.includes(`${resource}:*`);
  }

  async getRolePermissionCodes(tenantId: string, roleId: string) {
    const role = await this.getRolePermissions(tenantId, roleId);
    if (!role) {
      throw new AppError(ERRORS.RBAC.ROLE_NOT_FOUND);
    }

    return {
      is_wildcard: role.isWildcard,
      permission_codes: role.permissionCodes,
    };
  }

  async listPermissions() {
    const cached = await this.redisService.get(APP.rbac.permissionsCacheKey);
    if (cached) {
      return JSON.parse(cached) as Permission[];
    }

    const permissions = await this.permissionModel
      .find({ is_active: true })
      .sort({ module: 1, action: 1 })
      .lean();

    await this.redisService.set(
      APP.rbac.permissionsCacheKey,
      JSON.stringify(permissions),
      APP.rbac.cacheTtlSeconds,
    );

    return permissions;
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

    await this.cacheRoleFromDocument(tenantId, role);
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
    await this.invalidateRoleCache(tenantId, id);
    await this.cacheRoleFromDocument(tenantId, role);
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
    await this.invalidateRoleCache(tenantId, id);
    return { message: 'Role deleted successfully' };
  }

  async clearRbacCache(tenantId: string) {
    this.logger.step('RbacService.clearRbacCache', { tenantId });

    try {
      const [rolesDeleted, permissionsCleared] = await Promise.all([
        this.redisService.delByPattern(rbacTenantRolesCachePattern(tenantId)),
        this.clearPermissionsCache(),
      ]);

      return {
        message: 'RBAC cache cleared successfully',
        roles_deleted: rolesDeleted,
        permissions_cache_cleared: permissionsCleared,
      };
    } catch (error) {
      this.logger.warn('RbacService.clearRbacCache skipped', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        message: 'RBAC cache clear skipped (Redis unavailable)',
        roles_deleted: 0,
        permissions_cache_cleared: false,
      };
    }
  }

  async clearRbacCacheForSeed(): Promise<void> {
    await this.clearPermissionsCache();
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

      const setFields: Record<string, unknown> = {
        name: seedRole.name,
        description: seedRole.description,
        is_system: true,
        is_active: true,
      };

      if (seedRole.is_wildcard) {
        setFields.is_wildcard = true;
        setFields.permission_codes = [PERMISSIONS.WILDCARD];
      }

      await this.roleModel.updateOne(
        { tenant_id: tenantObjectId, code: seedRole.code },
        {
          $set: setFields,
          $setOnInsert: {
            tenant_id: tenantObjectId,
            code: seedRole.code,
            ...(!seedRole.is_wildcard && {
              is_wildcard: false,
              permission_codes: permissionCodes,
            }),
          },
        },
        { upsert: true },
      );
    }

    await this.clearRbacCache(tenantId);
    await this.warmTenantRoleCaches(tenantId);
  }

  private async getRolePermissions(
    tenantId: string,
    roleId: string,
  ): Promise<RoleCachePayload | null> {
    const cacheKey = rbacRoleCacheKey(tenantId, roleId);
    let cached: string | null = null;

    try {
      cached = await this.redisService.get(cacheKey);
    } catch (error) {
      this.logger.warn('RbacService.getRolePermissions cache read skipped', {
        tenantId,
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (cached) {
      return JSON.parse(cached) as RoleCachePayload;
    }

    const role = await this.roleModel
      .findOne({
        _id: roleId,
        tenant_id: new Types.ObjectId(tenantId),
        is_active: true,
      })
      .select('is_wildcard permission_codes')
      .lean();

    if (!role) {
      return null;
    }

    const payload: RoleCachePayload = {
      isWildcard: role.is_wildcard,
      permissionCodes: role.permission_codes,
    };

    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(payload),
        APP.rbac.cacheTtlSeconds,
      );
    } catch (error) {
      this.logger.warn('RbacService.getRolePermissions cache write skipped', {
        tenantId,
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return payload;
  }

  private async cacheRoleFromDocument(
    tenantId: string,
    role: Pick<RoleDocument, '_id' | 'is_wildcard' | 'permission_codes'>,
  ): Promise<void> {
    const payload: RoleCachePayload = {
      isWildcard: role.is_wildcard,
      permissionCodes: role.permission_codes,
    };

    try {
      await this.redisService.set(
        rbacRoleCacheKey(tenantId, role._id.toString()),
        JSON.stringify(payload),
        APP.rbac.cacheTtlSeconds,
      );
    } catch (error) {
      this.logger.warn('RbacService.cacheRoleFromDocument skipped', {
        tenantId,
        roleId: role._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async invalidateRoleCache(
    tenantId: string,
    roleId: string,
  ): Promise<void> {
    try {
      await this.redisService.del(rbacRoleCacheKey(tenantId, roleId));
    } catch (error) {
      this.logger.warn('RbacService.invalidateRoleCache skipped', {
        tenantId,
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async clearPermissionsCache(): Promise<boolean> {
    try {
      await this.redisService.del(APP.rbac.permissionsCacheKey);
      return true;
    } catch (error) {
      this.logger.warn('RbacService.clearPermissionsCache skipped', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async warmTenantRoleCaches(tenantId: string): Promise<void> {
    const roles = await this.roleModel
      .find({
        tenant_id: new Types.ObjectId(tenantId),
        is_active: true,
      })
      .select('_id is_wildcard permission_codes')
      .lean();

    try {
      await Promise.all(
        roles.map((role) =>
          this.redisService.set(
            rbacRoleCacheKey(tenantId, role._id.toString()),
            JSON.stringify({
              isWildcard: role.is_wildcard,
              permissionCodes: role.permission_codes,
            } satisfies RoleCachePayload),
            APP.rbac.cacheTtlSeconds,
          ),
        ),
      );
    } catch (error) {
      this.logger.warn('RbacService.warmTenantRoleCaches skipped', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
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
