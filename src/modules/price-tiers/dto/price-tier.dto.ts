import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreatePriceTierDto {
  @IsString()
  @MinLength(2)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code must be uppercase letters, numbers, or underscores',
  })
  code: string;

  @IsString()
  @MinLength(1)
  label: string;
}

export class UpdatePriceTierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
