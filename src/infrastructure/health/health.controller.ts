import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppLoggerService } from '../logger/app-logger.service';
import { Public } from '../../shared/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { HEALTH_REDIS_CHECK_TTL_MS } from './health.constants';

@Controller('health')
export class HealthController {
  private redisReadyCache: { value: boolean; expiresAt: number } | null = null;

  constructor(
    @InjectConnection() private connection: Connection,
    private redisService: RedisService,
    private readonly logger: AppLoggerService,
  ) {}

  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const mongoReady = this.connection.readyState === 1;
    const redisReady = await this.checkRedisReady();

    const ready = mongoReady && redisReady;
    const result = {
      status: ready ? 'ready' : 'not_ready',
      mongo: mongoReady,
      redis: redisReady,
    };

    if (!ready) {
      this.logger.warn('HealthController.ready', result);
    }

    return result;
  }

  private async checkRedisReady(): Promise<boolean> {
    const now = Date.now();
    if (this.redisReadyCache && this.redisReadyCache.expiresAt > now) {
      return this.redisReadyCache.value;
    }

    let value = false;
    try {
      const pong = await this.redisService.ping();
      value = pong === 'PONG';
    } catch {
      value = false;
    }

    this.redisReadyCache = {
      value,
      expiresAt: now + HEALTH_REDIS_CHECK_TTL_MS,
    };
    return value;
  }
}
