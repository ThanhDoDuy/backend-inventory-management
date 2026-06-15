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
import { PartyStatus } from '../../shared/constants/business.enums';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  CreateSupplierDto,
  DisableSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

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
