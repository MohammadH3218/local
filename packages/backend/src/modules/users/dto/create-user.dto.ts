import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, Matches, ValidateIf } from 'class-validator';
import { UserRole, ServiceType } from '@handycall/shared';

export class CreateUserDto {
  @ValidateIf((o) => o.pool_type !== 'admin')
  @IsOptional()
  @IsString()
  company_id?: string;

  @ValidateIf((o) => !o.company_id && o.pool_type !== 'admin')
  @IsString()
  @IsNotEmpty()
  company_name?: string;

  @ValidateIf((o) => !o.company_id && o.pool_type !== 'admin')
  @IsEnum(ServiceType)
  @IsNotEmpty()
  company_service_type?: ServiceType;

  @ValidateIf((o) => !o.company_id && o.pool_type !== 'admin')
  @IsEmail()
  @IsNotEmpty()
  company_email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Company phone must be in E.164 format (e.g., +12345678900)',
  })
  company_phone?: string;

  @ValidateIf((o) => !o.company_id && o.pool_type !== 'admin')
  @IsString()
  @IsNotEmpty()
  company_timezone?: string;

  @IsOptional()
  @IsString()
  pool_type?: 'users' | 'admin';

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsNotEmpty()
  @IsString()
  first_name: string;

  @IsNotEmpty()
  @IsString()
  last_name: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // phone_number intentionally removed (future enhancement)
}
