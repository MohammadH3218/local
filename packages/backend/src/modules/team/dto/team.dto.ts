import { IsString, IsNotEmpty, IsOptional, IsEnum, IsEmail, IsArray } from 'class-validator';

export enum TeamRole {
  OWNER = 'OWNER',
  DISPATCHER = 'DISPATCHER',
  TECHNICIAN = 'TECHNICIAN',
}

export const ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
  [TeamRole.OWNER]: ['view_leads', 'manage_leads', 'view_schedule', 'manage_schedule', 'view_customers', 'manage_customers', 'view_payments', 'manage_billing', 'manage_ai_settings', 'manage_team', 'view_reports'],
  [TeamRole.DISPATCHER]: ['view_leads', 'manage_leads', 'view_schedule', 'manage_schedule', 'view_customers'],
  [TeamRole.TECHNICIAN]: ['view_schedule', 'view_customers'],
};

export class InviteTeamMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsOptional()
  last_name?: string;

  @IsEnum(TeamRole)
  role: TeamRole;
}

export class UpdateTeamMemberDto {
  @IsEnum(TeamRole)
  @IsOptional()
  role?: TeamRole;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  custom_permissions?: string[];

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;
}
