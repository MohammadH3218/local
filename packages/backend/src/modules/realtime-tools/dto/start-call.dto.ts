import { IsNotEmpty, IsString } from 'class-validator';

export class StartCallDto {
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  call_id!: string;

  @IsString()
  @IsNotEmpty()
  from_number!: string;

  @IsString()
  @IsNotEmpty()
  to_number!: string;
}
