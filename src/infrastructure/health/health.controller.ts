import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppLoggerService } from '../logger/app-logger.service';
import { Public } from '../../shared/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
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
    let redisReady = false;
    try {
      const pong = await this.redisService.ping();
      redisReady = pong === 'PONG';
    } catch {
      redisReady = false;
    }

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
}
