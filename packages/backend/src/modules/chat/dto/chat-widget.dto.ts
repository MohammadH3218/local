import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const E164_OR_DIGITS = /^\+?[1-9]\d{6,15}$/;

export class CreateChatSessionDto {
  @IsString()
  company_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitor_name?: string;

  @IsOptional()
  @Matches(E164_OR_DIGITS)
  visitor_phone?: string;

  @IsOptional()
  @IsEmail()
  visitor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  page_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  user_agent?: string;
}

export class SendChatMessageDto {
  @IsString()
  company_id!: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitor_name?: string;

  @IsOptional()
  @Matches(E164_OR_DIGITS)
  visitor_phone?: string;

  @IsOptional()
  @IsEmail()
  visitor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  page_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  user_agent?: string;
}

export class RequestCallbackDto {
  @IsString()
  company_id!: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsString()
  @MaxLength(120)
  visitor_name!: string;

  @Matches(E164_OR_DIGITS)
  visitor_phone!: string;

  @IsOptional()
  @IsEmail()
  visitor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
