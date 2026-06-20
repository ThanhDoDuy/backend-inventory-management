import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class ConfirmProductImageDto {
  @IsString()
  public_id: string;

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  secure_url: string;

  @IsInt()
  @Min(1)
  @Max(8000)
  width: number;

  @IsInt()
  @Min(1)
  @Max(8000)
  height: number;

  @IsString()
  format: string;

  @IsNumber()
  @Min(1)
  bytes: number;

  @IsOptional()
  @IsString()
  etag?: string;
}
