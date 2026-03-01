import { IsEmail, IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'users', 'admin', 'customer'])
  pool_type?: 'auto' | 'users' | 'admin' | 'customer';
}
