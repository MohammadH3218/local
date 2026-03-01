import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  from_number!: string;

  @IsString()
  @IsNotEmpty()
  to_number!: string;

  @IsString()
  @IsOptional()
  call_id?: string;

  @IsObject()
  @IsOptional()
  collected_info?: Record<string, any>;
}

