import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class ConfirmForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  token!: string;

  @IsNotEmpty()
  @MinLength(8)
  new_password!: string;
}
