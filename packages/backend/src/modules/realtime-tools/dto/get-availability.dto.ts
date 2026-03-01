import { IsOptional, IsString } from 'class-validator';

export class GetAvailabilityDto {
  @IsString()
  company_id!: string;

  // ISO 8601 UTC date-time OR a natural-language date/time in the provided timezone.
  @IsString()
  start_time!: string;

  // ISO 8601 UTC date-time OR a natural-language date/time in the provided timezone.
  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
