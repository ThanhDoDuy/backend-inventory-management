import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

/**
 * Redis-backed ThrottlerStorage for @nestjs/throttler.
 * Uses the project's existing RedisService (ioredis) so no extra connection is needed.
 * Keys are namespaced per throttler name so multiple throttler configs coexist safely.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:${throttlerName}:block:${key}`;

    const client = this.redis.getClient();

    // Check if the key is currently blocked
    const blockTtlMs = await client.pttl(blockKey);
    if (blockTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: ttl,
        isBlocked: true,
        timeToBlockExpire: blockTtlMs,
      };
    }

    // Atomic increment + set TTL on first hit
    const pipeline = client.pipeline();
    pipeline.incr(redisKey);
    pipeline.pexpire(redisKey, ttl);
    const results = await pipeline.exec();

    const totalHits = (results?.[0]?.[1] as number) ?? 1;
    const timeToExpire = await client.pttl(redisKey);
    const isBlocked = totalHits > limit;

    if (isBlocked && blockDuration > 0) {
      await client.set(blockKey, '1', 'PX', blockDuration);
    }

    return {
      totalHits,
      timeToExpire: Math.max(timeToExpire, 0),
      isBlocked,
      timeToBlockExpire: isBlocked && blockDuration > 0 ? blockDuration : 0,
    };
  }

  // Expose the underlying ioredis client for the RedisService contract
  // (ThrottlerModule calls increment; no other methods required by the interface)
}
