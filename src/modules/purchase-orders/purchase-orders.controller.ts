import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PoStatus } from '../../shared/constants/business.enums';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.PO.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: PoStatus,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.purchaseOrdersService.list(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
      supplierId,
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PO.VIEW)
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.purchaseOrdersService.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.PO.CREATE)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.create(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PO.UPDATE)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.PO.APPROVE)
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.purchaseOrdersService.approve(
      user.tenantId,
      user.userId,
      id,
    );
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.PO.CANCEL)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.cancel(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }

  @Post(':id/receive')
  @RequirePermission(PERMISSIONS.PO.RECEIVE)
  receive(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }
}
