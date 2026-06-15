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
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.categoriesService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const category = await this.categoriesService.findByIdInTenant(
      user.tenantId,
      id,
    );
    return category ? this.categoriesService.toResponse(category) : null;
  }

  @Post()
  @RequirePermission(PERMISSIONS.PRODUCTS.CREATE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCategoryDto,
  ) {
    const created = await this.categoriesService.create(user.tenantId, dto);
    return this.categoriesService.toResponse(created);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const updated = await this.categoriesService.update(
      user.tenantId,
      id,
      dto,
    );
    return this.categoriesService.toResponse(updated);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PRODUCTS.DELETE)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const deleted = await this.categoriesService.softDelete(
      user.tenantId,
      id,
    );
    return this.categoriesService.toResponse(deleted);
  }
}
