import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';

export enum TemplateCategory {
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  FOLLOW_UP = 'FOLLOW_UP',
  PROMOTIONAL = 'PROMOTIONAL',
  REVIEW_REQUEST = 'REVIEW_REQUEST',
  CUSTOM = 'CUSTOM',
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1600)
  body: string;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsEnum(TemplateCategory)
  @IsOptional()
  category?: TemplateCategory;

  @IsString()
  @IsOptional()
  @MaxLength(1600)
  body?: string;
}
