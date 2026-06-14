import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { UserStatus } from '../../shared/constants/roles.enum';
import { JwtPayload } from '../../shared/interfaces/jwt-payload.interface';
import { SettingsService } from '../settings/settings.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../users/schemas/refresh-token.schema';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private settingsService: SettingsService,
    private rbacService: RbacService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly logger: AppLoggerService,
  ) {}

  async register(dto: RegisterDto) {
    this.logger.step('AuthService.register', {
      email: dto.email,
      tenantName: dto.tenantName,
      username: dto.username,
    });

    await this.tenantsService.assertCanCreateTenant();

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new AppError(ERRORS.USER.EMAIL_IN_USE);
    }

    const slug = this.tenantsService.slugify(dto.tenantName);
    const tenant = await this.tenantsService.create(dto.tenantName, slug);

    await this.rbacService.seedRolesForTenant(tenant._id.toString());
    await this.settingsService.seedForTenant(tenant._id.toString());

    const owner = await this.usersService.createOwner(
      tenant._id.toString(),
      dto.username,
      dto.email,
      dto.password,
    );

    tenant.owner_user_id = owner._id;
    await tenant.save();

    const tokens = await this.issueTokens(owner);
    return {
      ...tokens,
      user: this.usersService.toProfile(owner),
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }

  async login(dto: LoginDto) {
    this.logger.step('AuthService.login', { email: dto.email });

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn('AuthService.login', {
        email: dto.email,
        reason: 'user_not_found',
      });
      throw new AppError(ERRORS.AUTH.INVALID_CREDENTIALS);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(ERRORS.AUTH.USER_DISABLED);
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      this.logger.warn('AuthService.login', {
        email: dto.email,
        reason: 'invalid_password',
      });
      throw new AppError(ERRORS.AUTH.INVALID_CREDENTIALS);
    }

    await this.usersService.updateLastLogin(user._id.toString());
    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: this.usersService.toProfile(user),
    };
  }

  async refresh(refreshToken: string) {
    this.logger.step('AuthService.refresh', {});

    const stored = await this.refreshTokenModel.findOne({
      token: refreshToken,
      is_deleted: false,
      expired_at: { $gt: new Date() },
    });
    if (!stored) {
      throw new AppError(ERRORS.AUTH.INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersService.findById(stored.user_id.toString());
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError(ERRORS.AUTH.USER_NOT_FOUND_OR_DISABLED);
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      tenant_id: user.tenant_id.toString(),
      email: user.email,
      role_id: user.role_id.toString(),
    };

    const access_token = await this.jwtService.signAsync(payload);
    return { access_token };
  }

  async logout(userId: string, tenantId: string, accessToken?: string) {
    this.logger.step('AuthService.logout', { userId, tenantId });

    await this.refreshTokenModel.updateMany(
      { user_id: new Types.ObjectId(userId), is_deleted: false },
      { is_deleted: true },
    );

    if (accessToken) {
      const ttl = this.parseExpiresToSeconds(
        this.configService.get<string>('jwt.accessExpires') ?? '15m',
      );
      await this.redisService.set(`blacklist:${accessToken}`, '1', ttl);
    }

    await this.redisService.del(
      this.redisService.tenantKey(tenantId, 'refresh_token', userId),
    );

    return { message: 'Logout successfully' };
  }

  async profile(userId: string) {
    this.logger.step('AuthService.profile', { userId });

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new AppError(ERRORS.AUTH.USER_NOT_FOUND);
    }
    return this.usersService.toProfile(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    this.logger.step('AuthService.changePassword', { userId });

    if (dto.old_password === dto.new_password) {
      throw new AppError(ERRORS.AUTH.PASSWORD_UNCHANGED);
    }
    await this.usersService.changePassword(
      userId,
      dto.old_password,
      dto.new_password,
    );
    return { message: 'Password changed successfully' };
  }

  private async issueTokens(user: {
    _id: Types.ObjectId;
    tenant_id: Types.ObjectId;
    email: string;
    role_id: Types.ObjectId;
  }) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      tenant_id: user.tenant_id.toString(),
      email: user.email,
      role_id: user.role_id.toString(),
    };

    const access_token = await this.jwtService.signAsync(payload);
    const refresh_token = randomBytes(48).toString('hex');

    const refreshExpires =
      this.configService.get<string>('jwt.refreshExpires') ?? '7d';
    const expiresMs = this.parseExpiresToMs(refreshExpires);

    await this.refreshTokenModel.create({
      tenant_id: user.tenant_id,
      user_id: user._id,
      token: refresh_token,
      expired_at: new Date(Date.now() + expiresMs),
    });

    await this.redisService.set(
      this.redisService.tenantKey(
        user.tenant_id.toString(),
        'refresh_token',
        user._id.toString(),
      ),
      refresh_token,
      Math.floor(expiresMs / 1000),
    );

    return { access_token, refresh_token };
  }

  private parseExpiresToMs(expires: string): number {
    const match = expires.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }

  private parseExpiresToSeconds(expires: string): number {
    return Math.floor(this.parseExpiresToMs(expires) / 1000);
  }
}
