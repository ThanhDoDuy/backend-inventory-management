import { IsString } from 'class-validator';

export class CustomerImportConfirmDto {
  @IsString()
  previewToken: string;
}
