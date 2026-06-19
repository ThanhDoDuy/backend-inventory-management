import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import {
  CustomerType,
  PartyStatus,
} from '../../shared/constants/business.enums';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  APP,
  type CustomerImportMode,
} from '../../shared/constants/app.constants';
import {
  CreateCustomerDto,
  DisableCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { CustomerImportConfirmDto } from './dto/customer-import.dto';
import { CustomersImportService } from './customers-import.service';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customersImportService: CustomersImportService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: PartyStatus,
    @Query('customer_type') customerType?: CustomerType,
  ) {
    return this.customersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      status,
      customerType,
    );
  }

  @Get('export/template')
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  async exportTemplate(@Res() res: Response) {
    const buffer = await this.customersService.getImportTemplateExcel();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="customers-import-template.xlsx"',
    );
    return res.send(buffer);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('search') search?: string,
    @Query('status') status?: PartyStatus,
    @Query('customer_type') customerType?: CustomerType,
  ) {
    if (format && format !== 'csv') {
      return res.status(400).json({
        success: false,
        message: 'Only CSV export is supported',
      });
    }

    const csv = await this.customersService.exportCsv(
      user.tenantId,
      search,
      status,
      customerType,
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="customers-export.csv"',
    );
    return res.send(csv);
  }

  @Post('import/preview')
  @RequirePermission(PERMISSIONS.CUSTOMERS.CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: APP.import.maxFileBytes } }),
  )
  previewImport(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
    @Query('mode') mode?: CustomerImportMode,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required');
    }

    return this.customersImportService.previewImport(
      user.tenantId,
      user.userId,
      file.buffer,
      mode ?? 'upsert',
      { originalname: file.originalname, mimetype: file.mimetype },
    );
  }

  @Post('import/confirm')
  @RequirePermission(PERMISSIONS.CUSTOMERS.CREATE)
  confirmImport(
    @CurrentUser() user: RequestUser,
    @Body() dto: CustomerImportConfirmDto,
  ) {
    return this.customersImportService.confirmImport(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Get(':id/history')
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  getHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.customersService.getHistory(user.tenantId, id);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const found = await this.customersService.findByIdInTenant(
      user.tenantId,
      id,
    );
    return found ? this.customersService.toResponse(found) : null;
  }

  @Post()
  @RequirePermission(PERMISSIONS.CUSTOMERS.CREATE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCustomerDto,
  ) {
    const created = await this.customersService.create(
      user.tenantId,
      user.userId,
      dto,
    );
    return this.customersService.toResponse(created);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.CUSTOMERS.UPDATE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const updated = await this.customersService.update(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
    return this.customersService.toResponse(updated);
  }

  @Post(':id/disable')
  @RequirePermission(PERMISSIONS.CUSTOMERS.DISABLE)
  async disable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: DisableCustomerDto,
  ) {
    const updated = await this.customersService.disable(
      user.tenantId,
      user.userId,
      id,
    );
    return this.customersService.toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.CUSTOMERS.DISABLE)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.customersService.softDelete(user.tenantId, user.userId, id);
    return { message: 'Customer deleted successfully' };
  }
}
