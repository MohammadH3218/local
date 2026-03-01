import { IsString, IsNotEmpty } from 'class-validator';

export class ClaimPhoneNumberDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string; // The phone number to claim (E.164 format)

  @IsString()
  description?: string; // Optional description
}
