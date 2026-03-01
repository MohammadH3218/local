# HandyCall.ai — AI Communications Design

> Architecture and design for the AI communications layer: voice agents, messaging automation, and intelligence features.

---

## 1. AI Communications Overview

HandyCall's primary differentiator is AI-powered communication automation. This document specifies the expanded capabilities.

### 1.1 Current State

| Capability | Status | Technology |
|-----------|--------|-----------|
| Inbound call answering | ✅ Implemented | Twilio Media Streams → Voice Bridge → OpenAI Realtime |
| Lead qualification | ✅ Implemented | OpenAI tool-calling during calls |
| Appointment scheduling | ✅ Implemented | `create_booking` + `hold_slot` tools |
| Knowledge base search | ✅ Implemented | RAG: OpenAI embeddings → DynamoDB vector store |
| Call recording & transcripts | ✅ Implemented | S3 storage, save_call tool |
| SMS confirmations | ✅ Implemented | Twilio SMS (A2P 10DLC) |
| Outbound calls | ❌ Not implemented | — |
| Messaging automation | ❌ Not implemented | — |
| Multi-provider routing | ❌ Not implemented | — |
| Customer-facing AI assistant | ❌ Not implemented | — |

### 1.2 Expanded Capabilities

| Capability | Phase | Priority |
|-----------|-------|----------|
| Outbound reminder calls | Phase 1 | High |
| Follow-up call sequences | Phase 2 | High |
| SMS automation (templates, sequences) | Phase 1 | High |
| In-app messaging AI | Phase 3 | Medium |
| Customer-facing AI support | Phase 4 | Medium |
| Multi-provider call routing | Phase 3 | Medium |
| WhatsApp integration | Phase 5 | Low |
| Predictive outreach | Phase 5 | Low |

---

## 2. Voice AI Architecture (Expanded)

### 2.1 Inbound Call Flow (Enhanced)

```
Caller dials business number
         │
         ▼
  Twilio receives call
         │
         ▼
  Twilio webhooks → Voice Bridge
         │
         ▼
  Voice Bridge:
    1. Opens WebSocket to Twilio (Media Streams)
    2. Calls Realtime Controller: POST /v1/session-config
         │
         ▼
  Realtime Controller:
    1. Resolves tenant: POST /tenant/resolve (phone → company)
    2. Loads company config (agent-config, business hours, knowledge)
    3. Builds system prompt with company context
    4. Defines tool schema
    5. Opens WebSocket to OpenAI Realtime API
         │
         ▼
  Conversation begins (audio streaming bidirectional)
         │
         ├── AI greets caller with company-specific greeting
         ├── AI qualifies need (service type, urgency, location)
         ├── AI searches knowledge base for answers
         ├── AI checks availability and proposes times
         ├── AI creates booking if caller agrees
         ├── AI captures lead info (name, phone, email, notes)
         │
         ▼
  Call ends:
    1. save_call tool → persist call record + metadata
    2. save_recording → S3
    3. Trigger: booking.created event (if booked)
    4. Trigger: lead.created event (if new lead)
    5. SMS: send confirmation to caller (if booking)
    6. Notification: push to pro (new lead/booking)
```

### 2.2 Outbound Call Flow (New)

```
Trigger source:
  ├── Scheduled event (EventBridge cron)
  │   ├── Appointment reminder (24h before)
  │   ├── Follow-up (2h after quote sent, no response)
  │   └── Subscription renewal (7 days before)
  │
  ├── Manual trigger (pro clicks "Call" in dashboard)
  │
  └── Automation trigger (follow-up sequence step)
         │
         ▼
  Backend: POST /internal/outbound-call
    1. Validate: pro has available calling minutes
    2. Validate: contact has not opted out
    3. Validate: within allowed calling hours (TCPA: 8am–9pm local)
    4. Create call record in DB (status: INITIATING)
         │
         ▼
  Twilio: REST API → create outbound call
    From: pro's AI number
    To: customer's phone
    Webhook: voice-bridge /outbound-connect
         │
         ▼
  Voice Bridge (outbound):
    1. Customer answers → Media Streams WebSocket opens
    2. Session config with outbound-specific context:
       - System prompt: "You are calling on behalf of {company_name}"
       - Context: appointment details / quote details / renewal info
       - Objective: confirm appointment / follow up on quote / etc.
    3. Same OpenAI Realtime pipeline
         │
         ▼
  Call ends:
    1. Update call record (duration, outcome, transcript)
    2. Trigger appropriate events
```

### 2.3 System Prompt Architecture

**Base prompt template (maintained by Realtime Controller):**

```
You are an AI phone assistant for {company_name}, a {service_categories} business
based in {city}, {state}. The company's timezone is {timezone}.

PERSONALITY:
- Greeting tone: {greeting_tone} (professional/friendly/casual)
- You represent the business directly — speak as "we" not "the company"
- Be concise and natural — this is a phone conversation

CAPABILITIES:
- Answer questions about services using the knowledge base
- Check availability and propose appointment times
- Create bookings for qualified callers
- Capture lead information (name, phone, email, notes)
- {conditional: discuss_pricing ? "Provide pricing information" : "Do not quote prices, offer to have someone follow up"}
- {conditional: handle_emergencies ? "Handle emergency requests with urgency" : "For emergencies, transfer to the owner"}

BUSINESS HOURS: {formatted_business_hours}
CURRENT TIME: {current_time_in_timezone}

RULES:
- Always confirm the customer's phone number
- If you cannot answer a question, flag it and offer to have someone call back
- Never make up information not in the knowledge base
- If the caller asks to speak to a human, {escalation_behavior}
- Maximum call duration: 5 minutes (gracefully wrap up)

{conditional_outbound_context}
```

**Outbound-specific context injection:**

```
OUTBOUND CALL CONTEXT:
You are calling {contact_name} at {contact_phone}.
Reason: {call_reason}
Details: {call_details}

Objective: {call_objective}
If they don't answer or are busy, leave a brief voicemail.
```

---

## 3. Messaging Automation

### 3.1 SMS Automation Engine

**Architecture:**

```
┌─────────────────────────────────────────────┐
│             Message Orchestrator             │
│  (NestJS service in backend)                │
├─────────────────────────────────────────────┤
│                                             │
│  Trigger Sources:                           │
│  ├── Event-driven (booking.created, etc.)  │
│  ├── Scheduled (cron via EventBridge)      │
│  ├── Sequence step (follow-up chain)       │
│  └── Manual (pro sends from dashboard)     │
│                                             │
│  Processing:                                │
│  ├── Template resolution (variables)       │
│  ├── Compliance check (opt-in, quiet hours)│
│  ├── Rate limiting (per contact)           │
│  ├── Usage gate (plan SMS limit)           │
│  └── Delivery routing                      │
│                                             │
│  Delivery:                                  │
│  ├── SMS → Twilio API                      │
│  ├── Email → AWS SES                       │
│  ├── In-app → Messages table + push        │
│  └── (Future) WhatsApp → Meta API          │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.2 Message Templates

**Pre-built templates (pro can customize):**

| Template ID | Trigger | Default Content |
|------------|---------|----------------|
| `booking_confirmation` | booking.created | "Hi {customer_name}, your {service_type} appointment with {company_name} is confirmed for {date} at {time}. Reply STOP to opt out." |
| `booking_reminder_24h` | 24h before appointment | "Reminder: Your {service_type} appointment with {company_name} is tomorrow at {time}. Reply YES to confirm or call us to reschedule." |
| `booking_reminder_1h` | 1h before appointment | "{company_name} reminder: Your {service_type} appointment starts in 1 hour. We'll see you soon!" |
| `booking_cancelled` | booking.cancelled | "Your {service_type} appointment with {company_name} on {date} has been cancelled. Reply to rebook." |
| `quote_sent` | quote.created | "Hi {customer_name}, {company_name} sent you a quote for {service_type}. View details: {quote_link}" |
| `follow_up_no_response` | 48h after lead, no booking | "Hi {customer_name}, this is {company_name}. We wanted to follow up on your {service_type} inquiry. Still need help? Reply YES." |
| `review_request` | 24h after booking.completed | "Hi {customer_name}, how was your experience with {company_name}? Leave a review: {review_link}" |
| `payment_receipt` | payment.received | "Receipt from {company_name}: {service_type} — ${amount}. Thank you!" |
| `subscription_renewal` | 7d before renewal | "Your {service_type} subscription with {company_name} renews on {date}. Reply PAUSE to pause or CANCEL to stop." |

### 3.3 Template Variables

| Variable | Source |
|----------|--------|
| `{customer_name}` | Contact first_name or "there" if unknown |
| `{company_name}` | Company.company_name |
| `{service_type}` | Appointment.service_type (human-readable) |
| `{date}` | Formatted in company timezone |
| `{time}` | Formatted in company timezone |
| `{amount}` | Formatted currency (e.g., "$89.00") |
| `{quote_link}` | Short URL to quote view |
| `{review_link}` | Short URL to review page |
| `{booking_link}` | Short URL to public booking page |

### 3.4 Compliance Rules

| Rule | Implementation |
|------|---------------|
| **Opt-in required** | Track SMS consent per contact. No SMS without prior opt-in. |
| **STOP handling** | Auto-detect "STOP" replies → set `do_not_contact: true` → confirm opt-out |
| **Quiet hours** | No automated SMS between 9 PM and 8 AM in contact's local timezone |
| **Rate limiting** | Max 3 automated SMS per contact per day |
| **A2P 10DLC** | Already compliant (existing setup). New numbers must be registered. |
| **Content restrictions** | No loan/debt collection. No political. No SHAFT content. |

---

## 4. Follow-Up Sequences

### 4.1 Sequence Engine

```
Sequence definition:
{
  "sequence_id": "new-lead-follow-up",
  "trigger": "lead.created",
  "trigger_conditions": { "lead_status": "new", "has_booking": false },
  "steps": [
    {
      "step": 1,
      "delay": "2h",
      "channel": "sms",
      "template": "follow_up_no_response",
      "exit_if": ["booking_created", "contact_replied", "opted_out"]
    },
    {
      "step": 2,
      "delay": "24h",
      "channel": "sms",
      "template": "follow_up_second_attempt",
      "exit_if": ["booking_created", "contact_replied", "opted_out"]
    },
    {
      "step": 3,
      "delay": "72h",
      "channel": "outbound_call",
      "call_objective": "Follow up on service inquiry",
      "exit_if": ["booking_created", "contact_replied", "opted_out"]
    }
  ]
}
```

### 4.2 Pre-Built Sequences

| Sequence | Trigger | Steps |
|----------|---------|-------|
| **New Lead Follow-Up** | lead.created (no booking within 2h) | SMS (2h) → SMS (24h) → AI call (72h) |
| **Quote Follow-Up** | quote.sent (no response within 24h) | SMS (24h) → SMS (48h) |
| **Review Request** | booking.completed | SMS (24h) with review link |
| **Subscription Renewal** | 14d before renewal | SMS (14d) → SMS (7d) → SMS (1d) |
| **Win-Back** | No booking in 90 days | SMS (90d) with special offer |

### 4.3 Exit Conditions

A contact exits a sequence when any of these occur:
- They book an appointment
- They reply to any message in the sequence
- They opt out (STOP)
- Pro manually marks lead as "lost"
- The sequence reaches its last step
- The contact is deleted

---

## 5. AI Intelligence Features

### 5.1 Call Intelligence (Existing + Enhanced)

| Feature | Status | Description |
|---------|--------|-------------|
| **Call transcription** | ✅ Exists | OpenAI Realtime provides real-time transcript |
| **Call summary** | ✅ Exists | AI generates post-call summary |
| **Call intent detection** | ✅ Exists | `CallIntent` enum: BOOKING, INQUIRY, COMPLAINT, etc. |
| **Lead quality scoring** | 🆕 New | Score 0–100 based on: urgency, budget indicators, service match, location match |
| **Sentiment analysis** | 🆕 New | Track caller sentiment through call (positive/neutral/negative) |
| **Call outcome prediction** | 🆕 New | Predict: will this lead convert? (based on historical data) |
| **Flagged questions** | ✅ Exists | Questions AI couldn't answer → pro review queue |
| **Competitor mentions** | 🆕 New | Flag when callers mention competitors |

### 5.2 Lead Scoring Algorithm

```
Base score: 50

Positive signals (add points):
  +15: Mentioned specific service need
  +10: Provided timeline/urgency
  +10: Asked about pricing (indicates buying intent)
  +10: Location within service area
  +5:  Provided email (engaged)
  +5:  Asked about availability (ready to book)
  +5:  Return customer

Negative signals (subtract points):
  -15: Just shopping around / "just checking"
  -10: Location outside service area
  -10: Budget significantly below minimum
  -5:  Hung up quickly (< 30 seconds)
  -5:  Refused to provide contact info

Score ranges:
  80-100: Hot lead 🔴 (immediate follow-up)
  60-79:  Warm lead 🟡 (follow up within 24h)
  40-59:  Cool lead 🔵 (add to sequence)
  0-39:   Cold lead ⚪ (low priority)
```

### 5.3 Knowledge Base Enhancement

**Current:** FAQ, SERVICE, POLICY, PRODUCT, SAFETY types with RAG vector search.

**Enhancements:**

| Enhancement | Description |
|------------|-------------|
| **Auto-learn from calls** | After flagged questions are answered by pro, auto-add to knowledge base |
| **Pricing intelligence** | Structured pricing rules integrated into RAG (not just free text) |
| **Competitor FAQ** | "How do we compare to X?" responses |
| **Seasonal content** | Time-aware knowledge (e.g., "HVAC tune-up special this month") |
| **Multi-language** | Support for Spanish knowledge base entries (Phase 5) |

---

## 6. Customer-Facing AI Assistant

### 6.1 Purpose

An AI chatbot on the customer portal and marketplace that helps customers:
- Find the right service provider
- Answer questions about the platform
- Help with booking modifications
- Provide support for common issues

### 6.2 Architecture

```
Customer interacts via:
  ├── Web chat widget (customer portal / marketplace)
  ├── SMS (reply to platform messages)
  └── (Future) WhatsApp / app chat
         │
         ▼
  Customer AI Service (NestJS module)
    1. Determine context (booking inquiry, support, search)
    2. Load relevant data (customer profile, bookings, providers)
    3. Call LLM (Claude via Bedrock) with context + tools
    4. Return response
         │
         ▼
  Tools available to customer AI:
    - search_providers(category, location)
    - get_provider_availability(provider_id, date_range)
    - create_booking(provider_id, service, date, time)
    - get_booking_status(booking_id)
    - reschedule_booking(booking_id, new_date, new_time)
    - cancel_booking(booking_id)
    - get_payment_status(booking_id)
    - escalate_to_human()
```

### 6.3 System Prompt

```
You are the HandyCall customer assistant. You help customers find service providers,
book appointments, and manage their bookings.

CAPABILITIES:
- Search for service providers by category and location
- Check provider availability and book appointments
- Help with rescheduling or cancelling bookings
- Answer questions about payments and receipts
- Provide general platform help

RULES:
- Be friendly and helpful
- Never share provider contact info directly (use the platform)
- For complaints about service quality, escalate to human support
- For payment disputes, escalate to human support
- Do not make promises about specific pricing (it varies by provider)
- Protect customer privacy — never share one customer's info with another
```

---

## 7. AI Model Strategy

### 7.1 Model Selection

| Use Case | Model | Reason |
|----------|-------|--------|
| **Voice calls (real-time)** | OpenAI Realtime (gpt-4o-mini-realtime) | Only option for real-time voice with tool-calling |
| **Customer AI assistant** | Claude 3.5 Sonnet (Bedrock) | Better reasoning, existing integration |
| **Call summarization** | Claude 3 Haiku (Bedrock) | Fast, cheap, good for summarization |
| **Lead scoring** | Rule-based + Claude Haiku | Hybrid: rules for signals, LLM for nuance |
| **Embeddings** | OpenAI text-embedding-3-small | Existing RAG pipeline |
| **SMS template generation** | Claude Haiku | Quick text generation |

### 7.2 Cost Management

| Measure | Implementation |
|---------|---------------|
| **Per-company usage limits** | Existing plan limits (minutes, SMS) enforced by UsageGateService |
| **Model tier by plan** | Starter: mini models only. Pro: standard. Max: best available. |
| **Caching** | Cache common RAG queries (Redis, 5-min TTL) |
| **Prompt optimization** | Keep system prompts under 2000 tokens |
| **Batch processing** | Summarize calls in batch (not real-time) to use batch API pricing |
| **Embedding reuse** | Only re-embed knowledge items when content changes |

---

## 8. Call Quality & Monitoring

### 8.1 Metrics to Track

| Metric | Description | Target |
|--------|-------------|--------|
| **Call completion rate** | % of calls that reach a natural end (not hang-up) | > 80% |
| **Booking conversion rate** | % of calls that result in a booking | > 25% |
| **Lead capture rate** | % of calls that capture contact info | > 90% |
| **Average call duration** | Mean call length in seconds | 90–180s |
| **Escalation rate** | % of calls transferred to human | < 15% |
| **Flagged question rate** | % of calls with unanswerable questions | < 10% (decreasing) |
| **Caller satisfaction** | Post-call SMS survey (optional) | > 4.0/5.0 |
| **AI response latency** | Time for AI to respond after caller speaks | < 1.5s |

### 8.2 Quality Assurance

| Process | Frequency | Owner |
|---------|-----------|-------|
| Review flagged calls | Daily | Pro (dashboard notification) |
| Update knowledge base | Weekly | Pro (based on flagged questions) |
| Review escalation reasons | Weekly | Pro + HandyCall team |
| A/B test greeting styles | Monthly | HandyCall product team |
| Monitor booking accuracy | Ongoing | Automated (compare AI-created vs actual) |

### 8.3 Fallback & Error Handling

| Scenario | Fallback |
|----------|----------|
| OpenAI Realtime API down | Transfer to voicemail → notify pro |
| Voice bridge crash | Twilio fallback URL → voicemail |
| Tool call fails | AI acknowledges error, offers to have pro call back |
| Caller frustrated | Detect negative sentiment → offer human transfer |
| Call duration exceeds 5 min | Gracefully wrap up, offer to schedule callback |
| Unknown language | "I apologize, I can only assist in English at this time." → transfer |
