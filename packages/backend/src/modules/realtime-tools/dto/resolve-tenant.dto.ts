import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolveTenantDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  to_number?: string;

  /**
   * Alias for compatibility with external docs/integrations.
   * If provided, the controller should treat it as `to_number`.
   */
  @IsString()
  @IsOptional()
  dialedNumber?: string;
}
