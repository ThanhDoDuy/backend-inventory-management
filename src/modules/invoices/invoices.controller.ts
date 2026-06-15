import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  ListInvoicesQueryDto,
  RefundInvoiceDto,
} from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @RequirePermission(PERMISSIONS.INVOICE.CREATE)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createAndPay(
      user.tenantId,
      user.userId,
      user.roleId,
      dto,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.INVOICE.VIEW)
  list(@CurrentUser() user: RequestUser, @Query() query: ListInvoicesQueryDto) {
    return this.invoicesService.list(user.tenantId, {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status,
      customerId: query.customerId,
      paymentMethod: query.paymentMethod,
      from: query.from,
      to: query.to,
    });
  }

  @Get(':id/print')
  @RequirePermission(PERMISSIONS.INVOICE.VIEW)
  print(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.getPrintData(user.tenantId, id);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.INVOICE.VIEW)
  getById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.getById(user.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.INVOICE.CANCEL)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
  ) {
    return this.invoicesService.cancel(
      user.tenantId,
      user.userId,
      id,
      dto,
    );
  }

  @Post(':id/refund')
  @RequirePermission(PERMISSIONS.INVOICE.REFUND)
  refund(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RefundInvoiceDto,
  ) {
    return this.invoicesService.refund(user.tenantId, user.userId, id, dto);
  }
}
