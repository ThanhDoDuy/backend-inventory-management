import {
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsMongoId()
  role_id: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsMongoId()
  role_id?: string;
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

export class AssignRoleDto {
  @IsMongoId()
  role_id: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  new_password: string;
}
