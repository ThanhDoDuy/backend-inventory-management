import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  AdjustmentDto,
  BalanceQueryDto,
  TransactionQueryDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('adjustment')
  @RequirePermission(PERMISSIONS.INVENTORY.ADJUST)
  adjust(@CurrentUser() user: RequestUser, @Body() dto: AdjustmentDto) {
    return this.inventoryService.adjust(user.tenantId, dto, user.userId);
  }

  @Get('balance')
  @RequirePermission(PERMISSIONS.INVENTORY.VIEW)
  getBalance(
    @CurrentUser() user: RequestUser,
    @Query() query: BalanceQueryDto,
  ) {
    return this.inventoryService.getBalance(user.tenantId, query.productId);
  }

  @Get('transactions')
  @RequirePermission(PERMISSIONS.INVENTORY.VIEW)
  listTransactions(
    @CurrentUser() user: RequestUser,
    @Query() query: TransactionQueryDto,
  ) {
    return this.inventoryService.listTransactions(user.tenantId, {
      productId: query.productId,
      type: query.type,
      from: query.from,
      to: query.to,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Post('rebuild')
  @RequirePermission(PERMISSIONS.INVENTORY.REBUILD)
  rebuild(@CurrentUser() user: RequestUser) {
    return this.inventoryService.rebuild(user.tenantId);
  }
}
