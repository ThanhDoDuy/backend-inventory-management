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
import { PartyStatus } from '../../shared/constants/business.enums';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  SUPPLIER_IMPORT_MAX_FILE_BYTES,
  type SupplierImportMode,
} from './constants/supplier-import.constants';
import {
  CreateSupplierDto,
  DisableSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SupplierImportConfirmDto } from './dto/supplier-import.dto';
import { SuppliersImportService } from './suppliers-import.service';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly suppliersImportService: SuppliersImportService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.SUPPLIERS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: PartyStatus,
  ) {
    return this.suppliersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      status,
    );
  }

  @Get('export/template')
  @RequirePermission(PERMISSIONS.SUPPLIERS.VIEW)
  async exportTemplate(@Res() res: Response) {
    const buffer = await this.suppliersService.getImportTemplateExcel();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="suppliers-import-template.xlsx"',
    );
    return res.send(buffer);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.SUPPLIERS.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('search') search?: string,
    @Query('status') status?: PartyStatus,
  ) {
    if (format && format !== 'csv') {
      return res.status(400).json({
        success: false,
        message: 'Only CSV export is supported',
      });
    }

    const csv = await this.suppliersService.exportCsv(
      user.tenantId,
      search,
      status,
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="suppliers-export.csv"',
    );
    return res.send(csv);
  }

  @Post('import/preview')
  @RequirePermission(PERMISSIONS.SUPPLIERS.CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SUPPLIER_IMPORT_MAX_FILE_BYTES } }),
  )
  previewImport(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
    @Query('mode') mode?: SupplierImportMode,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required');
    }

    return this.suppliersImportService.previewImport(
      user.tenantId,
      user.userId,
      file.buffer,
      mode ?? 'upsert',
      { originalname: file.originalname, mimetype: file.mimetype },
    );
  }

  @Post('import/confirm')
  @RequirePermission(PERMISSIONS.SUPPLIERS.CREATE)
  confirmImport(
    @CurrentUser() user: RequestUser,
    @Body() dto: SupplierImportConfirmDto,
  ) {
    return this.suppliersImportService.confirmImport(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Get(':id/history')
  @RequirePermission(PERMISSIONS.SUPPLIERS.VIEW)
  getHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.suppliersService.getHistory(user.tenantId, id);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SUPPLIERS.VIEW)
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const found = await this.suppliersService.findByIdInTenant(
      user.tenantId,
      id,
    );
    return found ? this.suppliersService.toResponse(found) : null;
  }

  @Post()
  @RequirePermission(PERMISSIONS.SUPPLIERS.CREATE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSupplierDto,
  ) {
    const created = await this.suppliersService.create(
      user.tenantId,
      user.userId,
      dto,
    );
    return this.suppliersService.toResponse(created);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.SUPPLIERS.UPDATE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    const updated = await this.suppliersService.update(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
    return this.suppliersService.toResponse(updated);
  }

  @Post(':id/disable')
  @RequirePermission(PERMISSIONS.SUPPLIERS.DISABLE)
  async disable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() _dto: DisableSupplierDto,
  ) {
    const updated = await this.suppliersService.disable(
      user.tenantId,
      user.userId,
      id,
    );
    return this.suppliersService.toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.SUPPLIERS.DISABLE)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.suppliersService.softDelete(user.tenantId, user.userId, id);
    return { message: 'Supplier deleted successfully' };
  }
}
