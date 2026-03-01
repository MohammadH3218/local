import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendBookingLinkDto {
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  call_id!: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  service_id?: string;

  @IsOptional()
  @IsString()
  selected_service_name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ONE_TIME', 'SUBSCRIPTION'])
  selected_billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
}
