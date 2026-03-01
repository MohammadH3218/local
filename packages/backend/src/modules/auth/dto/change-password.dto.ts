import { IsString, IsNotEmpty, MinLength, IsOptional, IsIn } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;

  @IsString()
  @IsNotEmpty()
  session!: string;

  @IsOptional()
  @IsString()
  @IsIn(['users', 'admin', 'customer'])
  pool_type?: 'users' | 'admin' | 'customer';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  first_name?: string; // Optional for all pools

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  last_name?: string; // Optional for all pools
}
