import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisThrottlerStorage } from './redis-throttler-storage.service';
import { PlatformCounterService } from './platform-counter.service';

@Global()
@Module({
  providers: [RedisService, RedisThrottlerStorage, PlatformCounterService],
  exports: [RedisService, RedisThrottlerStorage, PlatformCounterService],
})
export class RedisModule {}
