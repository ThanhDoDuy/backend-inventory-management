import { APP } from '../constants/app.constants';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { RedisLockHandle } from '../../infrastructure/redis/redis-lock.types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireLockWithRetry(
  redisService: RedisService,
  key: string,
  ttlSeconds: number,
): Promise<RedisLockHandle | null> {
  const { maxAttempts, retryBaseDelayMs } = APP.redis.lock;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const handle = await redisService.acquireLock(key, ttlSeconds);
    if (handle) {
      return handle;
    }

    if (attempt < maxAttempts) {
      await sleep(retryBaseDelayMs * attempt);
    }
  }

  return null;
}
