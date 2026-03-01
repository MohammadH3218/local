import { IsNotEmpty, IsString } from 'class-validator';

export class CheckServiceAreaDto {
    @IsString()
    @IsNotEmpty()
    company_id!: string;

    @IsString()
    @IsNotEmpty()
    zip!: string;
}
