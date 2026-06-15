import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  BulkUpdateSettingsDto,
  ResetSettingsDto,
  ToggleFeatureFlagDto,
  UpdateSettingDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SETTINGS.VIEW)
  listAll(@CurrentUser() user: RequestUser) {
    return this.settingsService.listAll(user.tenantId);
  }

  @Get('history')
  @RequirePermission(PERMISSIONS.SETTINGS.VIEW)
  listHistory(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settingsService.listHistory(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('bulk-update')
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  bulkUpdate(
    @CurrentUser() user: RequestUser,
    @Body() dto: BulkUpdateSettingsDto,
  ) {
    return this.settingsService.bulkUpdate(
      user.tenantId,
      user.userId,
      dto.items,
    );
  }

  @Post('reset')
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  reset(@CurrentUser() user: RequestUser, @Body() dto: ResetSettingsDto) {
    return this.settingsService.reset(user.tenantId, user.userId, dto);
  }

  @Patch('feature/:key')
  @RequirePermission(PERMISSIONS.FEATURE_FLAGS.UPDATE)
  toggleFeatureFlag(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string,
    @Body() dto: ToggleFeatureFlagDto,
  ) {
    return this.settingsService.toggleFeatureFlag(
      user.tenantId,
      user.userId,
      key,
      dto,
    );
  }

  @Get(':key')
  @RequirePermission(PERMISSIONS.SETTINGS.VIEW)
  getByKey(@CurrentUser() user: RequestUser, @Param('key') key: string) {
    return this.settingsService.getByKey(user.tenantId, key);
  }

  @Patch(':key')
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  updateByKey(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.settingsService.updateByKey(
      user.tenantId,
      user.userId,
      key,
      dto,
    );
  }
}
