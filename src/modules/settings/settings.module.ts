import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { FeatureFlag, FeatureFlagSchema } from './schemas/feature-flag.schema';
import { Setting, SettingSchema } from './schemas/setting.schema';
import {
  SettingsHistory,
  SettingsHistorySchema,
} from './schemas/settings-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Setting.name, schema: SettingSchema },
      { name: FeatureFlag.name, schema: FeatureFlagSchema },
      { name: SettingsHistory.name, schema: SettingsHistorySchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
