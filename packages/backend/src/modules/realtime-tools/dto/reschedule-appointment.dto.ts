import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RescheduleAppointmentDto {
    @IsString()
    @IsNotEmpty()
    company_id!: string;

    @IsString()
    @IsNotEmpty()
    appointment_id!: string;

    @IsString()
    @IsNotEmpty()
    new_start_time!: string;

    @IsOptional()
    @IsString()
    timezone?: string;
}
