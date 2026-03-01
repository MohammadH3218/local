import { IsString, IsOptional, IsObject, IsBoolean, IsNumber, IsIn, IsArray, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { BusinessHours, ServiceType, CallHandlingMode } from '@handycall/shared';

const normalizeScheduleOverrides = (value: any) => {
  if (!value) return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          return { date: entry, closed: true, segments: [] };
        }
        if (entry instanceof Date) {
          return { date: entry.toISOString().slice(0, 10), closed: true, segments: [] };
        }
        if (typeof entry === 'object') {
          const date = typeof entry.date === 'string' ? entry.date : '';
          if (!date) return null;
          const segments = Array.isArray(entry.segments)
            ? entry.segments.filter((s: any) => s?.open && s?.close)
            : [];
          const closed = typeof entry.closed === 'boolean' ? entry.closed : segments.length === 0;
          return { date, closed, segments };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([date, entry]: any) => {
        if (!date) return null;
        if (entry && typeof entry === 'object') {
          const segments = Array.isArray(entry.segments)
            ? entry.segments.filter((s: any) => s?.open && s?.close)
            : [];
          const closed = typeof entry.closed === 'boolean' ? entry.closed : segments.length === 0;
          return { date, closed, segments };
        }
        return { date, closed: true, segments: [] };
      })
      .filter(Boolean);
  }
  return value;
};

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  service_type?: ServiceType;

  @IsOptional()
  @IsString()
  service_template_id?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsObject()
  business_hours?: BusinessHours;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeScheduleOverrides(value))
  schedule_overrides?: Array<{
    date: string; // YYYY-MM-DD
    closed?: boolean;
    segments?: Array<{ open: string; close: string }>;
  }>;

  @IsOptional()
  @IsNumber()
  appointment_duration_minutes?: number;

  @IsOptional()
  @IsNumber()
  slot_interval_minutes?: number;

  @IsOptional()
  @IsBoolean()
  calls_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sms_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  transfer_enabled?: boolean;

  @IsOptional()
  @IsString()
  transfer_number?: string;

  @IsOptional()
  @IsEnum(CallHandlingMode)
  call_handling_mode?: CallHandlingMode;

  // AWS Connect fields
  @IsOptional()
  @IsString()
  connect_phone_number_id?: string;

  @IsOptional()
  @IsString()
  connect_phone_number?: string;

  @IsOptional()
  @IsString()
  connect_instance_id?: string;

  @IsOptional()
  @IsBoolean()
  use_simple_scheduling?: boolean;

  // Calendar setup
  @IsOptional()
  @IsBoolean()
  calendar_setup_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  schedule_setup_completed?: boolean;

  @IsOptional()
  @IsIn(['INTERNAL', 'EXTERNAL'])
  calendar_mode?: 'INTERNAL' | 'EXTERNAL';

  @IsOptional()
  @IsIn(['NONE', 'GOOGLE', 'MICROSOFT', 'APPLE'])
  calendar_provider?: 'NONE' | 'GOOGLE' | 'MICROSOFT' | 'APPLE';

  @IsOptional()
  @IsObject()
  calendar_connection?: any;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  service_area_zipcodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  service_area_cities?: string[];

  @IsOptional()
  @IsObject()
  pricing_profile?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  company_profile_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  service_area_completed?: boolean;

  @IsOptional()
  @IsString()
  stripe_connect_account_id?: string;

  @IsOptional()
  @IsBoolean()
  stripe_connect_onboarding_complete?: boolean;

  @IsOptional()
  @IsBoolean()
  booking_payment_enabled?: boolean;

  @IsOptional()
  @IsIn(['HANDYCALL_MANAGED', 'SELF_MANAGED'])
  booking_payment_mode?: 'HANDYCALL_MANAGED' | 'SELF_MANAGED';

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  booking_services?: Array<{
    service_id: string;
    name: string;
    description?: string;
    amount_cents: number;
    currency?: string;
    duration_minutes?: number;
    active?: boolean;
    collect_payment?: boolean;
    billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
    billing_interval?: 'day' | 'week' | 'month' | 'year';
    billing_interval_count?: number;
    trial_period_days?: number;
  }>;

  @IsOptional()
  @IsBoolean()
  follow_up_sequences_enabled?: boolean;

  @IsOptional()
  @IsNumber()
  follow_up_initial_delay_minutes?: number;

  @IsOptional()
  @IsNumber()
  follow_up_second_delay_minutes?: number;

  @IsOptional()
  @IsNumber()
  follow_up_final_delay_minutes?: number;

  @IsOptional()
  @IsString()
  follow_up_initial_template?: string;

  @IsOptional()
  @IsString()
  follow_up_second_template?: string;

  @IsOptional()
  @IsString()
  follow_up_final_template?: string;

  @IsOptional()
  @IsBoolean()
  review_request_enabled?: boolean;

  @IsOptional()
  @IsNumber()
  review_request_delay_minutes?: number;

  @IsOptional()
  @IsString()
  review_platform_url?: string;

  @IsOptional()
  @IsString()
  review_request_template?: string;

  @IsOptional()
  @IsBoolean()
  website_widget_enabled?: boolean;

  @IsOptional()
  @IsObject()
  website_widget_settings?: {
    primary_color?: string;
    position?: 'BOTTOM_RIGHT' | 'BOTTOM_LEFT';
    greeting?: string;
  };
}
