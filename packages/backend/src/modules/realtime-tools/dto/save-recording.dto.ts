import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SaveRecordingDto {
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  call_id!: string;

  @IsString()
  @IsNotEmpty()
  recording_sid!: string;

  @IsNumber()
  @IsOptional()
  duration_seconds?: number;
}

