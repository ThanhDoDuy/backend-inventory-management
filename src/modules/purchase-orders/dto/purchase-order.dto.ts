import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PoStatus } from '../../../shared/constants/business.enums';

export class PurchaseOrderItemInputDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  costPrice: number;
}

export class CreatePurchaseOrderDto {
  @IsMongoId()
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items: PurchaseOrderItemInputDto[];

  @IsOptional()
  @IsDateString()
  expectedDate?: string;
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items?: PurchaseOrderItemInputDto[];

  @IsOptional()
  @IsDateString()
  expectedDate?: string;
}

export class ReceivePurchaseOrderItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(1)
  receivedQuantity: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items: ReceivePurchaseOrderItemDto[];
}

export class CancelPurchaseOrderDto {
  @IsString()
  @MinLength(1)
  reason: string;
}

export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsEnum(PoStatus)
  status?: PoStatus;

  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export type PurchaseOrderExportType = 'summary' | 'detail';

export class ExportPurchaseOrdersQueryDto extends ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  export_type?: PurchaseOrderExportType;
}
