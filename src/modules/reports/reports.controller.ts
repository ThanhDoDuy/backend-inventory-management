import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { APP, ReportType } from '../../shared/constants/app.constants';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.reportsService.getDashboard(user.tenantId, user.userId);
  }

  @Get('revenue')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getRevenue(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getRevenue(user.tenantId, { from, to });
  }

  @Get('top-products')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getTopProducts(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.getTopProducts(user.tenantId, {
      from,
      to,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get('low-stock')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getLowStock(@CurrentUser() user: RequestUser) {
    return this.reportsService.getLowStock(user.tenantId);
  }

  @Get('dead-stock')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getDeadStock(
    @CurrentUser() user: RequestUser,
    @Query('inactiveDays') inactiveDays?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.getDeadStock(
      user.tenantId,
      inactiveDays ? parseInt(inactiveDays, 10) : 30,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('tax/s1a-hkd')
  @RequirePermission(PERMISSIONS.REPORTS.VIEW)
  getTaxS1aHkd(
    @CurrentUser() user: RequestUser,
    @Query('year') year?: string,
  ) {
    const reportYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.reportsService.getTaxS1aHkd(user.tenantId, reportYear);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.REPORTS.EXPORT)
  @Header('Content-Type', 'text/csv')
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('inactiveDays') inactiveDays?: string,
  ) {
    if (format && format !== 'csv') {
      return res.status(400).json({
        success: false,
        message: 'Only CSV export is supported',
      });
    }

    const reportType = (type ?? APP.report.types.REVENUE) as ReportType;
    const csv = await this.reportsService.exportCsv(
      user.tenantId,
      user.userId,
      reportType,
      { from, to },
      inactiveDays ? parseInt(inactiveDays, 10) : 30,
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${reportType.toLowerCase()}.csv"`,
    );
    return res.send(csv);
  }
}
