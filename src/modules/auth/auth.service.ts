import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../../infrastructure/email/email.service';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { AppError, ERRORS } from '../../shared/errors';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import { UserStatus } from '../../shared/constants/roles.enum';
import { JwtPayload } from '../../shared/interfaces/jwt-payload.interface';
import { toObjectIdString } from '../../shared/utils/mongo-id.util';
import { SettingsService } from '../settings/settings.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../users/schemas/refresh-token.schema';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';
import { PasswordResetRateLimiterService } from './password-reset-rate-limiter.service';

@Injectable()
export class AuthService {
  private readonly forgotPasswordMessage =
    'If an account with that email exists, a password reset link has been sent.';

  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private settingsService: SettingsService,
    private priceTiersService: PriceTiersService,
    private rbacService: RbacService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private auditService: AuditService,
    private emailService: EmailService,
    private passwordResetRateLimiter: PasswordResetRateLimiterService,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(PasswordResetToken.name)
    private passwordResetTokenModel: Model<PasswordResetTokenDocument>,
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
    await this.priceTiersService.seedForTenant(tenant._id.toString());

    const owner = await this.usersService.createOwner(
      tenant._id.toString(),
      dto.username,
      dto.email,
      dto.password,
    );

    tenant.owner_user_id = owner._id;
    await tenant.save();

    const tokens = await this.issueTokens(owner);
    this.auditService.emit({
      tenantId: tenant._id.toString(),
      userId: owner._id.toString(),
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
      metadata: { event: 'REGISTER_TENANT' },
    });
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
      this.auditService.emit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        module: AUDIT_MODULES.SECURITY,
        status: 'FAILED',
        metadata: { email: dto.email, reason: 'user_not_found' },
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
      this.auditService.emit({
        tenantId: user.tenant_id.toString(),
        userId: user._id.toString(),
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        module: AUDIT_MODULES.SECURITY,
        status: 'FAILED',
        metadata: { email: dto.email, reason: 'invalid_password' },
      });
      throw new AppError(ERRORS.AUTH.INVALID_CREDENTIALS);
    }

    await this.usersService.updateLastLogin(user._id.toString());
    const tokens = await this.issueTokens(user);
    this.auditService.emit({
      tenantId: user.tenant_id.toString(),
      userId: user._id.toString(),
      action: AUDIT_ACTIONS.LOGIN,
      module: AUDIT_MODULES.AUTH,
    });
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
      role_id: toObjectIdString(user.role_id),
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

    this.auditService.emit({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.LOGOUT,
      module: AUDIT_MODULES.AUTH,
    });

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

  async permissions(tenantId: string, roleId: string) {
    return this.rbacService.getRolePermissionCodes(tenantId, roleId);
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

    const user = await this.usersService.findById(userId);
    this.auditService.emit({
      tenantId: user?.tenant_id.toString(),
      userId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      module: AUDIT_MODULES.AUTH,
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    this.logger.step('AuthService.forgotPassword', { email: dto.email });

    await this.passwordResetRateLimiter.assertCanRequest(dto.email);
    await this.passwordResetRateLimiter.recordRequest(dto.email);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { message: this.forgotPasswordMessage };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresMinutes =
      this.configService.get<number>('passwordReset.expiresMinutes') ?? 15;

    await this.passwordResetTokenModel.updateMany(
      { user_id: user._id, is_deleted: false },
      { is_deleted: true },
    );

    await this.passwordResetTokenModel.create({
      user_id: user._id,
      token_hash: tokenHash,
      expired_at: new Date(Date.now() + expiresMinutes * 60 * 1000),
    });

    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:3001';
    const resetUrl = `${frontendUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.emailService.sendPasswordReset(user.email, {
        username: user.username,
        resetUrl,
        expiresMinutes,
      });
    } catch {
      throw new AppError(ERRORS.AUTH.EMAIL_SEND_FAILED);
    }

    this.auditService.emit({
      tenantId: user.tenant_id.toString(),
      userId: user._id.toString(),
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      module: AUDIT_MODULES.AUTH,
    });

    return { message: this.forgotPasswordMessage };
  }

  async resetPassword(dto: ResetPasswordDto) {
    this.logger.step('AuthService.resetPassword', {});

    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const stored = await this.passwordResetTokenModel.findOne({
      token_hash: tokenHash,
      is_deleted: false,
      used_at: { $exists: false },
      expired_at: { $gt: new Date() },
    });
    if (!stored) {
      throw new AppError(ERRORS.AUTH.INVALID_TOKEN);
    }

    const user = await this.usersService.findById(stored.user_id.toString());
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppError(ERRORS.AUTH.INVALID_TOKEN);
    }

    user.password_hash = await bcrypt.hash(dto.new_password, 10);
    await user.save();

    stored.used_at = new Date();
    stored.is_deleted = true;
    await stored.save();

    await this.revokeUserSessions(
      user._id.toString(),
      user.tenant_id.toString(),
    );

    this.auditService.emit({
      tenantId: user.tenant_id.toString(),
      userId: user._id.toString(),
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      module: AUDIT_MODULES.AUTH,
    });

    return { message: 'Password reset successfully' };
  }

  private async revokeUserSessions(userId: string, tenantId: string) {
    await this.refreshTokenModel.updateMany(
      { user_id: new Types.ObjectId(userId), is_deleted: false },
      { is_deleted: true },
    );

    await this.redisService.del(
      this.redisService.tenantKey(tenantId, 'refresh_token', userId),
    );
  }

  private async issueTokens(user: {
    _id: Types.ObjectId;
    tenant_id: Types.ObjectId;
    email: string;
    role_id: Types.ObjectId | { _id: Types.ObjectId };
  }) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      tenant_id: user.tenant_id.toString(),
      email: user.email,
      role_id: toObjectIdString(user.role_id),
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
