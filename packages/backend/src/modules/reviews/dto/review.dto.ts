import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, Min, Max, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @IsNotEmpty()
  provider_company_id: string;

  @IsString()
  @IsNotEmpty()
  booking_id: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;

  @IsString()
  @IsOptional()
  service_type?: string;
}

export class RespondToReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  response: string;
}
