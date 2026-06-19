import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductStatus } from '../../../shared/constants/business.enums';
import { AdjustmentReason } from '../constants/inventory.enums';

export class AdjustmentDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @NotEquals(0, { message: 'quantity must not be zero' })
  quantity: number;

  @IsEnum(AdjustmentReason)
  reason: AdjustmentReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BalanceQueryDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;
}

export class TransactionQueryDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

export class ExportBalancesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsMongoId()
  category_id?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  low_stock_only?: boolean;
}

export class ExportTransactionsQueryDto {
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  type?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
