/**
 * Telephony adapter interface types
 * Abstraction layer for telephony providers (Twilio, Amazon Connect, etc.)
 */

import type { PhoneNumber, UUID, Timestamp } from './domain';

// ============================================================================
// Telephony Provider Interface
// ============================================================================

export interface TelephonyProvider {
  /**
   * Provider identifier
   */
  readonly name: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: TelephonyConfig): Promise<void>;

  /**
   * Handle an inbound call
   */
  handleInboundCall(event: InboundCallEvent): Promise<CallResponse>;

  /**
   * Handle an inbound SMS
   */
  handleInboundSMS(event: InboundSMSEvent): Promise<SMSResponse>;

  /**
   * Make an outbound call
   */
  makeOutboundCall(params: OutboundCallParams): Promise<CallResponse>;

  /**
   * Send an outbound SMS
   */
  sendSMS(params: OutboundSMSParams): Promise<SMSResponse>;

  /**
   * Get call recording URL
   */
  getRecordingUrl(callSid: string): Promise<string>;

  /**
   * Get call transcript
   */
  getTranscript(callSid: string): Promise<CallTranscript>;
}

// ============================================================================
// Configuration
// ============================================================================

export interface TelephonyConfig {
  provider: 'twilio' | 'amazon_connect' | 'mock';
  credentials?: {
    account_sid?: string;
    auth_token?: string;
    api_key?: string;
  };
  webhook_url?: string;
  recording_enabled?: boolean;
  transcription_enabled?: boolean;
}

// ============================================================================
// Inbound Events
// ============================================================================

export interface InboundCallEvent {
  call_sid: string; // Provider's call identifier
  from: PhoneNumber;
  to: PhoneNumber;
  call_status: string;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
}

export interface InboundSMSEvent {
  message_sid: string; // Provider's message identifier
  from: PhoneNumber;
  to: PhoneNumber;
  body: string;
  timestamp: Timestamp;
  media_urls?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Outbound Requests
// ============================================================================

export interface OutboundCallParams {
  to: PhoneNumber;
  from: PhoneNumber;
  company_id: UUID;
  callback_url?: string;
  record?: boolean;
  transcribe?: boolean;
}

export interface OutboundSMSParams {
  to: PhoneNumber;
  from: PhoneNumber;
  body: string;
  company_id: UUID;
  media_urls?: string[];
}

// ============================================================================
// Responses
// ============================================================================

export interface CallResponse {
  success: boolean;
  call_sid: string;
  status: string;
  error?: string;
}

export interface SMSResponse {
  success: boolean;
  message_sid: string;
  status: string;
  error?: string;
}

export interface CallTranscript {
  call_sid: string;
  segments: TranscriptSegment[];
  language?: string;
  confidence?: number;
}

export interface TranscriptSegment {
  speaker: 'agent' | 'caller';
  text: string;
  timestamp_seconds: number;
  confidence?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// ============================================================================
// Mock Provider (for development)
// ============================================================================

export interface MockCallSimulation {
  from: PhoneNumber;
  intent: 'question' | 'booking' | 'emergency' | 'general';
  questions?: string[];
  duration_seconds?: number;
  should_escalate?: boolean;
}

export interface MockSMSSimulation {
  from: PhoneNumber;
  message: string;
  expect_response?: boolean;
}
