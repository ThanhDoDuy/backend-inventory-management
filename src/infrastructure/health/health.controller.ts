import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from '../../shared/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private connection: Connection,
    private redisService: RedisService,
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
    return {
      status: ready ? 'ready' : 'not_ready',
      mongo: mongoReady,
      redis: redisReady,
    };
  }
}
