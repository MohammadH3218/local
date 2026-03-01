import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';

export class GetAvailableNumbersDto {
  @IsOptional()
  @IsString()
  country?: string; // ISO country code, default: 'US'

  @IsOptional()
  @IsString()
  type?: string; // legacy (AWS Connect), ignored for Twilio

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxResults?: number; // Max results to return, default: 10

  @IsOptional()
  @IsString()
  areaCode?: string; // US area code (e.g., 832)

  @IsOptional()
  @IsString()
  contains?: string; // Twilio "Contains" filter (e.g., 832***1234)
}
