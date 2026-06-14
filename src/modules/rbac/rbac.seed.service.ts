import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SEED_PERMISSIONS } from './constants/rbac-seed.data';
import { Permission, PermissionDocument } from './schemas/permission.schema';
import { Role, RoleDocument } from './schemas/role.schema';
import { RbacService } from './rbac.service';

interface LegacyUser {
  _id: Types.ObjectId;
  tenant_id: Types.ObjectId;
  role?: RoleCode;
  role_id?: Types.ObjectId;
}

@Injectable()
export class RbacSeedService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Permission.name)
    private permissionModel: Model<PermissionDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly rbacService: RbacService,
    private readonly logger: AppLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  async seed(): Promise<void> {
    this.logger.step('RbacSeedService.seed', {});

    await this.seedPermissions();
    await this.roleModel.deleteMany({ tenant_id: { $exists: false } });
    await this.ensureTenantRoles();
    await this.migrateLegacyUsers();
    await this.rbacService.refreshCache();

    this.logger.step('RbacSeedService.seed.completed', {
      permissions: SEED_PERMISSIONS.length,
    });
  }

  private async seedPermissions(): Promise<void> {
    for (const permission of SEED_PERMISSIONS) {
      await this.permissionModel.updateOne(
        { code: permission.code },
        { $set: permission },
        { upsert: true },
      );
    }
  }

  private async ensureTenantRoles(): Promise<void> {
    const tenants = await this.tenantModel.find().select('_id').lean();
    for (const tenant of tenants) {
      await this.rbacService.seedRolesForTenant(tenant._id.toString());
    }
  }

  private async migrateLegacyUsers(): Promise<void> {
    const users = await this.userModel
      .find({
        is_deleted: false,
        $or: [{ role_id: { $exists: false } }, { role_id: null }],
      })
      .select('_id tenant_id role role_id')
      .lean<LegacyUser[]>();

    for (const user of users) {
      if (!user.role) {
        continue;
      }

      const role = await this.roleModel
        .findOne({
          tenant_id: user.tenant_id,
          code: user.role,
          is_active: true,
        })
        .select('_id')
        .lean();

      if (!role) {
        continue;
      }

      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: { role_id: role._id },
          $unset: { role: 1 },
        },
      );
    }
  }
}
