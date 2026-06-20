import {
  Body,
  Controller,
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
import { PoStatus } from '../../shared/constants/business.enums';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { APP } from '../../shared/constants/app.constants';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  ExportPurchaseOrdersQueryDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PoImportConfirmDto } from './dto/po-import.dto';
import { PurchaseOrdersImportService } from './purchase-orders-import.service';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly purchaseOrdersImportService: PurchaseOrdersImportService,
  ) {}

  @Get('export')
  @RequirePermission(PERMISSIONS.PO.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query() query: ExportPurchaseOrdersQueryDto,
  ) {
    const csv = await this.purchaseOrdersService.exportCsv(
      user.tenantId,
      {
        status: query.status,
        supplierId: query.supplierId,
        from: query.from,
        to: query.to,
      },
      query.export_type === 'detail' ? 'detail' : 'summary',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="purchase-orders-export.csv"',
    );
    return res.send(csv);
  }

  @Get('export/template')
  @RequirePermission(PERMISSIONS.PO.VIEW)
  async exportTemplate(@Res() res: Response) {
    const buffer = await this.purchaseOrdersImportService.getImportTemplateExcel();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="purchase-orders-import-template.xlsx"',
    );
    return res.send(buffer);
  }

  @Post('import/preview')
  @RequirePermission(PERMISSIONS.PO.CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: APP.import.maxFileBytes } }),
  )
  previewImport(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required');
    }

    return this.purchaseOrdersImportService.previewImport(
      user.tenantId,
      user.userId,
      file.buffer,
      { originalname: file.originalname, mimetype: file.mimetype },
    );
  }

  @Post('import/confirm')
  @RequirePermission(PERMISSIONS.PO.CREATE)
  confirmImport(
    @CurrentUser() user: RequestUser,
    @Body() dto: PoImportConfirmDto,
  ) {
    return this.purchaseOrdersImportService.confirmImport(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.PO.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PoStatus,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.purchaseOrdersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      status,
      supplierId,
      from,
      to,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PO.VIEW)
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.purchaseOrdersService.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PO.CREATE)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.create(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PO.UPDATE)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.PO.APPROVE)
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.purchaseOrdersService.approve(
      user.tenantId,
      user.userId,
      id,
    );
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.PO.CANCEL)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.cancel(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.PO.RECEIVE)
  receive(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }
}
