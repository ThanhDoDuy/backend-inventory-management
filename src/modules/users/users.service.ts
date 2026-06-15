import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { Role as RoleCode } from '../../shared/constants/roles.enum';
import { UserStatus } from '../../shared/constants/roles.enum';
import { RbacService } from '../rbac/rbac.service';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private readonly rbacService: RbacService,
    private readonly logger: AppLoggerService,
  ) {}

  async countActiveInTenant(tenantId: string): Promise<number> {
    return this.userModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      status: UserStatus.ACTIVE,
      is_deleted: false,
    });
  }

  async assertCanCreateUser(tenantId: string): Promise<void> {
    this.logger.step('UsersService.assertCanCreateUser', { tenantId });

    const max = this.configService.get<number>('maxUsersPerTenant') ?? 20;
    const count = await this.countActiveInTenant(tenantId);
    if (count >= max) {
      throw new AppError(ERRORS.USER.LIMIT_REACHED, {
        message: `Maximum ${max} users per store reached`,
      });
    }
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
        is_deleted: false,
      })
      .populate('role_id', 'code name');
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        _id: id,
        is_deleted: false,
      })
      .populate('role_id', 'code name');
  }

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        _id: id,
        tenant_id: new Types.ObjectId(tenantId),
        is_deleted: false,
      })
      .populate('role_id', 'code name');
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
  ): Promise<UserDocument> {
    this.logger.step('UsersService.create', {
      tenantId,
      username: dto.username,
      email: dto.email,
      role_id: dto.role_id,
    });

    await this.assertCanCreateUser(tenantId);
    await this.rbacService.assertRoleInTenant(tenantId, dto.role_id);

    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new AppError(ERRORS.USER.EMAIL_IN_USE);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.userModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      username: dto.username,
      email: dto.email.toLowerCase(),
      password_hash: passwordHash,
      role_id: new Types.ObjectId(dto.role_id),
      status: UserStatus.ACTIVE,
    });
  }

  async createOwner(
    tenantId: string,
    username: string,
    email: string,
    password: string,
  ): Promise<UserDocument> {
    this.logger.step('UsersService.createOwner', { tenantId, username, email });

    const adminRole = await this.rbacService.getRoleByCodeInTenant(
      tenantId,
      RoleCode.ADMIN,
    );

    const passwordHash = await bcrypt.hash(password, 10);
    return this.userModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      username,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role_id: adminRole._id,
      status: UserStatus.ACTIVE,
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { last_login_at: new Date() },
    );
  }

  async list(
    tenantId: string,
    page = 1,
    limit = 20,
    search?: string,
    roleId?: string,
    status?: UserStatus,
  ) {
    this.logger.step('UsersService.list', {
      tenantId,
      page,
      limit,
      search,
      roleId,
      status,
    });

    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };
    if (roleId) filter.role_id = new Types.ObjectId(roleId);
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password_hash')
        .populate('role_id', 'code name')
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }),
      this.userModel.countDocuments(filter),
    ]);

    return {
      items: items.map((user) => this.toProfile(user)),
      total,
      page,
      limit,
    };
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserDocument> {
    this.logger.step('UsersService.update', { tenantId, id, ...dto });

    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }
    if (dto.username) user.username = dto.username;
    if (dto.role_id) {
      await this.rbacService.assertRoleInTenant(tenantId, dto.role_id);
      await this.assertCanDemoteLastAdmin(tenantId, user.role_id, dto.role_id);
      user.role_id = new Types.ObjectId(dto.role_id);
    }
    await user.save();
    return user;
  }

  async assignRole(
    tenantId: string,
    id: string,
    roleId: string,
  ): Promise<UserDocument> {
    this.logger.step('UsersService.assignRole', { tenantId, id, roleId });

    const user = await this.userModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });

    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }

    await this.rbacService.assertRoleInTenant(tenantId, roleId);

    if (user.role_id.toString() === roleId) {
      throw new AppError(ERRORS.USER.SAME_ROLE);
    }

    await this.assertCanDemoteLastAdmin(tenantId, user.role_id, roleId);

    user.role_id = new Types.ObjectId(roleId);
    await user.save();

    const updated = await this.findByIdInTenant(tenantId, id);
    if (!updated) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }

    return updated;
  }

  async disable(tenantId: string, id: string): Promise<UserDocument> {
    this.logger.step('UsersService.disable', { tenantId, id });

    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }
    user.status = UserStatus.DISABLED;
    await user.save();
    return user;
  }

  async activate(tenantId: string, id: string): Promise<UserDocument> {
    this.logger.step('UsersService.activate', { tenantId, id });

    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }
    if (user.status === UserStatus.ACTIVE) {
      throw new AppError(ERRORS.USER.ALREADY_ACTIVE);
    }

    await this.assertCanCreateUser(tenantId);

    user.status = UserStatus.ACTIVE;
    await user.save();
    return user;
  }

  async resetPassword(
    tenantId: string,
    id: string,
    newPassword: string,
  ): Promise<void> {
    this.logger.step('UsersService.resetPassword', { tenantId, id });

    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await user.save();
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.logger.step('UsersService.changePassword', { userId });

    const user = await this.findById(userId);
    if (!user) {
      throw new AppError(ERRORS.USER.NOT_FOUND);
    }
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new AppError(ERRORS.USER.OLD_PASSWORD_INCORRECT);
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await user.save();
  }

  private async assertCanDemoteLastAdmin(
    tenantId: string,
    currentRoleId: Types.ObjectId,
    newRoleId: string,
  ): Promise<void> {
    const adminRole = await this.rbacService.getRoleByCodeInTenant(
      tenantId,
      RoleCode.ADMIN,
    );
    const adminRoleId = adminRole._id.toString();

    if (currentRoleId.toString() !== adminRoleId) {
      return;
    }

    if (newRoleId === adminRoleId) {
      return;
    }

    const adminCount = await this.userModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      role_id: adminRole._id,
      is_deleted: false,
    });

    if (adminCount <= 1) {
      throw new AppError(ERRORS.USER.LAST_ADMIN_ROLE_CHANGE);
    }
  }

  toProfile(user: UserDocument) {
    const populatedRole = user.populated('role_id')
      ? (user.role_id as unknown as { _id: Types.ObjectId; code: string; name: string })
      : null;

    return {
      id: user._id,
      tenant_id: user.tenant_id,
      username: user.username,
      email: user.email,
      role_id: populatedRole?._id ?? user.role_id,
      role: populatedRole
        ? {
            id: populatedRole._id,
            code: populatedRole.code,
            name: populatedRole.name,
          }
        : undefined,
      status: user.status,
      last_login_at: user.last_login_at,
    };
  }
}
