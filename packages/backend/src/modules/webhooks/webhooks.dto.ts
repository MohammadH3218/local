import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWebhookConfigDto {
  @IsOptional()
  @IsString()
  webhook_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabled_events?: string[];

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
