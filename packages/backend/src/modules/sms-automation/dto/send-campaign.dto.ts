import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber } from 'class-validator';

export class SendCampaignDto {
  @IsString()
  @IsNotEmpty()
  template_id: string;

  @IsArray()
  @IsString({ each: true })
  contact_ids: string[];

  @IsNumber()
  @IsOptional()
  scheduled_at?: number;
}

export class SendSingleSmsDto {
  @IsString()
  @IsNotEmpty()
  to_number: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  contact_id?: string;
}
