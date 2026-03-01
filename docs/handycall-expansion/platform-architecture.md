# HandyCall.ai — Platform Architecture Plan

> Complete architecture design for the expanded platform: AI communications runtime, marketplace, customer portal, pro business OS.

---

## 1. Architecture Overview

### 1.1 Current Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   Next.js   │───▶│   NestJS     │───▶│   DynamoDB   │
│   Web App   │    │   Backend    │    │   (17 tables) │
│  (Amplify)  │    │   (EB)       │    └──────────────┘
└─────────────┘    │              │───▶ S3, SES, Cognito
                   └──────────────┘
┌─────────────┐    ┌──────────────┐
│   Twilio    │───▶│ Voice Bridge │───▶ OpenAI Realtime API
│ Media Streams│   │  (WebSocket) │
└─────────────┘    └──────────────┘
                   ┌──────────────┐
                   │  Realtime    │───▶ Backend /tools/*
                   │  Controller  │
                   └──────────────┘
┌─────────────┐
│  iOS App    │───▶ Backend API (via REST)
│  (Swift)    │
└─────────────┘
```

### 1.2 Expanded Architecture

```
                              ┌─────────────────────────────────┐
                              │         CloudFront CDN          │
                              └────────┬──────────┬─────────────┘
                                       │          │
                              ┌────────▼──┐  ┌────▼─────────────┐
                              │  Next.js   │  │  Static Assets   │
                              │  (Amplify) │  │  (S3 + CF)       │
                              └─────┬──────┘  └──────────────────┘
                                    │
                              ┌─────▼────────────────────────────┐
                              │         API Gateway / ALB         │
                              └─────┬──────────┬─────────────────┘
                                    │          │
                    ┌───────────────▼┐    ┌────▼──────────────────┐
                    │  NestJS Backend │    │  Search Service       │
                    │  (ECS/EB)       │    │  (OpenSearch)         │
                    │  25+ modules    │    └───────────────────────┘
                    └───┬─────┬──────┘
                        │     │
          ┌─────────────▼┐   ┌▼──────────────┐
          │  DynamoDB     │   │  S3            │
          │  (25+ tables) │   │  (recordings,  │
          └───────────────┘   │   transcripts, │
                              │   images)      │
          ┌───────────────┐   └────────────────┘
          │  ElastiCache  │
          │  (Redis)      │   ┌────────────────┐
          └───────────────┘   │  SQS Queues    │
                              │  (events, jobs)│
          ┌───────────────┐   └────────────────┘
          │  Cognito      │
          │  (3 pools)    │   ┌────────────────┐
          └───────────────┘   │  EventBridge   │
                              │  (event bus)   │
┌─────────────┐               └────────────────┘
│  Twilio     │
│  (voice+SMS)│───▶ Voice Bridge ───▶ OpenAI Realtime
└─────────────┘     Realtime Controller
                              ┌────────────────┐
                              │  Stripe        │
                              │  (payments)    │
                              └────────────────┘
```

---

## 2. New Services Required

### 2.1 Search Service

**Purpose:** Provider search and discovery for marketplace. DynamoDB is not suitable for full-text search, geo queries, and faceted filtering.

**Technology:** Amazon OpenSearch Service (managed Elasticsearch)

**Responsibilities:**
- Index provider profiles (name, categories, location, rating, availability)
- Full-text search with typo tolerance
- Geo-radius queries (find providers within X miles)
- Faceted filtering (category, rating, verified, availability)
- Relevance scoring (rating × response time × reviews × distance)

**Data Flow:**
1. Backend updates provider profile → DynamoDB
2. DynamoDB Stream → Lambda → OpenSearch index update
3. Search API queries OpenSearch, returns provider IDs
4. Backend hydrates full profiles from DynamoDB

### 2.2 Event Bus

**Purpose:** Decouple services. When a booking is created, multiple things need to happen (send email, send SMS, update provider stats, notify customer, update search index). Event-driven architecture prevents tight coupling.

**Technology:** Amazon EventBridge

**Events:**
```
booking.created       → Send confirmation email/SMS, update calendar, update search index
booking.cancelled     → Notify pro, update calendar, process refund
booking.completed     → Prompt review, update provider stats
review.created        → Update provider rating, update search index
lead.created          → Notify pro, update lead count
call.completed        → Save recording, generate transcript, update stats
payment.received      → Notify pro, update revenue metrics
subscription.changed  → Update provider tier, adjust search ranking
message.sent          → Deliver to recipient, push notification
```

### 2.3 Background Job Queue

**Purpose:** Async processing for non-time-critical tasks.

**Technology:** SQS + Lambda (or Bull queue on the backend for simpler ops)

**Jobs:**
- Transcript generation (after call)
- Email batch sends (weekly summaries)
- Review request automation (24h after job completion)
- Search index updates
- Usage recalculation
- Follow-up sequence triggers
- Webhook delivery with retries

### 2.4 Cache Layer

**Purpose:** Reduce DynamoDB reads for frequently accessed data (provider profiles for search, session data, rate limiting).

**Technology:** Amazon ElastiCache (Redis)

**Cache Targets:**
- Provider profiles (5-min TTL for search results)
- User sessions (supplement Cognito tokens)
- Rate limiting counters
- Feature flags
- Real-time availability snapshots

---

## 3. Authentication & Authorization Expansion

### 3.1 Current State

- 2 Cognito pools: `users` (pro owners) and `admin`
- Roles: `OWNER`, `ADMIN`, `EMPLOYEE` (limited)
- JWT with company_id claim

### 3.2 Expansion Plan

**Option A (Recommended): Extend existing users pool with a new attribute**

Add `custom:account_type` attribute to existing Cognito users pool:
- `pro` — service provider (current OWNER behavior)
- `customer` — consumer account
- `employee` — team member of a pro

**Why extend, not create a new pool:**
- Simpler token management (one JWKS endpoint)
- Users who are both customers and pros share one account
- Existing auth flows (Google/Apple) continue working
- Backend JWT strategy only needs minor extension

**Implementation:**
1. Add `custom:account_type` to Cognito user pool
2. Update registration flow to set account_type
3. Extend JWT strategy to extract account_type
4. Add `CustomerGuard` that checks `account_type === 'customer'`
5. Update `@Auth()` decorator to include account_type
6. Create customer profile table (separate from company)

### 3.3 Role Matrix

| Role | Scope | Dashboard | Customer Portal | Admin Panel |
|------|-------|-----------|----------------|-------------|
| `customer` | Self | ✗ | ✓ (own data only) | ✗ |
| `pro` (OWNER) | Company | ✓ (own company) | ✗ | ✗ |
| `employee` | Company | ✓ (limited by permissions) | ✗ | ✗ |
| `admin` | Platform | ✓ (all companies) | ✓ (all customers) | ✓ |

### 3.4 Permission Model for Pro Teams

```typescript
enum ProPermission {
  VIEW_LEADS = 'view_leads',
  MANAGE_LEADS = 'manage_leads',
  VIEW_SCHEDULE = 'view_schedule',
  MANAGE_SCHEDULE = 'manage_schedule',
  VIEW_CUSTOMERS = 'view_customers',
  MANAGE_CUSTOMERS = 'manage_customers',
  VIEW_PAYMENTS = 'view_payments',
  MANAGE_BILLING = 'manage_billing',
  MANAGE_AI_SETTINGS = 'manage_ai_settings',
  MANAGE_TEAM = 'manage_team',
  VIEW_REPORTS = 'view_reports',
}

// Preset roles
const OWNER_PERMISSIONS = Object.values(ProPermission); // All
const DISPATCHER_PERMISSIONS = [VIEW_LEADS, MANAGE_LEADS, VIEW_SCHEDULE, MANAGE_SCHEDULE, VIEW_CUSTOMERS];
const TECHNICIAN_PERMISSIONS = [VIEW_SCHEDULE, VIEW_CUSTOMERS];
```

---

## 4. Marketplace Core Architecture

### 4.1 Provider Profile

**Extends existing `Company` entity with marketplace-facing fields:**

```
Company (existing) + new fields:
  - public_profile_enabled: boolean
  - public_slug: string (URL-friendly, unique)
  - public_description: string
  - profile_photo_url: string
  - gallery_urls: string[]
  - overall_rating: number (cached aggregate)
  - total_reviews: number (cached)
  - response_time_minutes: number (cached)
  - verified: boolean (admin-set)
  - badges: string[] (e.g., "top_rated", "quick_responder")
  - categories: ServiceType[] (existing)
  - service_area_geo: { lat, lng, radius_miles } (new — for geo search)
```

### 4.2 Review System

**New table: Reviews**

```
PK: provider_company_id
SK: review_id (UUID)

Fields:
  - customer_user_id: string
  - booking_id: string (linked to completed booking)
  - rating: number (1-5)
  - comment: string
  - service_type: ServiceType
  - created_at: number
  - response: string (pro's reply)
  - response_at: number
  - reported: boolean
  - visible: boolean
```

**Rules:**
- Only customers who completed a booking can review
- One review per booking
- Pros can respond (once)
- Admin can hide/remove reported reviews
- Rating aggregation: trigger recalculation on review create/update/delete

### 4.3 Search & Discovery Flow

```
Customer enters: "plumber" + "Austin TX"
       │
       ▼
  [Search API]
       │
       ├── Parse query → category: PLUMBING, location: (30.27, -97.74)
       │
       ├── Query OpenSearch:
       │     filter: category = PLUMBING
       │     filter: geo_distance(location, 30mi)
       │     filter: public_profile_enabled = true
       │     sort: relevance_score DESC
       │
       ├── Return top 20 provider IDs + scores
       │
       ├── Hydrate from DynamoDB: profiles, ratings, availability
       │
       └── Return to frontend
```

---

## 5. Telephony & SMS Orchestration

### 5.1 Current State

- Twilio Media Streams for voice (WebSocket audio)
- OpenAI Realtime API for AI conversation
- Realtime Controller for session config + tool relay
- Voice Bridge for audio streaming
- SMS via Twilio (A2P 10DLC compliant)

### 5.2 Expansion: Outbound Calls

**New capability:** AI-initiated outbound calls for:
- Appointment reminders (24h, 1h before)
- Follow-up calls (after quote sent, no response)
- Review request calls (after job completion)
- Subscription renewal reminders

**Architecture:**
```
EventBridge event (e.g., "appointment_reminder_due")
       │
       ▼
  Lambda trigger
       │
       ▼
  Backend: POST /internal/outbound-call
       │
       ├── Check: Pro has calling minutes remaining
       ├── Check: Contact has not opted out
       ├── Check: Within allowed calling hours
       │
       ▼
  Twilio: Create outbound call
       │
       ▼
  Media Streams → Voice Bridge → OpenAI Realtime
  (same pipeline, different system prompt for outbound context)
```

### 5.3 Expansion: Messaging Automation

**New capability:** Beyond SMS, support:
- In-app messaging (customer ↔ pro through platform)
- Auto-reply templates (booking confirmation, follow-up)
- Scheduled messages (reminders)
- WhatsApp Business API (Phase 5, future)

**Architecture:**
```
Message send request
       │
       ├── In-app: Store in Messages table + push notification
       ├── SMS: Twilio SMS API + compliance check (opt-in, quiet hours)
       ├── Email: SES transactional
       └── WhatsApp: (future) WhatsApp Business API
```

### 5.4 AI Tool-Calling Strategy

**Current tools (keep):**
- `create_lead`, `save_call`, `get_availability`, `create_booking`, `hold_slot`
- `knowledge_search`, `check_service_area`, `list_appointments_by_phone`
- `cancel_appointment`, `reschedule_appointment`, `send_booking_link`

**New tools for expansion:**
- `lookup_customer` — Check if caller is an existing customer (by phone)
- `get_service_pricing` — Retrieve pricing for specific service type
- `create_quote` — Generate and send quote to customer
- `collect_payment_link` — Send payment link via SMS
- `escalate_to_human` — Transfer call to pro's cell with context
- `schedule_follow_up` — Create follow-up task/call
- `check_subscription_status` — For recurring service customers
- `get_pro_availability_multi` — Check multiple providers (for marketplace AI assistant)

---

## 6. Security & Compliance

### 6.1 Data Protection

| Category | Measure |
|----------|---------|
| **Encryption at rest** | DynamoDB: AWS-managed encryption. S3: SSE-S3. |
| **Encryption in transit** | HTTPS everywhere. TLS 1.2+ for all API calls. |
| **PII handling** | Customer phone, email, address encrypted in DynamoDB (client-side encryption for sensitive fields). |
| **Call recordings** | S3 with presigned URLs (15-min expiry). No permanent public access. |
| **Payment data** | Never stored on our servers. Stripe handles all card data (PCI DSS compliant). |
| **Secrets** | SSM Parameter Store (SecureString). Never in code or env files in repo. |

### 6.2 Authentication Security

| Measure | Implementation |
|---------|---------------|
| **Password policy** | Cognito: 8+ chars, uppercase, number, symbol |
| **MFA** | Optional (Cognito supports TOTP, SMS) — recommend for pro accounts |
| **Session expiry** | Access token: 1 hour. Refresh token: 30 days. |
| **Brute force protection** | Cognito built-in: account lockout after 5 failed attempts |
| **CORS** | Strict origin whitelist per environment |
| **CSP** | Content-Security-Policy headers on web |
| **Rate limiting** | API rate limits per user/IP (implement via middleware or API Gateway) |

### 6.3 Compliance Notes

| Regulation | Relevance | Action |
|-----------|-----------|--------|
| **TCPA** | SMS/call compliance (US) | Existing A2P 10DLC. Ensure opt-in before AI calls/SMS. |
| **CCPA/CPRA** | California consumer privacy | Add data export/deletion for customer accounts. |
| **SOC 2** | Enterprise trust | Aspirational (Phase 5). Start with security controls. |
| **PCI DSS** | Payment card data | Stripe handles all card data. We never touch PANs. |
| **HIPAA** | Not applicable unless serving medical | Do not store health data. |

### 6.4 Marketplace Trust & Safety

| Measure | Implementation |
|---------|---------------|
| **Pro verification** | Admin manual review + license/insurance upload (optional per category) |
| **Review moderation** | Auto-flag reviews with profanity. Admin review queue. |
| **Fraud detection** | Flag: new accounts with many bookings, review bombing, fake profiles |
| **Dispute resolution** | Admin panel for handling customer-pro disputes |
| **Content policy** | No inappropriate images, fake reviews, misleading pricing |

---

## 7. Onboarding Flows (Technical)

### 7.1 Pro Onboarding (Extended)

```
Step 1: Business Profile
  → API: PUT /companies/:id (update name, description, categories, service_area)
  → Upload: profile photo → S3 → update company.profile_photo_url

Step 2: Service Offerings
  → API: POST /pricing-rules (create pricing per service type)
  → API: PUT /companies/:id (update booking_services)

Step 3: Schedule
  → API: PUT /companies/:id (update business_hours, timezone, schedule_overrides)

Step 4: Communication Setup
  → API: POST /telephony/claim-number (provision AI phone number)
  → API: PUT /agent-config (call handling rules)
  → UI: Show call forwarding guide

Step 5: Messaging Setup
  → API: POST /telephony/claim-sms-number (or reuse voice number)
  → API: PUT /agent-config (messaging templates, auto-reply)

Step 6: AI Agent Config
  → API: PUT /agent-config (greeting tone, booking mode, escalation)
  → API: POST /knowledge (quick-fill service knowledge)

Step 7: Payments
  → API: POST /billing/connect/setup (Stripe Connect Express onboarding)
  → Redirect: Stripe hosted onboarding → callback

Step 8: Team (Optional)
  → API: POST /users (invite team members)
  → Email: Invitation sent via SES

Step 9: Test Mode
  → API: POST /telephony/test-call (trigger test inbound call)
  → UI: Show call transcript + booking result in real-time

Step 10: Go Live
  → API: PUT /companies/:id (set status = ACTIVE, public_profile_enabled = true)
  → UI: Celebration screen + next steps guide
```

### 7.2 Customer Onboarding (Lightweight)

```
After signup:
  Step 1: Location (optional)
    → Prompt: "Where are you located?" (city/ZIP for better search results)
    → API: PUT /customers/:id (update default_location)

  Step 2: Notification Preferences
    → Prompt: "How should we notify you?" (email, SMS, push)
    → API: PUT /customer-preferences/:id

  (Skip to portal — everything else is optional until needed)

  Step 3: Payment Method (deferred until first booking)
    → API: POST /customers/:id/payment-method (via Stripe Setup Intent)
```

---

## 8. Infrastructure Scaling Considerations

### 8.1 Current Bottlenecks

| Component | Bottleneck | Mitigation |
|-----------|-----------|-----------|
| Voice Bridge | Single process, WebSocket-based | Deploy multiple instances behind ALB with sticky sessions |
| DynamoDB | No search capability | Add OpenSearch for marketplace search |
| Backend (EB) | Single instance | Auto-scaling group with ALB health checks |
| Cognito | 10 req/sec default for some APIs | Request limit increase, implement caching |

### 8.2 Scaling Targets

| Phase | Users | Calls/day | API RPS |
|-------|-------|-----------|---------|
| Phase 1 (current) | 100 pros | 500 | 50 |
| Phase 2 | 1,000 pros | 5,000 | 500 |
| Phase 3 (marketplace) | 10,000 pros + 50,000 customers | 20,000 | 5,000 |
| Phase 4+ | 50,000+ pros + 500,000 customers | 100,000 | 25,000 |

### 8.3 Scaling Plan

| Component | Phase 1-2 | Phase 3+ |
|-----------|-----------|----------|
| **Backend** | EB auto-scaling (2–4 instances) | ECS Fargate (auto-scale to demand) |
| **Database** | DynamoDB on-demand | DynamoDB provisioned + DAX caching |
| **Search** | — | OpenSearch (2-node cluster) |
| **Cache** | — | ElastiCache Redis (2-node) |
| **Voice** | 2 voice bridge instances | 4+ instances, regional deployment |
| **CDN** | Amplify built-in | CloudFront for all static + API caching |
| **Monitoring** | CloudWatch basics | CloudWatch + X-Ray tracing + Alarm dashboards |

---

## 9. API Versioning Strategy

**Current:** All routes under `/api/v1/`

**Strategy:** Path-based versioning (existing pattern). When breaking changes are needed:
- New version: `/api/v2/` for changed endpoints
- Old version: `/api/v1/` maintained for 6 months with deprecation headers
- Non-breaking additions: add to existing `/api/v1/` (new fields, new endpoints)

**New endpoint prefixes for expansion:**
```
/api/v1/marketplace/*       — Search, discovery, provider profiles
/api/v1/customer/*          — Customer portal operations
/api/v1/reviews/*           — Review CRUD
/api/v1/messaging/*         — In-app messaging
```
