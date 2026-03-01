# HandyCall.ai — Repository Audit

> Generated 2026-02-26. Based on full codebase inspection of every package, config, and module.

---

## 1. Directory Map

```
HandyCall.ai/
├── packages/
│   ├── backend/          NestJS 10 REST API (port 3000)
│   ├── web/              Next.js 14 App Router dashboard (port 3001)
│   ├── voice-bridge/     Twilio Media Streams ↔ OpenAI Realtime bridge (port 8082)
│   ├── realtime-controller/  OpenAI Realtime session config + tool relay (port 8081)
│   ├── shared/           @handycall/shared — TypeScript types & constants
│   └── widget/           Embeddable chat widget (stub, dist/widget.js)
├── apps/
│   └── ios/              React Native / Xcode iOS app (Swift 6)
├── infrastructure/
│   ├── lambda/           AWS Lambda functions
│   ├── QUICK_START.md
│   └── README.md         Full AWS infra setup guide
├── scripts/              24 shell/JS scripts (DynamoDB, Cognito, seeding, QA)
├── docs/                 16 subdirectories, 9+ markdown files
├── package.json          npm workspaces root
├── tsconfig.json         ES2022, strict, decorators
├── amplify.yml           AWS Amplify CI/CD for web
└── *.md                  PROJECT_CONTEXT, DB_SCHEMA, API_REFERENCE, AGENTS, RUNBOOK
```

---

## 2. Tech Stack Summary

| Layer | Technology | Version / Notes |
|-------|-----------|----------------|
| **Monorepo** | npm workspaces | 6 packages + 1 app |
| **Backend** | NestJS | 10.3.0, TypeScript, Passport JWT |
| **Frontend** | Next.js (App Router) | 14.2.35, React 18.2 |
| **iOS** | Swift / Xcode | Swift 6, Cognito PKCE, APNs |
| **Styling** | Tailwind CSS | 3.4.0, shadcn/ui (Radix), CVA |
| **State** | Zustand | 4.4.7 (web), Context API |
| **Auth** | AWS Cognito + JWT | 2 pools (users + admin), RS256 |
| **Database** | DynamoDB | 17+ tables, on-demand, table-prefix pattern |
| **Storage** | S3 | Recordings, transcripts, KB docs |
| **Email** | AWS SES | Transactional (booking confirms, resets) |
| **Payments** | Stripe | Subscriptions + Stripe Connect (customer payments) |
| **Voice AI** | OpenAI Realtime API | gpt-realtime-mini, VAD, tool-calling |
| **Telephony** | Twilio | Media Streams, A2P 10DLC SMS |
| **LLM** | AWS Bedrock | Claude 3 Sonnet (fallback / RAG orchestration) |
| **Embeddings** | OpenAI | text-embedding-3-small |
| **RAG** | Custom | Chunk → embed → DynamoDB vector store → cosine search |
| **Charts** | Recharts | 2.15.0 |
| **Icons** | Lucide React | 0.309.0 |
| **Fonts** | Space Grotesk + Manrope | Google Fonts |
| **CI/CD** | AWS Amplify (web), Elastic Beanstalk (backend) | Docker → ECR → EB |
| **Secrets** | AWS SSM Parameter Store | Runtime injection |

---

## 3. Existing Pages & Flows

### 3.1 Marketing / Public Pages

| Route | Purpose | Status |
|-------|---------|--------|
| `/` | Landing page — hero, live call widget, stats, demo, how-it-works, industries, CTA | Implemented |
| `/pricing` | Pricing page (Starter/Pro/Max) | Implemented |
| `/contact` | Contact form | Implemented |
| `/login` | Email + Google/Apple social auth | Implemented |
| `/register` | Account creation | Implemented |
| `/forgot-password` | Request password reset | Implemented |
| `/reset-password` | Confirm new password | Implemented |
| `/verify-email` | Email verification | Implemented |
| `/terms` | Terms of service | Implemented |
| `/privacy-policy` | Privacy policy | Implemented |
| `/book/[token]` | Public booking link (customer-facing) | Implemented |

### 3.2 Dashboard (Pro/Owner)

| Route | Purpose |
|-------|---------|
| `/dashboard` | Overview: minutes, leads, appointments, revenue, activity feed |
| `/dashboard/calls` | Call list with search/filter |
| `/dashboard/calls/[id]` | Call detail, transcript, recording player |
| `/dashboard/messages` | SMS thread list |
| `/dashboard/messages/[id]` | Thread detail |
| `/dashboard/customers` | Lead/customer list |
| `/dashboard/contacts` | Contact CRM |
| `/dashboard/appointments` | Appointment calendar |
| `/dashboard/knowledge` | Knowledge base + service area config |
| `/dashboard/settings` | Call handling, business hours, AI config |
| `/dashboard/account-settings` | User profile settings |
| `/dashboard/usage` | Usage analytics (minutes, SMS, contacts) |
| `/dashboard/billing` | Billing overview |
| `/dashboard/billing/plans` | Plan comparison + upgrade |
| `/dashboard/billing/payment-method` | Payment method management |
| `/dashboard/billing/invoices` | Invoice history |
| `/dashboard/payments` | Customer payment records (Stripe Connect) |
| `/dashboard/notifications` | Notification center |
| `/dashboard/flagged-questions` | Unanswered questions for review |

### 3.3 Admin Panel

| Route | Purpose |
|-------|---------|
| `/admin` | System stats, top companies, activity |
| `/admin/login` | Admin authentication |
| `/admin/companies` | Company management |
| `/admin/companies/[id]` | Company detail |
| `/admin/users` | User management |
| `/admin/customers` | Customer management |
| `/admin/calls` | Global call log |
| `/admin/appointments` | Appointments management |
| `/admin/knowledge` | Knowledge management |
| `/admin/usage` | System-wide usage |
| `/admin/subscriptions` | Subscription management |
| `/admin/settings` | Admin settings |

### 3.4 Onboarding

| Route | Purpose |
|-------|---------|
| `/onboarding` | Redirect to first step |
| `/onboarding/[step]` | Dynamic step handler (profile, billing, etc.) |

---

## 4. Existing API Endpoints / Services

### 4.1 Backend Modules (25 NestJS modules)

| Module | Endpoints | Purpose |
|--------|-----------|---------|
| **auth** | 9 POST routes | Register, login, confirm, refresh, password flows |
| **companies** | 5 CRUD | Tenant management |
| **users** | 5 CRUD | Company staff |
| **contacts** | 8 routes | CRM: contacts, search, appointments, calls per contact |
| **calls** | 3 routes | Call history log |
| **appointments** | 5 CRUD + range query | Scheduling |
| **billing** | 20+ routes | Subscriptions, Stripe Connect, payment methods, invoices, webhooks, admin billing |
| **telephony** | 4 routes | Phone number claim, list, demo |
| **knowledge** | 5 CRUD | Knowledge base items with auto-embedding |
| **agent-config** | 2 routes | AI agent persona/behavior config |
| **realtime-tools** | 15 POST routes | AI agent callable tools (create_lead, save_call, get_availability, create_booking, knowledge_search, etc.) |
| **public-booking** | 8 routes | Token-based public booking, payment, reschedule |
| **calendar-integration** | OAuth + events | Google, Microsoft, Apple calendar sync |
| **webhooks** | 5 routes | Outbound webhook config, test, rotate |
| **messages** | CRUD | SMS log and management |
| **notifications** | CRUD | In-app + push notifications |
| **flagged-questions** | CRUD | Unanswered question review |
| **pricing-rules** | CRUD | Per-service pricing rules |
| **scheduling** | Service only | Availability calculation (timezone-aware) |
| **rag** | Service only | Chunk, embed, vector search |
| **admin** | 5 routes | System stats, activity, suspend |
| **dashboard** | Module only | Aggregated metrics |
| **follow-up-sequences** | Module only | Post-call automation (scaffold) |
| **company-numbers** | Service only | DID→company routing |
| **widget/chat** | Module only | Chat widget backend (scaffold) |

### 4.2 Voice Services

| Service | Endpoints | Purpose |
|---------|-----------|---------|
| **realtime-controller** | `POST /v1/session-config`, `POST /v1/control/connect`, `POST /v1/control/disconnect` | OpenAI Realtime session init |
| **voice-bridge** | WebSocket (Twilio Media Streams) | Audio relay Twilio ↔ OpenAI |

---

## 5. Existing Auth Roles & Assumptions

### Roles (from @handycall/shared)

| Role | Scope | Capabilities |
|------|-------|-------------|
| `OWNER` | Company | Full company management, billing, settings |
| `ADMIN` | Platform | System-wide access, subscription management, suspend companies |
| `EMPLOYEE` | Company | (Defined in types, limited implementation) |

### Auth Architecture

- **Cognito User Pools**: Two pools — `users` (customers/pros) and `admin` (platform)
- **JWT Strategy**: RS256 via Cognito JWKS, auto-provisions user from Cognito if not in DB
- **Guards**: `JwtAuthGuard` (global), `RolesGuard`, `ToolsAuthGuard` (server-to-server), `PlanFeatureGuard` (subscription gating)
- **NextAuth**: Wraps Cognito on the web frontend; credentials + Google + Apple providers
- **iOS**: Native Cognito PKCE flow for Google/Apple sign-in

### Current Assumption

There is **no "customer" role** today. The platform only serves **pros/business owners** (OWNER role) and **platform admins** (ADMIN role). The public booking flow is token-based, not account-based. **A consumer/customer account system does not exist yet.**

---

## 6. Design System Status

### Color Palette (extracted from `packages/web/src/app/globals.css`)

| Token | HSL Value | Hex Approx | Usage |
|-------|-----------|-----------|-------|
| `--background` | 150° 40% 98% | #F5FBF8 | Page background |
| `--foreground` | 160° 18% 12% | #191F1C | Body text |
| `--card` | 0° 0% 100% | #FFFFFF | Card backgrounds |
| `--primary` | 160° 84% 34% | #059669 | CTAs, links, active states (emerald) |
| `--primary-foreground` | 0° 0% 100% | #FFFFFF | Text on primary |
| `--secondary` | 160° 20% 96% | #F0F7F4 | Secondary backgrounds |
| `--muted` | 160° 22% 94% | #ECF5F0 | Muted text backgrounds |
| `--accent` | 160° 60% 90% | #D1F0E0 | Accent highlights |
| `--destructive` | 0° 84% 60% | #E53E3E | Error, delete |
| `--border` | 160° 16% 86% | #D4DDD8 | Borders |
| `--input` | 160° 20% 90% | #DEE8E2 | Input borders |
| `--ring` | 160° 84% 34% | #059669 | Focus ring |
| `--radius` | — | 0.75rem (12px) | Border radius |

### Tailwind Color Usage (in components)

- **Emerald**: `emerald-50`, `emerald-100`, `emerald-600`, `emerald-700` — primary actions
- **Slate**: `slate-50` through `slate-900` — neutrals
- **Red**: `red-50`, `red-200`, `red-600`, `red-700` — destructive
- **Amber**: `amber-400` through `amber-600` — warnings, usage alerts
- **Blue**: `blue-600` — informational
- **Violet**: `violet-600` — occasional accent

### Typography

| Purpose | Font | Weight | Tracking |
|---------|------|--------|----------|
| Display / Headings | Space Grotesk | 600-700 | -0.02em |
| Body / UI | Manrope | 400-500 | normal |

### Dark Mode

Defined in CSS (`darkMode: ['class']`) but not actively used. Dark theme tokens exist but most components only use light-mode Tailwind classes.

### Component Library

Based on **shadcn/ui** (Radix primitives + CVA variants):
- Button (6 variants × 4 sizes)
- Input, Label, Textarea, Select
- Card (Header/Title/Description/Content/Footer)
- Dialog (Content/Header/Title/Description/Footer)
- Avatar, Badge
- Dropdown Menu
- Toast / Toaster
- Logo (custom)

---

## 7. Gaps & Risks

### Critical Gaps (for expansion)

| Gap | Impact | Priority |
|-----|--------|----------|
| **No customer accounts** | Cannot build marketplace or customer portal | P0 |
| **No consumer search/discovery** | No way for customers to find pros | P0 |
| **No review/rating system** | Missing trust signals for marketplace | P1 |
| **No real-time messaging** | SMS only, no web chat between customer↔pro | P1 |
| **EMPLOYEE role incomplete** | Can't support pro teams (dispatcher, tech) | P1 |
| **No customer-facing navigation** | Site is 100% pro-oriented | P0 |
| **Pricing page is pro-facing** | No separation of customer vs pro experience | P1 |
| **Widget is a stub** | Chat widget not functional | P2 |
| **Follow-up sequences scaffold only** | Automation pipelines not built | P2 |
| **No category/search system** | No taxonomy for services beyond ServiceType enum | P1 |
| **No geo search** | Service area is zip-code list, no radius/geo queries | P2 |

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **DynamoDB lacks relational queries** | High | May need secondary indexes or ElasticSearch for marketplace search |
| **No consumer auth pool** | Medium | Extend Cognito with consumer pool or add role to existing pool |
| **Stripe Connect onboarding incomplete** | Medium | Express accounts created but not all pros may complete onboarding |
| **Voice bridge single-process** | Medium | Needs horizontal scaling strategy for call volume |
| **No CDN for static assets** | Low | Amplify provides CDN for web, but images not optimized |
| **Dark mode not implemented** | Low | CSS vars defined but components hardcode light classes |
| **Test coverage unclear** | Medium | Manual QA reports exist, automated test suite needs review |

### UI/UX Debt

- Landing page is pro-focused ("Your phones answered") — not consumer-friendly
- No audience separation (customer vs pro paths)
- Pricing page visible to all users (should be pro-only)
- Onboarding only covers pro setup — no customer onboarding
- Mobile responsive but not mobile-optimized
- Empty states exist but are minimal
- No loading skeletons on some pages

---

## 8. Existing Infrastructure Summary

### AWS Services in Use

| Service | Purpose |
|---------|---------|
| DynamoDB | Primary database (17+ tables) |
| S3 | Call recordings, transcripts, knowledge docs |
| Cognito | Authentication (2 user pools) |
| SES | Transactional email |
| SSM Parameter Store | Secrets management |
| KMS | Webhook signing key encryption |
| SQS | Async webhook delivery |
| Elastic Beanstalk | Backend API hosting (Docker) |
| ECR | Docker image registry |
| Amplify | Web frontend hosting + CI/CD |
| Bedrock | Claude 3 Sonnet LLM |
| CloudWatch | Logging |
| Lambda | Processing functions |

### Deployment

| Component | Platform | Method |
|-----------|----------|--------|
| Web | AWS Amplify | Git push → auto-build |
| Backend | Elastic Beanstalk | `deploy.sh` → Docker → ECR → EB |
| Voice Bridge | Docker/ECS | Manual (port 8082) |
| Realtime Controller | Docker/ECS | Manual (port 8081) |
| iOS | App Store | Xcode Archive |

---

## 9. Subscription Plans (Current)

| Feature | Starter ($19.99/mo) | Pro ($39.99/mo) | Max ($99.99/mo) |
|---------|---------------------|-----------------|-----------------|
| Call Minutes | 100 | 300 | 750 |
| SMS Messages | 200 | 600 | 1500 |
| Contacts | 300 | 1000 | 3000 |
| Transcripts | Basic | Full | Full |
| Call Summaries | No | Yes | Yes |
| After-Hours Routing | No | Yes | Yes |
| CRM Integrations | No | No | Yes |
| API Access | No | No | Yes |
| Trial | No | 14-day | No |

---

## 10. Recent Development Activity

Last 10 commits focus on:
1. **Booking payments** — managed/self-managed modes, recurring billing
2. **Admin subscription controls** — create, update, cancel, reactivate, Stripe sync
3. **Stripe webhook hardening** — NaN handling, timestamp fixes
4. **Stripe Connect** — error handling, readiness gating
5. **Dashboard redesign** — modern UI with consistent portal components
6. **Login/register redesign** — Google/Apple social auth UI
7. **Landing page redesign** — new hero, demo widget, industry grid
8. **iOS native auth** — Cognito PKCE, APNs push notifications

The codebase is actively maintained with a clear trajectory toward payment infrastructure maturity and UI modernization.
