import { IsEmail, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class ConfirmSignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  @IsIn(['users', 'customer'])
  pool_type?: 'users' | 'customer';
}
