import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignInboundNumberDto {
  @IsString()
  @IsNotEmpty()
  did_e164!: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  @IsIn(['CONNECT', 'TWILIO', 'OTHER'])
  provider?: 'CONNECT' | 'TWILIO' | 'OTHER';
}

