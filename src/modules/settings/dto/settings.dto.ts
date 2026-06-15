import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UpdateSettingDto {
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class BulkUpdateSettingItemDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class BulkUpdateSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateSettingItemDto)
  items: BulkUpdateSettingItemDto[];
}

export class ToggleFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;
}

export class ResetSettingsDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  group?: string;
}
