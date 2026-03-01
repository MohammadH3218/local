import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum OutboundCallContext {
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  FOLLOW_UP = 'FOLLOW_UP',
  REVIEW_REQUEST = 'REVIEW_REQUEST',
  MANUAL = 'MANUAL',
}

export class CreateOutboundCallDto {
  @IsString()
  @IsNotEmpty()
  to_number: string;

  @IsEnum(OutboundCallContext)
  @IsOptional()
  context?: OutboundCallContext;

  @IsString()
  @IsOptional()
  contact_id?: string;

  @IsString()
  @IsOptional()
  appointment_id?: string;

  @IsString()
  @IsOptional()
  custom_message?: string;
}
