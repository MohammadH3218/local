import { IsString, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator';

export class CreateQuoteRequestDto {
  @IsString()
  service_category: string;

  @IsString()
  job_description: string;

  @IsString()
  location_zipcode: string;

  @IsString()
  @IsOptional()
  location_city?: string;

  @IsString()
  @IsOptional()
  contact_name?: string;

  @IsString()
  @IsOptional()
  contact_email?: string;

  @IsString()
  @IsOptional()
  contact_phone?: string;

  @IsString()
  @IsOptional()
  preferred_date?: string;

  @IsString()
  @IsOptional()
  urgency?: string; // 'asap' | 'this_week' | 'flexible'

  @IsArray()
  @IsOptional()
  provider_ids?: string[]; // specific providers to send to, or empty for all
}

export class RespondToQuoteDto {
  @IsString()
  message: string;

  @IsNumber()
  @IsOptional()
  estimated_price_cents?: number;

  @IsString()
  @IsOptional()
  estimated_duration?: string;
}
