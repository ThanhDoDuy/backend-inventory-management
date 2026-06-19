import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  InvoiceStatus,
  PaymentMethod,
} from '../../../shared/constants/business.enums';

export class CreateInvoiceItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  priceTierCode?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}

export class CancelInvoiceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RefundInvoiceItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class RefundInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundInvoiceItemDto)
  items: RefundInvoiceItemDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListInvoicesQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export type InvoiceExportType = 'summary' | 'detail';

export class ExportInvoicesQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  export_type?: InvoiceExportType;
}
