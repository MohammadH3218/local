import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class KnowledgeSearchDto {
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  top_k?: number;
}

