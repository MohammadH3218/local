import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ServiceType } from '@handycall/shared';

export class CreateCompanyDto {
  @IsNotEmpty()
  @IsString()
  company_name: string;

  @IsNotEmpty()
  @IsEnum(ServiceType)
  service_type: ServiceType;

  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone number must be in E.164 format (+1234567890)' })
  phone_number: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  timezone: string;

  @IsOptional()
  @IsEmail()
  initial_admin_email?: string;

  @IsOptional()
  @IsString()
  initial_admin_password?: string;

  @IsOptional()
  @IsString()
  initial_admin_name?: string;
}
