import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../shared/constants/roles.enum';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(Role)
  role: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class DisableUserDto {
  @IsString()
  reason: string;
}

export class ActivateUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  new_password: string;
}
