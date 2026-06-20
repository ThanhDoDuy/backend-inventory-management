import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../shared/constants/permission.constants';
import type { RequestUser } from '../../shared/interfaces/request-user.interface';
import { ConfirmProductImageDto } from './dto/product-image.dto';
import { ProductImagesService } from './product-images.service';

@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PRODUCTS.VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.productImagesService.list(user.tenantId, productId);
  }

  @Post('sign')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  sign(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.productImagesService.signUpload(user.tenantId, productId);
  }

  @Post('confirm')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  confirm(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
    @Body() dto: ConfirmProductImageDto,
  ) {
    return this.productImagesService.confirmUpload(
      user.tenantId,
      productId,
      user.userId,
      dto,
    );
  }

  @Patch(':imageId/primary')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  setPrimary(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productImagesService.setPrimary(
      user.tenantId,
      productId,
      imageId,
    );
  }

  @Delete(':imageId')
  @RequirePermission(PERMISSIONS.PRODUCTS.UPDATE)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productImagesService.softDelete(
      user.tenantId,
      productId,
      imageId,
    );
  }
}
