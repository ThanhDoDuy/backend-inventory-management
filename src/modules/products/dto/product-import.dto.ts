import { IsIn, IsOptional, IsString } from 'class-validator';
import type { ProductImportMode } from '../constants/product-import.constants';

export class ImportConfirmDto {
  @IsString()
  previewToken: string;
}

export class ProductImportPreviewQueryDto {
  @IsOptional()
  @IsIn(['create_only', 'upsert'])
  mode?: ProductImportMode;
}
