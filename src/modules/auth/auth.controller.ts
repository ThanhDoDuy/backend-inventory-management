import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { AuthService } from './auth.service';
import { AppError, ERRORS } from '../../shared/errors';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string): void {
    const isProd = this.configService.get<string>('nodeEnv') === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public()
  @Throttle({ global: { ttl: 60_000, limit: 5 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto) as Record<string, unknown>;
    if (result['refresh_token']) {
      this.setRefreshCookie(res, result['refresh_token'] as string);
    }
    const { refresh_token: _rt, ...safe } = result;
    return safe;
  }

  @Public()
  @Throttle({ global: { ttl: 60_000, limit: 10 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto) as Record<string, unknown>;
    if (result['refresh_token']) {
      this.setRefreshCookie(res, result['refresh_token'] as string);
    }
    const { refresh_token: _rt, ...safe } = result;
    return safe;
  }

  @Public()
  @Throttle({ global: { ttl: 60_000, limit: 30 } })
  @Post('refresh-token')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    // HttpOnly cookie takes precedence; fall back to body token (legacy clients).
    const token: string | undefined =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refresh_token;
    if (!token) {
      throw new AppError(ERRORS.AUTH.INVALID_REFRESH_TOKEN);
    }
    return this.authService.refresh(token);
  }

  @Public()
  @Throttle({ global: { ttl: 3_600_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ global: { ttl: 60_000, limit: 10 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  logout(
    @CurrentUser() user: RequestUser,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearRefreshCookie(res);
    const token = authorization?.replace(/^Bearer\s+/i, '');
    return this.authService.logout(user.userId, user.tenantId, token);
  }

  @Get('profile')
  profile(@CurrentUser() user: RequestUser) {
    return this.authService.profile(user.userId);
  }

  @Get('permissions')
  permissions(@CurrentUser() user: RequestUser) {
    return this.authService.permissions(user.tenantId, user.roleId);
  }

  @Patch('change-password')
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }
}
