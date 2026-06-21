import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppLoggerService } from '../../infrastructure/logger/app-logger.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../audit/constants/audit.constants';
import { AppError, ERRORS } from '../../shared/errors';
import { DEFAULT_FEATURE_FLAGS } from './constants/default-feature-flags';
import { DEFAULT_SETTINGS } from './constants/default-settings';
import {
  BulkUpdateSettingItemDto,
  ToggleFeatureFlagDto,
  UpdateSettingDto,
} from './dto/settings.dto';
import { FeatureFlag, FeatureFlagDocument } from './schemas/feature-flag.schema';
import { Setting, SettingDocument } from './schemas/setting.schema';
import {
  SettingsHistory,
  SettingsHistoryDocument,
} from './schemas/settings-history.schema';

const SETTINGS_CACHE_TTL = 1800;
const FEATURE_FLAG_CACHE_TTL = 1800;

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name) private settingModel: Model<SettingDocument>,
    @InjectModel(FeatureFlag.name)
    private featureFlagModel: Model<FeatureFlagDocument>,
    @InjectModel(SettingsHistory.name)
    private settingsHistoryModel: Model<SettingsHistoryDocument>,
    private redisService: RedisService,
    private auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  async seedForTenant(tenantId: string): Promise<void> {
    this.logger.step('SettingsService.seedForTenant', { tenantId });

    const tenantObjectId = new Types.ObjectId(tenantId);

    const settingDocs = DEFAULT_SETTINGS.map((setting) => ({
      tenant_id: tenantObjectId,
      ...setting,
    }));
    await this.settingModel.insertMany(settingDocs);

    const featureFlagDocs = DEFAULT_FEATURE_FLAGS.map((flag) => ({
      tenant_id: tenantObjectId,
      ...flag,
    }));
    await this.featureFlagModel.insertMany(featureFlagDocs);
  }

  private settingsCacheKey(tenantId: string, key: string): string {
    return this.redisService.tenantKey(tenantId, 'settings', key);
  }

  private featureFlagCacheKey(tenantId: string, key: string): string {
    return this.redisService.tenantKey(tenantId, 'feature', key);
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    this.logger.step('SettingsService.get', { tenantId, key });

    const cacheKey = this.settingsCacheKey(tenantId, key);
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

  async isFeatureEnabled(
    tenantId: string,
    key: string,
    fallback = false,
  ): Promise<boolean> {
    const cacheKey = this.featureFlagCacheKey(tenantId, key);
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const flag = await this.featureFlagModel.findOne({
      tenant_id: new Types.ObjectId(tenantId),
      key,
    });
    if (!flag) {
      return fallback;
    }

    await this.redisService.set(
      cacheKey,
      flag.enabled ? 'true' : 'false',
      FEATURE_FLAG_CACHE_TTL,
    );
    return flag.enabled;
  }

  async listAll(tenantId: string) {
    await this.ensureMissingDefaultSettings(tenantId);

    const [settings, featureFlags] = await Promise.all([
      this.settingModel
        .find({
          tenant_id: new Types.ObjectId(tenantId),
          is_active: true,
        })
        .sort({ group: 1, key: 1 })
        .lean(),
      this.featureFlagModel
        .find({ tenant_id: new Types.ObjectId(tenantId) })
        .sort({ key: 1 })
        .lean(),
    ]);

    return { settings, feature_flags: featureFlags };
  }

  async getByKey(tenantId: string, key: string) {
    const setting = await this.settingModel
      .findOne({
        tenant_id: new Types.ObjectId(tenantId),
        key,
        is_active: true,
      })
      .lean();

    if (!setting) {
      throw new AppError(ERRORS.SETTINGS.NOT_FOUND);
    }

    return setting;
  }

  async updateByKey(
    tenantId: string,
    userId: string,
    key: string,
    dto: UpdateSettingDto,
  ) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const userObjectId = new Types.ObjectId(userId);

    let setting = await this.settingModel.findOne({
      tenant_id: tenantObjectId,
      key,
      is_active: true,
    });

    if (!setting) {
      const defaultSetting = DEFAULT_SETTINGS.find((item) => item.key === key);
      if (!defaultSetting) {
        throw new AppError(ERRORS.SETTINGS.NOT_FOUND);
      }

      this.validateSettingValue(defaultSetting.type, dto.value);

      setting = await this.settingModel.create({
        tenant_id: tenantObjectId,
        key: defaultSetting.key,
        value: dto.value,
        type: defaultSetting.type,
        group: defaultSetting.group,
        description: defaultSetting.description,
        is_active: true,
        version: 1,
        modified_by: userObjectId,
      });

      await this.invalidate(tenantId, key);
      await this.recordHistory({
        tenantId,
        key,
        oldValue: defaultSetting.value,
        newValue: dto.value,
        userId,
        changeType: 'SETTING',
      });

      this.auditService.emit({
        tenantId,
        userId,
        action: AUDIT_ACTIONS.UPDATE_SETTING,
        module: AUDIT_MODULES.SETTINGS,
        entityId: key,
        oldValue: { value: defaultSetting.value },
        newValue: { value: dto.value },
      });

      return setting.toObject();
    }

    this.validateSettingValue(setting.type, dto.value);

    const oldValue = setting.value;
    setting.value = dto.value;
    setting.modified_by = new Types.ObjectId(userId);
    setting.version += 1;
    await setting.save();

    await this.invalidate(tenantId, key);
    await this.recordHistory({
      tenantId,
      key,
      oldValue,
      newValue: dto.value,
      userId,
      changeType: 'SETTING',
    });

    this.auditService.emit({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.UPDATE_SETTING,
      module: AUDIT_MODULES.SETTINGS,
      entityId: key,
      oldValue: { value: oldValue },
      newValue: { value: dto.value },
    });

    return setting.toObject();
  }

  async bulkUpdate(
    tenantId: string,
    userId: string,
    items: BulkUpdateSettingItemDto[],
  ) {
    await this.ensureMissingDefaultSettings(tenantId);

    const updated: unknown[] = [];
    for (const item of items) {
      const result = await this.updateByKey(tenantId, userId, item.key, {
        value: item.value,
      });
      updated.push(result);
    }
    return updated;
  }

  async reset(
    tenantId: string,
    userId: string,
    options?: { key?: string; group?: string },
  ) {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = {
      tenant_id: tenantObjectId,
      is_active: true,
    };

    if (options?.key) {
      filter.key = options.key;
    }
    if (options?.group) {
      filter.group = options.group;
    }

    const settings = await this.settingModel.find(filter);
    const defaultsByKey = new Map<string, string>(
      DEFAULT_SETTINGS.map((setting) => [setting.key, setting.value]),
    );

    const resetResults: unknown[] = [];
    for (const setting of settings) {
      const defaultValue = defaultsByKey.get(setting.key);
      if (defaultValue === undefined) {
        continue;
      }

      const oldValue = setting.value;
      setting.value = defaultValue;
      setting.modified_by = new Types.ObjectId(userId);
      setting.version += 1;
      await setting.save();
      await this.invalidate(tenantId, setting.key);

      await this.recordHistory({
        tenantId,
        key: setting.key,
        oldValue,
        newValue: defaultValue,
        userId,
        changeType: 'RESET',
      });

      resetResults.push(setting.toObject());

      this.auditService.emit({
        tenantId,
        userId,
        action: AUDIT_ACTIONS.RESET_SETTING,
        module: AUDIT_MODULES.SETTINGS,
        entityId: setting.key,
        oldValue: { value: oldValue },
        newValue: { value: defaultValue },
      });
    }

    return {
      message: 'Settings reset successfully',
      reset_count: resetResults.length,
      settings: resetResults,
    };
  }

  async toggleFeatureFlag(
    tenantId: string,
    userId: string,
    key: string,
    dto: ToggleFeatureFlagDto,
  ) {
    const flag = await this.featureFlagModel.findOne({
      tenant_id: new Types.ObjectId(tenantId),
      key,
    });

    if (!flag) {
      throw new AppError(ERRORS.SETTINGS.FEATURE_FLAG_NOT_FOUND);
    }

    const oldEnabled = flag.enabled;
    flag.enabled = dto.enabled;
    flag.modified_by = new Types.ObjectId(userId);
    await flag.save();

    await this.redisService.del(this.featureFlagCacheKey(tenantId, key));

    await this.recordHistory({
      tenantId,
      key,
      oldValue: oldEnabled ? 'true' : 'false',
      newValue: dto.enabled ? 'true' : 'false',
      userId,
      changeType: 'FEATURE_FLAG',
    });

    this.auditService.emit({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.TOGGLE_FEATURE_FLAG,
      module: AUDIT_MODULES.SETTINGS,
      entityId: key,
      oldValue: { enabled: oldEnabled },
      newValue: { enabled: dto.enabled },
    });

    return flag.toObject();
  }

  async listHistory(tenantId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const filter = { tenant_id: new Types.ObjectId(tenantId) };

    const [items, total] = await Promise.all([
      this.settingsHistoryModel
        .find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.settingsHistoryModel.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async invalidate(tenantId: string, key: string): Promise<void> {
    await this.redisService.del(this.settingsCacheKey(tenantId, key));
  }

  private async ensureMissingDefaultSettings(tenantId: string): Promise<void> {
    const tenantObjectId = new Types.ObjectId(tenantId);
    const existingKeys = await this.settingModel.distinct('key', {
      tenant_id: tenantObjectId,
      is_active: true,
    });
    const existingSet = new Set(existingKeys);

    const missing = DEFAULT_SETTINGS.filter((setting) => !existingSet.has(setting.key));
    if (missing.length === 0) {
      return;
    }

    await Promise.all(
      missing.map((setting) =>
        this.settingModel.updateOne(
          { tenant_id: tenantObjectId, key: setting.key },
          {
            $setOnInsert: {
              tenant_id: tenantObjectId,
              key: setting.key,
              value: setting.value,
              type: setting.type,
              group: setting.group,
              description: setting.description,
              is_active: true,
              version: 1,
            },
          },
          { upsert: true },
        ),
      ),
    );
  }

  private validateSettingValue(type: string, value: string): void {
    if (type === 'NUMBER' && Number.isNaN(Number(value))) {
      throw new AppError(ERRORS.SETTINGS.INVALID_VALUE, {
        message: 'Setting value must be a valid number',
      });
    }

    if (type === 'BOOLEAN' && value !== 'true' && value !== 'false') {
      throw new AppError(ERRORS.SETTINGS.INVALID_VALUE, {
        message: 'Setting value must be true or false',
      });
    }
  }

  private async recordHistory(params: {
    tenantId: string;
    key: string;
    oldValue: string;
    newValue: string;
    userId: string;
    changeType: string;
  }): Promise<void> {
    await this.settingsHistoryModel.create({
      tenant_id: new Types.ObjectId(params.tenantId),
      key: params.key,
      old_value: params.oldValue,
      new_value: params.newValue,
      changed_by: new Types.ObjectId(params.userId),
      change_type: params.changeType,
    });
  }
}
