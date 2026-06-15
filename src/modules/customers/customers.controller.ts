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
  CreateCustomerDto,
  DisableCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.CUSTOMERS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: PartyStatus,
  ) {
    return this.customersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      search,
      status,
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
