export function toolsSchema(options?: { intakeFields?: string[] }) {
    const intakeFields = options?.intakeFields;
    const detailsDescription = intakeFields?.length
        ? `Collected intake fields. You MUST use these exact keys: ${intakeFields.join(', ')}. Include ALL collected fields every time.`
        : 'Collected intake fields. Include ALL collected fields every time.';
    const detailsProperties: Record<string, { type: string }> = {};
    if (intakeFields?.length) {
        for (const field of intakeFields) {
            detailsProperties[field] = { type: 'string' };
        }
    }
    const detailsSchema: any = intakeFields?.length
        ? { type: 'object', description: detailsDescription, properties: detailsProperties }
        : { type: 'object', description: detailsDescription };
    return [
        {
            type: 'function',
            name: 'knowledge_search',
            description: 'Search company knowledge base for FAQs, policies, pricing ranges, services.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    top_k: { type: 'number' }
                },
                required: ['query']
            }
        },
        {
            type: 'function',
            name: 'check_service_area',
            description: 'Check whether the company services the provided ZIP code.',
            parameters: {
                type: 'object',
                properties: {
                    zip: { type: 'string' }
                },
                required: ['zip']
            }
        },
        {
            type: 'function',
            name: 'get_availability',
            description: 'Check available appointment slots for a requested date/time.',
            parameters: {
                type: 'object',
                properties: {
                    start_time: { type: 'string', description: 'Preferred time or date range (natural language or ISO).' },
                    end_time: { type: 'string', description: 'Optional window end time.' },
                    timezone: { type: 'string', description: 'IANA timezone name, e.g. America/Chicago.' }
                },
                required: ['start_time']
            }
        },
        {
            type: 'function',
            name: 'create_booking',
            description: 'Create an appointment after confirming the booking details with the caller.',
            parameters: {
                type: 'object',
                properties: {
                    start_time: { type: 'string', description: 'Start time for the appointment (ISO or selected slot).' },
                    end_time: { type: 'string', description: 'Optional end time.' },
                    timezone: { type: 'string', description: 'IANA timezone name.' },
                    customer_name: { type: 'string', description: 'Customer full name.' },
                    customer_email: { type: 'string', description: 'Customer email (optional, can be collected after booking).' },
                    service_type: { type: 'string', description: 'Service type label.' },
                    details: detailsSchema,
                    notes: { type: 'string', description: 'Notes for the appointment.' },
                    confirmed: { type: 'boolean', description: 'Must be true once the caller confirms the booking.' }
                },
                required: ['start_time', 'confirmed']
            }
        },
        {
            type: 'function',
            name: 'hold_slot',
            description: 'Temporarily reserve a specific appointment slot while confirming details.',
            parameters: {
                type: 'object',
                properties: {
                    slot: { type: 'string', description: 'The slot start time (ISO or selected slot).' },
                    timezone: { type: 'string', description: 'IANA timezone name.' },
                    hold_minutes: { type: 'number', description: 'How long to hold the slot (minutes).' }
                },
                required: ['slot']
            }
        },
        {
            type: 'function',
            name: 'send_booking_link',
            description: 'Send a confirmation link by email after an appointment is booked so the caller can manage it.',
            parameters: {
                type: 'object',
                properties: {
                    email: { type: 'string', description: 'Customer email address to send the booking link to.' }
                },
                required: ['email']
            }
        },
        {
            type: 'function',
            name: 'list_appointments_by_phone',
            description: 'List caller appointments (for: what did I book last time? reschedule/cancel).',
            parameters: {
                type: 'object',
                properties: {
                    range_days: { type: 'number', description: 'How many days back/forward to search. Default 90.' }
                },
                required: []
            }
        },
        {
            type: 'function',
            name: 'cancel_appointment',
            description: 'Cancel an appointment.',
            parameters: {
                type: 'object',
                properties: {
                    appointment_id: { type: 'string' },
                    reason: { type: 'string' }
                },
                required: ['appointment_id']
            }
        },
        {
            type: 'function',
            name: 'reschedule_appointment',
            description: 'Reschedule an appointment to a new start time.',
            parameters: {
                type: 'object',
                properties: {
                    appointment_id: { type: 'string' },
                    new_start_time: { type: 'string' },
                    timezone: { type: 'string' },
                    duration_minutes: { type: 'number' }
                },
                required: ['appointment_id', 'new_start_time', 'timezone']
            }
        },
        {
            type: 'function',
            name: 'transfer_call',
            description: 'Transfer the caller to a human or voicemail/queue.',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string' },
                    queue: { type: 'string', description: "e.g. 'sales', 'support', 'voicemail'" }
                },
                required: ['queue']
            }
        },
        {
            type: 'function',
            name: 'request_callback',
            description: 'Capture a callback request when booking cannot be completed.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    callback_number: { type: 'string' },
                    reason: { type: 'string' },
                    preferred_time: { type: 'string' }
                }
            }
        },
        {
            type: 'function',
            name: 'end_call',
            description: 'Politely end the call after the goodbye message.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    ];
}
