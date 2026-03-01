export type ToolName =
    | 'tenant_resolve'
    | 'create_lead'
    | 'start_call'
    | 'save_call'
    | 'save_recording'
    | 'knowledge_search'
    | 'get_availability'
    | 'create_booking'
    | 'hold_slot'
    | 'check_service_area'
    | 'list_appointments_by_phone'
    | 'cancel_appointment'
    | 'reschedule_appointment'
    | 'send_booking_link';

export interface TenantResolveRequest {
    to_number: string;
}

export interface TenantResolveResponse {
    company_id: string;
    company_name: string;
    timezone: string;
    service_template_id: string;
    service_template?: {
        template_id: string;
        name: string;
        category?: string;
        base_system_prompt: string;
        intake_schema?: {
            required?: string[];
            optional?: string[];
            conditional?: Record<string, any>;
        };
        booking_defaults?: {
            duration_minutes?: number;
            buffer_minutes?: number;
        };
        tool_policy?: {
            require_zip_check?: boolean;
            require_confirm?: boolean;
            allowed_tools?: string[];
        };
    };
    subscription_status: 'active' | 'trial' | 'past_due' | 'canceled' | 'inactive';
    calls_enabled: boolean;

    business_hours?: Record<string, { start: string; end: string }>; // e.g. mon: 09:00-17:00
    service_area_zipcodes?: string[];
    booking_services?: Array<{
        service_id: string;
        name: string;
        description?: string;
        amount_cents: number;
        currency?: string;
        billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
        billing_interval?: 'day' | 'week' | 'month' | 'year';
        billing_interval_count?: number;
    }>;
    service_selection_guide?: {
        require_selection_before_booking: boolean;
        ask_when_unsure: boolean;
        default_question: string;
        summary: string;
    };
    pricing_profile?: {
        model?: string;
        currency?: string;
        summary?: string;
        starting_price?: number;
        service_call_fee?: number;
        hourly_rate?: number;
        minimum_charge?: number;
        emergency_surcharge?: number;
        estimate_policy?: string;
        prices_start_at_only?: boolean;
        financing_available?: boolean;
        warranty_summary?: string;
        plan_highlights?: string[];
        tiers?: Array<{ name: string; price_label?: string; details?: string }>;
        add_ons?: Array<{ name: string; price_label?: string; details?: string }>;
        notes?: string;
    };

    agent_config?: {
        language?: string; // 'en'
        voice?: string;    // e.g. 'alloy'
        model?: string;    // realtime model id
        extra_instructions?: string;
    };
}

export interface CreateLeadRequest {
    company_id: string;
    from_phone: string;
    caller_name?: string;
    email?: string;
    address?: string;
    notes?: string;
}

export interface CreateLeadResponse {
    contact_id: string;
    lead_id: string;
}

export interface SaveCallRequest {
    company_id: string;
    call_id: string;
    from_phone: string;
    to_phone: string;
    transcript?: string;
    summary?: string;
    outcome?: 'booked' | 'no_booking' | 'voicemail' | 'hangup' | 'failed';
    extracted_fields?: Record<string, any>;
}

export interface SaveCallResponse {
    ok: true;
}

export interface KnowledgeSearchRequest {
    company_id: string;
    query: string;
    top_k?: number;
}

export interface KnowledgeSearchResponse {
    matches: Array<{ title: string; snippet: string; source?: string }>;
}

export interface GetAvailabilityRequest {
    company_id: string;
    preferred_time?: string; // ISO or natural language
    window_start?: string;   // ISO
    window_end?: string;     // ISO
    duration_minutes?: number;
    timezone?: string;
    limit?: number;
}

export interface GetAvailabilityResponse {
    available: boolean;
    slots: Array<{ start: string; end: string }>;
}

export interface CreateBookingRequest {
    company_id: string;
    contact_id?: string;
    from_phone: string;
    full_name: string;
    service_type: string;
    details: Record<string, any>;
    start_time: string; // ISO
    end_time: string;   // ISO
    timezone: string;
    confirmed: boolean; // MUST be true
}

export interface CreateBookingResponse {
    appointment_id: string;
    status: 'confirmed';
}

export interface HoldSlotRequest {
    company_id: string;
    slot: string; // ISO or natural language
    timezone?: string;
    hold_minutes?: number;
    call_id?: string;
}

export interface HoldSlotResponse {
    ok: true;
    hold_id: string;
    expires_at: number;
}

export interface CheckServiceAreaRequest {
    company_id: string;
    zip: string;
}

export interface CheckServiceAreaResponse {
    eligible: boolean;
    message?: string;
}

export interface ListAppointmentsByPhoneRequest {
    company_id: string;
    phone: string;
    range_days?: number; // default 90
}

export interface ListAppointmentsByPhoneResponse {
    appointments: Array<{
        appointment_id: string;
        start_time: string;
        end_time: string;
        service_type: string;
        status: 'confirmed' | 'canceled' | 'completed';
        notes?: string;
    }>;
}

export interface CancelAppointmentRequest {
    company_id: string;
    appointment_id: string;
    reason?: string;
}

export interface CancelAppointmentResponse {
    ok: true;
}

export interface RescheduleAppointmentRequest {
    company_id: string;
    appointment_id: string;
    new_start_time: string; // ISO
    timezone: string;
    duration_minutes?: number;
}

export interface RescheduleAppointmentResponse {
    ok: true;
    appointment_id: string;
    start_time: string;
    end_time: string;
}
