import { IsString } from 'class-validator';

export class SupplierImportConfirmDto {
  @IsString()
  previewToken: string;
}
