import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  sku: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsMongoId()
  category_id?: string;

  @IsNumber()
  @Min(0)
  cost_price: number;

  @IsNumber()
  @Min(0)
  selling_price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimum_stock?: number;

  @IsOptional()
  @IsString()
  image_url?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsMongoId()
  category_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimum_stock?: number;

  @IsOptional()
  @IsString()
  image_url?: string;
}
