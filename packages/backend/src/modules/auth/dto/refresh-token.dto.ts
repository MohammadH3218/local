import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'users', 'admin', 'customer'])
  pool_type?: 'auto' | 'users' | 'admin' | 'customer';
}
