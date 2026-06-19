import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  AdjustmentDto,
  BalanceQueryDto,
  ExportBalancesQueryDto,
  ExportTransactionsQueryDto,
  TransactionQueryDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('export/balances')
  @RequirePermission(PERMISSIONS.INVENTORY.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportBalances(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query() query: ExportBalancesQueryDto,
  ) {
    const csv = await this.inventoryService.exportBalancesCsv(user.tenantId, {
      search: query.search,
      category_id: query.category_id,
      status: query.status,
      low_stock_only: query.low_stock_only,
    });
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="inventory-balances-export.csv"',
    );
    return res.send(csv);
  }

  @Get('export/transactions')
  @RequirePermission(PERMISSIONS.INVENTORY.VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTransactions(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query() query: ExportTransactionsQueryDto,
  ) {
    const csv = await this.inventoryService.exportTransactionsCsv(user.tenantId, {
      productId: query.productId,
      type: query.type,
      from: query.from,
      to: query.to,
    });
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="inventory-transactions-export.csv"',
    );
    return res.send(csv);
  }

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
