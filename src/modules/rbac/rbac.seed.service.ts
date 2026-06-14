import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { SEED_PERMISSIONS, SEED_ROLES } from './constants/rbac-seed.data';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { Role, RoleDocument } from './schemas/role.schema';
import { RbacService } from './rbac.service';

@Injectable()
export class RbacSeedService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Permission.name)
    private permissionModel: Model<PermissionDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    private readonly rbacService: RbacService,
    private readonly logger: AppLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    this.logger.step('RbacSeedService.seed', {});

    for (const permission of SEED_PERMISSIONS) {
      await this.permissionModel.updateOne(
        { code: permission.code },
        { $set: permission },
        { upsert: true },
      );
    }

    const activePermissionCodes = new Set(
      (
        await this.permissionModel.find({ is_active: true }).select('code').lean()
      ).map((p) => p.code),
    );
    activePermissionCodes.add('*');

    for (const role of SEED_ROLES) {
      const permissionCodes = role.permission_codes.filter((code) =>
        activePermissionCodes.has(code),
      );

      await this.roleModel.updateOne(
        { code: role.code },
        {
          $set: {
            name: role.name,
            description: role.description,
            is_system: true,
            is_active: true,
          },
          $setOnInsert: {
            is_wildcard: role.is_wildcard,
            permission_codes: permissionCodes,
          },
        },
        { upsert: true },
      );
    }

    await this.rbacService.refreshCache();
    this.logger.step('RbacSeedService.seed.completed', {
      permissions: SEED_PERMISSIONS.length,
      roles: SEED_ROLES.length,
    });
  }
}
