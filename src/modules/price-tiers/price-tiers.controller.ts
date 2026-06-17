import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { CreatePriceTierDto, UpdatePriceTierDto } from './dto/price-tier.dto';
import { PriceTiersService } from './price-tiers.service';

@Controller('price-tiers')
export class PriceTiersController {
  constructor(private readonly priceTiersService: PriceTiersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  list(@CurrentUser() user: RequestUser) {
    return this.priceTiersService.list(user.tenantId, true);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePriceTierDto) {
    return this.priceTiersService.createCustom(user.tenantId, dto);
  }

  @Patch(':code')
  @RequirePermission(PERMISSIONS.SETTINGS.UPDATE)
  update(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body() dto: UpdatePriceTierDto,
  ) {
    return this.priceTiersService.update(user.tenantId, code, dto);
  }
}
