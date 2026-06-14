import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '../../shared/constants/roles.enum';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {}

  async countActiveInTenant(tenantId: string): Promise<number> {
    return this.userModel.countDocuments({
      tenant_id: new Types.ObjectId(tenantId),
      status: UserStatus.ACTIVE,
      is_deleted: false,
    });
  }

  async assertCanCreateUser(tenantId: string): Promise<void> {
    const max = this.configService.get<number>('maxUsersPerTenant') ?? 20;
    const count = await this.countActiveInTenant(tenantId);
    if (count >= max) {
      throw new ConflictException({
        code: 'USER_LIMIT_REACHED',
        message: `Maximum ${max} users per store reached`,
      });
    }
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      email: email.toLowerCase(),
      is_deleted: false,
    });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      _id: id,
      is_deleted: false,
    });
  }

  async findByIdInTenant(
    tenantId: string,
    id: string,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne({
      _id: id,
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    });
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
  ): Promise<UserDocument> {
    await this.assertCanCreateUser(tenantId);

    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.userModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      username: dto.username,
      email: dto.email.toLowerCase(),
      password_hash: passwordHash,
      role: dto.role,
      status: UserStatus.ACTIVE,
    });
  }

  async createOwner(
    tenantId: string,
    username: string,
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(password, 10);
    return this.userModel.create({
      tenant_id: new Types.ObjectId(tenantId),
      username,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: Role.ADMIN,
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
    role?: Role,
    status?: UserStatus,
  ) {
    const filter: Record<string, unknown> = {
      tenant_id: new Types.ObjectId(tenantId),
      is_deleted: false,
    };
    if (role) filter.role = role;
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
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 }),
      this.userModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserDocument> {
    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (dto.username) user.username = dto.username;
    if (dto.role) user.role = dto.role;
    await user.save();
    return user;
  }

  async disable(tenantId: string, id: string): Promise<UserDocument> {
    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.status = UserStatus.DISABLED;
    await user.save();
    return user;
  }

  async resetPassword(
    tenantId: string,
    id: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByIdInTenant(tenantId, id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await user.save();
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      throw new ConflictException('Old password is incorrect');
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await user.save();
  }

  toProfile(user: UserDocument) {
    return {
      id: user._id,
      tenant_id: user.tenant_id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      last_login_at: user.last_login_at,
    };
  }
}
