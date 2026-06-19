import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { UpdateTenantDto } from './dto/tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get('me')
  async getMe(@CurrentUser() user: RequestUser) {
    const tenant = await this.tenantsService.findById(user.tenantId);
    return {
      id: tenant?._id,
      name: tenant?.name,
      slug: tenant?.slug,
      status: tenant?.status,
      max_users: tenant?.max_users,
      address: tenant?.address ?? '',
      phone: tenant?.phone ?? '',
      city: tenant?.city ?? '',
      state: tenant?.state ?? '',
    };
  }

  @Patch('me')
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantsService.updateProfile(user.tenantId, dto);
    return {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      max_users: tenant.max_users,
      address: tenant.address ?? '',
      phone: tenant.phone ?? '',
      city: tenant.city ?? '',
      state: tenant.state ?? '',
    };
  }
}
