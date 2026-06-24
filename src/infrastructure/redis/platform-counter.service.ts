import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

const KEY = 'platform:tenant_count';

/**
 * Atomic tenant counter backed by Redis INCR/DECR.
 * Avoids the TOCTOU race in countDocuments → create: two concurrent registrations
 * both read count=N-1 and both proceed even though only one should be allowed.
 *
 * On startup the counter is seeded from the DB with NX (set-if-not-exists) so
 * a Redis flush doesn't permanently break the gate.
 */
@Injectable()
export class PlatformCounterService {
  constructor(private readonly redis: RedisService) {}

  async increment(): Promise<number> {
    return this.redis.getClient().incr(KEY);
  }

  async decrement(): Promise<number> {
    return this.redis.getClient().decr(KEY);
  }

  /**
   * Seed the counter from the actual DB count. NX ensures we only write if the
   * key doesn't already exist, so concurrent startups or a brief restart don't
   * reset a counter that's already been incremented above the DB snapshot.
   */
  async syncFromDb(count: number): Promise<void> {
    await this.redis.getClient().set(KEY, count, 'NX');
  }

  async get(): Promise<number> {
    const val = await this.redis.getClient().get(KEY);
    return val ? parseInt(val, 10) : 0;
  }
}
