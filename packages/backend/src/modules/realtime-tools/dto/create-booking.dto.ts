import { IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  company_id!: string;

  @IsOptional()
  @IsString()
  call_id?: string;

  @IsOptional()
  @IsString()
  contact_id?: string;

  // ISO 8601 UTC date-time OR a natural-language date/time in the provided timezone.
  @IsString()
  start_time!: string;

  // ISO 8601 UTC date-time OR a natural-language date/time in the provided timezone.
  // Optional: if omitted, the backend will add the company's default appointment duration.
  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  service_type?: string;

  @IsOptional()
  details?: Record<string, any>;

  @IsOptional()
  @IsString()
  customer_email?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  confirmed?: boolean;
}
