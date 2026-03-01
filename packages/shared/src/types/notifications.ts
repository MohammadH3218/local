export type NotificationChannel = 'IN_APP' | 'PUSH';

export type NotificationCategory =
  | 'APPOINTMENTS'
  | 'CALLS'
  | 'LEADS'
  | 'USAGE'
  | 'ACCOUNT'
  | 'SYSTEM';

export const NOTIFICATION_EVENT_KEYS = [
  'appointment_created',
  'appointment_updated',
  'appointment_cancelled',
  'appointment_completed',
  'call_completed',
  'lead_created',
  'payment_posted',
  'subscription_posted',
  'usage_threshold_25',
  'usage_threshold_50',
  'usage_threshold_75',
  'usage_threshold_90',
  'usage_threshold_100',
  'service_disabled',
  'service_restored',
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export interface NotificationChannelPreference {
  in_app: boolean;
  push: boolean;
}

export type NotificationPreferencesMap = {
  [K in NotificationEventKey]: NotificationChannelPreference;
};

export interface NotificationPreferences {
  company_id: string;
  user_id: string;
  preferences: NotificationPreferencesMap;
  created_at: number;
  updated_at: number;
}

export interface NotificationItem {
  company_id: string;
  notification_id: string;
  company_user: string; // company_id#user_id
  user_id: string;
  event_key: NotificationEventKey;
  category: NotificationCategory;
  title: string;
  body: string;
  channels: NotificationChannel[];
  created_at: number;
  is_read: boolean;
  read_at?: number;
  action_url?: string;
  payload?: Record<string, any>;
  source_event?: string;
}

export interface NotificationDeviceRegistration {
  device_id: string;
  platform: 'IOS';
  apns_token: string;
  apns_environment?: 'sandbox' | 'production';
  app_version?: string;
  device_model?: string;
  locale?: string;
  push_enabled?: boolean;
}

export interface NotificationDevice extends NotificationDeviceRegistration {
  company_id: string;
  user_id: string;
  company_user: string; // company_id#user_id
  is_active: boolean;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
}
