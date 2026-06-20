import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  APP,
  type ProductImportMode,
} from '../../shared/constants/app.constants';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { ProductStatus } from '../../shared/constants/business.enums';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ImportConfirmDto } from './dto/product-import.dto';
import { ProductsImportService } from './products-import.service';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsImportService: ProductsImportService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category_id') categoryId?: string,
    @Query('status') status?: ProductStatus,
  ) {
    return this.productsService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      search,
      categoryId,
      status,
    );
  }

  @Get('export/template')
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  async exportTemplate(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const buffer = await this.productsService.getImportTemplateExcel(user.tenantId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products-import-template.xlsx"',
    );
    return res.send(buffer);
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('search') search?: string,
    @Query('category_id') categoryId?: string,
    @Query('status') status?: ProductStatus,
    @Query('all') all?: string,
  ) {
    if (format && format !== 'xlsx') {
      return res.status(400).json({
        success: false,
        message: 'Only Excel (.xlsx) export is supported',
      });
    }

    const buffer = await this.productsService.exportExcel(user.tenantId, {
      search,
      categoryId,
      status,
      all: all === 'true',
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="products-export.xlsx"',
    );
    return res.send(buffer);
  }

  @Post('import/preview')
  @RequirePermission(PERMISSIONS.PRODUCTS.CREATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: APP.import.maxFileBytes } }),
  )
  previewImport(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
    @Query('mode') mode?: ProductImportMode,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required');
    }

    return this.productsImportService.previewImport(
      user.tenantId,
      user.userId,
      file.buffer,
      mode ?? 'upsert',
      { originalname: file.originalname, mimetype: file.mimetype },
    );
  }

  @Post('import/confirm')
  @RequirePermission(PERMISSIONS.PRODUCTS.CREATE)
  confirmImport(
    @CurrentUser() user: RequestUser,
    @Body() dto: ImportConfirmDto,
  ) {
    return this.productsImportService.confirmImport(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.productsService.getDetail(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PRODUCTS.CREATE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProductDto,
  ) {
    const created = await this.productsService.create(user.tenantId, dto);
    return this.productsService.toResponse(created);
  }

  @Patch(':id/deactivate')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  async deactivate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    const updated = await this.productsService.deactivate(user.tenantId, id);
    return this.productsService.toResponse(updated);
  }

  @Patch(':id/activate')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  async activate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const updated = await this.productsService.activate(user.tenantId, id);
    return this.productsService.toResponse(updated);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const updated = await this.productsService.update(user.tenantId, id, dto);
    return this.productsService.toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.DELETE)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const deleted = await this.productsService.softDelete(user.tenantId, id);
    return this.productsService.toResponse(deleted);
  }
}
