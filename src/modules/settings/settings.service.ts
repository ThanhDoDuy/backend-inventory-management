import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { DEFAULT_SETTINGS } from './constants/default-settings';
import { Setting, SettingDocument } from './schemas/setting.schema';

const SETTINGS_CACHE_TTL = 1800;

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    private redisService: RedisService,
    private readonly logger: AppLoggerService,
  ) {}

  async seedForTenant(tenantId: string): Promise<void> {
    this.logger.step('SettingsService.seedForTenant', { tenantId });

    const docs = DEFAULT_SETTINGS.map((s) => ({
      tenant_id: new Types.ObjectId(tenantId),
      ...s,
    }));
    await this.settingModel.insertMany(docs);
  }

  private cacheKey(tenantId: string, key: string): string {
    return this.redisService.tenantKey(tenantId, 'settings', key);
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    this.logger.step('SettingsService.get', { tenantId, key });

    const cacheKey = this.cacheKey(tenantId, key);
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const setting = await this.settingModel.findOne({
      tenant_id: new Types.ObjectId(tenantId),
      key,
      is_active: true,
    });
    if (!setting) {
      return null;
    }

    await this.redisService.set(cacheKey, setting.value, SETTINGS_CACHE_TTL);
    return setting.value;
  }

  async getNumber(
    tenantId: string,
    key: string,
    fallback: number,
  ): Promise<number> {
    const value = await this.get(tenantId, key);
    if (value === null) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  async getBoolean(
    tenantId: string,
    key: string,
    fallback: boolean,
  ): Promise<boolean> {
    const value = await this.get(tenantId, key);
    if (value === null) {
      return fallback;
    }
    return value === 'true';
  }

  async invalidate(tenantId: string, key: string): Promise<void> {
    await this.redisService.del(this.cacheKey(tenantId, key));
  }
}
