import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
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
