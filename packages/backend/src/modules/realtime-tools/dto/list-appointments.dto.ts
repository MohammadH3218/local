import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class ListAppointmentsByPhoneDto {
    @IsString()
    @IsNotEmpty()
    company_id!: string;

    @IsString()
    @IsNotEmpty()
    phone!: string;

    @IsOptional()
    @IsNumber()
    range_days?: number;
}
