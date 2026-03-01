import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CancelAppointmentDto {
    @IsString()
    @IsNotEmpty()
    company_id!: string;

    @IsString()
    @IsNotEmpty()
    appointment_id!: string;

    @IsOptional()
    @IsString()
    reason?: string;
}
