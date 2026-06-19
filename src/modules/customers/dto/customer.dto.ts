import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  CustomerType,
  PartyStatus,
} from '../../../shared/constants/business.enums';

export class CreateCustomerDto {
  @IsEnum(CustomerType)
  customer_type: CustomerType;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  tax_code?: string;

  @IsOptional()
  @IsString()
  contact_person?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customer_type?: CustomerType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  tax_code?: string;

  @IsOptional()
  @IsString()
  contact_person?: string;
}

export class DisableCustomerDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PartyStatus)
  status?: PartyStatus;

  @IsOptional()
  @IsEnum(CustomerType)
  customer_type?: CustomerType;
}
