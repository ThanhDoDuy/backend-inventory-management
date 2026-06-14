import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
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
    };
  }
}
