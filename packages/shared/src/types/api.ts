/**
 * API request/response types
 * Standard patterns for all API endpoints
 */

import type {
  Company,
  User,
  Contact,
  Call,
  CallHighlight,
  Appointment,
  KnowledgeItem,
  FlaggedQuestion,
  AgentConfig,
  PricingRule,
  CallHandlingMode,
  UUID,
  Timestamp,
} from './domain';

import type {
  CallTranscript,
} from './telephony';

import type {
  NotificationDevice,
  NotificationDeviceRegistration,
  NotificationItem,
  NotificationPreferencesMap,
} from './notifications';

// ============================================================================
// Standard API Response Wrapper
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  timestamp: Timestamp;
  request_id?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

// ============================================================================
// Pagination & Filtering
// ============================================================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
  cursor?: string; // For DynamoDB cursor-based pagination
}

export interface DateRangeFilter {
  start_date?: Timestamp;
  end_date?: Timestamp;
}

// ============================================================================
// Auth Endpoints
// ============================================================================

export type AuthPoolType = 'users' | 'admin' | 'customer';

export interface LoginRequest {
  email: string;
  password: string;
  pool_type?: AuthPoolType | 'auto';
}

export interface LoginResponse {
  user: User;
  company: Company;
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

export interface RegisterRequest {
  company_name?: string;
  service_type?: string;
  email: string;
  password: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  timezone?: string;
  pool_type?: 'users' | 'customer';
}

export interface RegisterResponse {
  ok: true;
  email: string;
  requires_email_verification: true;
}

export interface ConfirmSignUpRequest {
  email: string;
  code: string;
  pool_type?: 'users' | 'customer';
}

export interface ConfirmSignUpResponse {
  ok: true;
}

export interface ResendConfirmationRequest {
  email: string;
  pool_type?: 'users' | 'customer';
}

export interface ResendConfirmationResponse {
  ok: true;
}

export interface RefreshTokenRequest {
  refresh_token: string;
  email?: string;
  pool_type?: AuthPoolType | 'auto';
}

export interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
}

// ============================================================================
// Company Endpoints
// ============================================================================

export interface UpdateCompanyRequest {
  company_name?: string;
  service_type?: string;
  phone_number?: string;
  email?: string;
  timezone?: string;
  business_hours?: Company['business_hours'];
  service_area_zipcodes?: string[];
  service_area_cities?: string[];
  pricing_profile?: Company['pricing_profile'];
  company_profile_completed?: boolean;
  service_area_completed?: boolean;
  transfer_enabled?: boolean;
  transfer_number?: string;
  call_handling_mode?: CallHandlingMode;
}

export type GetCompanyResponse = Company;

// ============================================================================
// Contact/Lead Endpoints
// ============================================================================

export interface CreateContactRequest {
  phone_number: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  notes?: string;
}

export interface ListContactsRequest extends PaginationParams {
  lead_status?: string;
  search?: string;
}

export interface ListContactsResponse {
  contacts: Contact[];
  pagination: PaginationMeta;
}

// ============================================================================
// Call Endpoints
// ============================================================================

export interface ListCallsRequest extends PaginationParams, DateRangeFilter {
  contact_id?: UUID;
  status?: string;
  ai_handled?: boolean;
}

export interface ListCallsResponse {
  calls: Call[];
  pagination: PaginationMeta;
}

export interface GetCallResponse {
  call: Call;
  transcript?: CallTranscript;
  highlights?: CallHighlight[];
}

// CallTranscript is imported from telephony.ts
// CallHighlight is imported from domain.ts

// ============================================================================
// Appointment Endpoints
// ============================================================================

export interface CreateAppointmentRequest {
  contact_id: UUID;
  scheduled_start: Timestamp;
  scheduled_end: Timestamp;
  service_type: string;
  description?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface ListAppointmentsRequest extends PaginationParams, DateRangeFilter {
  status?: string;
  contact_id?: UUID;
}

export interface ListAppointmentsResponse {
  appointments: Appointment[];
  pagination: PaginationMeta;
}

export interface UpdateAppointmentRequest {
  status?: string;
  scheduled_start?: Timestamp;
  scheduled_end?: Timestamp;
  notes?: string;
}

// ============================================================================
// Knowledge Base Endpoints
// ============================================================================

export interface CreateKnowledgeItemRequest {
  type: string;
  question: string;
  answer: string;
  status?: string;
}

export interface UpdateKnowledgeItemRequest {
  question?: string;
  answer?: string;
  status?: string;
}

export interface ListKnowledgeItemsRequest extends PaginationParams {
  type?: string;
  status?: string;
  search?: string;
}

export interface ListKnowledgeItemsResponse {
  knowledge_items: KnowledgeItem[];
  pagination: PaginationMeta;
}

// ============================================================================
// Flagged Questions Endpoints
// ============================================================================

export interface ListFlaggedQuestionsRequest extends PaginationParams {
  status?: string;
}

export interface ListFlaggedQuestionsResponse {
  flagged_questions: FlaggedQuestion[];
  pagination: PaginationMeta;
}

export interface ResolveFlaggedQuestionRequest {
  answer: string;
  create_knowledge_item?: boolean;
  knowledge_type?: string;
}

export interface ResolveFlaggedQuestionResponse {
  flagged_question: FlaggedQuestion;
  knowledge_item?: KnowledgeItem;
}

// ============================================================================
// Agent Config Endpoints
// ============================================================================

export interface UpdateAgentConfigRequest {
  greeting_tone?: string;
  custom_greeting?: string;
  booking_mode?: string;
  can_discuss_pricing?: boolean;
  can_handle_emergencies?: boolean;
  escalation_threshold?: number;
  require_callback_confirmation?: boolean;
  send_sms_summary?: boolean;
}

export type GetAgentConfigResponse = AgentConfig;

// ============================================================================
// Pricing Rules Endpoints
// ============================================================================

export interface CreatePricingRuleRequest {
  service_name: string;
  base_price?: number;
  price_range_min?: number;
  price_range_max?: number;
  unit?: string;
  description: string;
  can_quote_exact?: boolean;
  requires_inspection?: boolean;
}

export interface ListPricingRulesResponse {
  pricing_rules: PricingRule[];
}

// ============================================================================
// Mock Telephony (Development)
// ============================================================================

export interface MockInboundCallRequest {
  from_number: string;
  caller_intent?: string;
  caller_questions?: string[];
}

export interface MockInboundSMSRequest {
  from_number: string;
  message_body: string;
}

// ============================================================================
// Dashboard/Analytics
// ============================================================================

export interface DashboardStatsResponse {
  today: {
    total_calls: number;
    ai_handled_calls: number;
    new_leads: number;
    appointments_scheduled: number;
    flagged_questions: number;
  };
  week: {
    total_calls: number;
    ai_handled_calls: number;
    new_leads: number;
    appointments_scheduled: number;
  };
  recent_calls: Call[];
  recent_leads: Contact[];
  urgent_items: UrgentItem[];
}

export interface UrgentItem {
  type: 'FLAGGED_QUESTION' | 'MISSED_CALL' | 'COMPLAINT';
  id: UUID;
  description: string;
  created_at: Timestamp;
}

// ============================================================================
// Notifications
// ============================================================================

export interface ListNotificationsResponse {
  notifications: NotificationItem[];
  lastEvaluatedKey?: Record<string, any>;
}

export interface GetNotificationPreferencesResponse {
  preferences: NotificationPreferencesMap;
}

export interface UpdateNotificationPreferencesRequest {
  preferences: Partial<NotificationPreferencesMap>;
}

export interface RegisterNotificationDeviceRequest extends NotificationDeviceRegistration {}

export interface RegisterNotificationDeviceResponse {
  device: NotificationDevice;
}
