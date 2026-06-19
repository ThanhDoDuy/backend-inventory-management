import { Injectable } from '@nestjs/common';
import { AppError, ERRORS } from '../../shared/errors';
import { RedisService } from '../../infrastructure/redis/redis.service';

const COOLDOWN_SECONDS = 30;
const HOUR_WINDOW_SECONDS = 60 * 60;
const DAY_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 10;

@Injectable()
export class PasswordResetRateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async assertCanRequest(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const cooldownKey = this.cooldownKey(normalized);
    const hourKey = this.hourKey(normalized);
    const dayKey = this.dayKey(normalized);

    if (await this.redisService.exists(cooldownKey)) {
      throw new AppError(ERRORS.AUTH.PASSWORD_RESET_RATE_LIMITED);
    }

    const hourCount = parseInt((await this.redisService.get(hourKey)) ?? '0', 10);
    if (hourCount >= MAX_PER_HOUR) {
      throw new AppError(ERRORS.AUTH.PASSWORD_RESET_RATE_LIMITED);
    }

    const dayCount = parseInt((await this.redisService.get(dayKey)) ?? '0', 10);
    if (dayCount >= MAX_PER_DAY) {
      throw new AppError(ERRORS.AUTH.PASSWORD_RESET_RATE_LIMITED);
    }
  }

  async recordRequest(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const cooldownKey = this.cooldownKey(normalized);
    const hourKey = this.hourKey(normalized);
    const dayKey = this.dayKey(normalized);

    await this.redisService.set(cooldownKey, '1', COOLDOWN_SECONDS);

    const hourCount = await this.redisService.incr(hourKey);
    if (hourCount === 1) {
      await this.redisService.expire(hourKey, HOUR_WINDOW_SECONDS);
    }

    const dayCount = await this.redisService.incr(dayKey);
    if (dayCount === 1) {
      await this.redisService.expire(dayKey, DAY_WINDOW_SECONDS);
    }
  }

  private cooldownKey(email: string): string {
    return `password_reset:cooldown:${email}`;
  }

  private hourKey(email: string): string {
    return `password_reset:hour:${email}`;
  }

  private dayKey(email: string): string {
    return `password_reset:day:${email}`;
  }
}
