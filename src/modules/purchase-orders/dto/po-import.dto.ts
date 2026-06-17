import { IsString } from 'class-validator';

export class PoImportConfirmDto {
  @IsString()
  previewToken: string;
}
