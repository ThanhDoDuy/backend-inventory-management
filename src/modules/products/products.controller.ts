import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { ProductStatus } from '../../shared/constants/business.enums';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
      limit ? parseInt(limit, 10) : 20,
      search,
      categoryId,
      status,
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
