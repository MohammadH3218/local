import { IsOptional, IsString, IsNumber } from 'class-validator';

export class HoldSlotDto {
  @IsString()
  company_id!: string;

  // ISO 8601 UTC date-time OR a natural-language date/time in the provided timezone.
  @IsString()
  slot!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  hold_minutes?: number;

  @IsOptional()
  @IsString()
  call_id?: string;
}
