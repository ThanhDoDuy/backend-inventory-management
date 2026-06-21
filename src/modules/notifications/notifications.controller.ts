import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('latest')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS.VIEW)
  latest(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getLatest(user.tenantId, user.userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 5,
    });
  }

  @Get()
  @RequirePermission(PERMISSIONS.NOTIFICATIONS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unread') unread?: string,
    @Query('type') type?: string,
  ) {
    return this.notificationsService.list(user.tenantId, user.userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      unread: unread === 'true',
      type,
    });
  }

  @Patch('read-all')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS.MARK_READ)
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(
      user.tenantId,
      user.userId,
    );
  }

  @Patch(':id/read')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS.MARK_READ)
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markRead(
      user.tenantId,
      user.userId,
      id,
    );
  }
}
