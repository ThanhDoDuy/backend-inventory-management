import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { AUDIT_ACTIONS, AUDIT_MODULES } from './constants/audit.constants';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission(PERMISSIONS.AUDIT.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('entityId') entityId?: string,
    @Query('correlationId') correlationId?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.list(user.tenantId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      userId,
      action,
      module,
      entityId,
      correlationId,
      category,
      from,
      to,
    });
  }

  @Get('correlation/:correlationId')
  @RequirePermission(PERMISSIONS.AUDIT.VIEW)
  listByCorrelation(
    @CurrentUser() user: RequestUser,
    @Param('correlationId') correlationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.listByCorrelation(
      user.tenantId,
      correlationId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.AUDIT.EXPORT)
  @Header('Content-Type', 'text/csv')
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('entityId') entityId?: string,
    @Query('correlationId') correlationId?: string,
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (format && format !== 'csv') {
      return res.status(400).json({
        success: false,
        message: 'Only CSV export is supported',
      });
    }

    const csv = await this.auditService.exportCsv(user.tenantId, {
      userId,
      action,
      module,
      entityId,
      correlationId,
      category,
      from,
      to,
    });

    this.auditService.emit({
      tenantId: user.tenantId,
      userId: user.userId,
      action: AUDIT_ACTIONS.EXPORT_AUDIT,
      module: AUDIT_MODULES.REPORT,
      metadata: { format: 'csv' },
    });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-logs.csv"',
    );
    return res.send(csv);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.AUDIT.VIEW)
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.auditService.getById(user.tenantId, id);
  }
}
