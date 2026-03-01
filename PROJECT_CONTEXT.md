# PROJECT_CONTEXT.md

**SINGLE SOURCE OF TRUTH FOR HANDYCALL PLATFORM**

> **Purpose**: This document serves as the central reference for all architectural decisions, implementation status, and project context. Paste this file into any future conversation to restore full project context without re-initialization.

**Last Updated**: 2025-12-26
**Version**: 0.1.0
**Status**: MVP Development - Section 2 Complete (Database Schema)

---

## 🎯 PROJECT OVERVIEW

### Vision
HandyCall is a **production-grade, multi-tenant AI Receptionist platform** for local service businesses (handyman, pest control, electricians, etc.). It provides automated inbound call/text handling, RAG-based knowledge retrieval, lead capture, and appointment scheduling.

### Key Principles
- **Production-ready**, not a demo
- **Multi-tenant** with strict data isolation
- **Non-tech-savvy user focus** - designed for field workers
- **Clean, professional UX** (NO tacky AI visuals)
- **AWS-native** infrastructure

---

## 🏗️ ARCHITECTURE DECISIONS

### Tech Stack (Locked In)

#### Frontend
- **Web Dashboard**: Next.js 14+ (TypeScript, App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Mobile**: React Native with Expo
- **Hosting**: AWS Amplify (web), Expo Application Services (mobile)

#### Backend
- **Framework**: NestJS (TypeScript) ✅ **CHOSEN**
  - Rationale: Full TypeScript stack, better AWS SDK v3 integration, type safety across monorepo
- **Runtime**: Node.js 18+
- **API Pattern**: REST with standard ApiResponse wrapper

#### Database
- **Primary**: AWS DynamoDB (NO Postgres, NO RDS)
- **Rationale**: Serverless, scales per-tenant, AWS-native, cost-effective for multi-tenant SaaS

#### Storage
- **Call Recordings**: Amazon S3 (`handycall-recordings-{env}`)
- **Transcripts**: Amazon S3 (`handycall-transcripts-{env}`)
- **Retention**: 90 days default

#### AI/RAG
- **LLM**: AWS Bedrock (Claude 3 Sonnet)
- **Embeddings**: Amazon Titan Embed Text v1
- **RAG Pattern**: Company-scoped retrieval from DynamoDB + vector search
- **NO MODEL TRAINING**: One shared LLM + per-company agent config

#### Authentication
- **Current MVP**: JWT-based (access + refresh tokens)
- **Future**: AWS Cognito integration planned

---

## 📁 MONOREPO STRUCTURE

```
HandyCall/
├── packages/
│   ├── backend/              # NestJS API (port 3000)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── database/   # DynamoDB client
│   │   │   │   └── storage/    # S3 client
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── companies/
│   │   │   │   ├── users/
│   │   │   │   ├── contacts/
│   │   │   │   ├── calls/
│   │   │   │   ├── appointments/
│   │   │   │   ├── knowledge/
│   │   │   │   ├── flagged-questions/
│   │   │   │   ├── agent-config/
│   │   │   │   ├── pricing-rules/
│   │   │   │   ├── telephony/  # Mock provider
│   │   │   │   ├── rag/        # RAG service
│   │   │   │   └── dashboard/
│   │   │   └── common/
│   │   │       ├── decorators/
│   │   │       ├── guards/
│   │   │       ├── filters/
│   │   │       └── interceptors/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                  # Next.js dashboard (TBD)
│   ├── mobile/               # React Native app (TBD)
│   │
│   └── shared/               # Shared TypeScript types ✅
│       ├── src/
│       │   ├── types/
│       │   │   ├── domain.ts      # Core entities
│       │   │   ├── api.ts         # API contracts
│       │   │   ├── auth.ts        # Auth types
│       │   │   ├── telephony.ts   # Provider interface
│       │   │   └── rag.ts         # RAG types
│       │   └── utils/
│       │       ├── constants.ts
│       │       └── validation.ts
│       └── package.json
│
├── docs/                     # Additional documentation
├── scripts/                  # Deployment & utility scripts
├── PROJECT_CONTEXT.md        # This file ✅
├── DB_SCHEMA.md             # DynamoDB design (TBD)
├── API_REFERENCE.md         # API docs (TBD)
├── RUNBOOK.md               # AWS setup guide (TBD)
├── package.json             # Root workspace config ✅
└── tsconfig.json            # Root TypeScript config ✅
```

---

## 🗄️ DATABASE SCHEMA OVERVIEW

**Table Prefix**: `handycall_{env}_`

### Core Tables (Planned)
1. **Companies** - Tenant records
2. **Users** - Company users (owners, staff)
3. **Contacts** - Lead/contact records
4. **Calls** - Call records with metadata
5. **CallHighlights** - Timestamped moments (pricing, complaints, etc.)
6. **Appointments** - Scheduled appointments
7. **KnowledgeItems** - RAG knowledge base (company-scoped)
8. **KnowledgeChunks** - Embeddings for vector search
9. **FlaggedQuestions** - Unanswered questions for learning loop
10. **AgentConfigs** - Per-company AI agent settings
11. **PricingRules** - Structured pricing (NOT LLM-based)
12. **SMS** - Inbound/outbound text messages

**All tables include `company_id` for tenant isolation.**
**Access patterns documented in DB_SCHEMA.md** (to be created).

---

## 🔐 MULTI-TENANCY & SECURITY

### Data Isolation Strategy
- **Every record** has `company_id` as partition key or attribute
- **All queries** filtered by `company_id` at service layer
- **RAG retrieval** NEVER crosses tenant boundaries
- **JWT tokens** include `company_id` in payload

### Authentication Flow
1. User logs in → receives JWT (access + refresh)
2. Every API request includes `Authorization: Bearer {token}`
3. JwtStrategy validates token → extracts AuthContext
4. Guards enforce authentication + role-based access

### Guards & Decorators
- `@Public()` - Skip authentication
- `@Auth()` - Extract full AuthContext
- `@CompanyId()` - Extract company_id from token
- `@UserId()` - Extract user_id from token
- `@Roles(UserRole.OWNER)` - Require specific roles

---

## 🤖 RAG ARCHITECTURE

### Principles
- **One shared LLM** (Bedrock Claude 3 Sonnet)
- **Per-company agent configuration** + knowledge base
- **Retrieval is ALWAYS scoped by company_id**
- **Never guess** chemicals, safety, warranty, or pricing

### Knowledge Flow
1. **Owner creates** knowledge items (FAQ, services, policies)
2. **System chunks** text + generates embeddings
3. **On call**, RAG retrieves relevant chunks (company-scoped)
4. **LLM generates** response using retrieved context
5. **If confidence < threshold** → flag question

### Flagged Question Learning Loop
1. AI encounters low-confidence question
2. Create `FlaggedQuestion` record with call context
3. Owner views question + plays back call moment
4. Owner submits official answer (text or voice)
5. System creates `KnowledgeItem` + chunks automatically
6. Next call retrieves new knowledge

---

## 📞 TELEPHONY APPROACH (MVP)

### Mock Provider Pattern
- **NO real telephony integration yet** (Twilio/Connect planned)
- **Interface defined**: `TelephonyProvider` in `@handycall/shared`
- **Mock implementation** simulates:
  - Inbound calls
  - Inbound SMS
  - Call recordings
  - Transcripts

### Future Providers
- Twilio (documented in RUNBOOK.md)
- Amazon Connect (documented in RUNBOOK.md)
- OpenAI Realtime SIP (target path for “ChatGPT-style” speech-to-speech) via `packages/realtime-controller` + Tools API endpoints in `packages/backend`

---

## 🎨 UI/UX DESIGN RULES

### 2026 Style Baseline (Current)
- Primary visual language: **white + slate neutrals**
- Accent usage: **emerald only for key CTAs/active states** (not page backgrounds)
- Icons: prefer **Tabler Icons** with consistent stroke weight
- Surfaces: flat cards with subtle borders (`border-slate-200`), minimal shadows
- Marketing and app pages should match the landing page style direction

### ❌ FORBIDDEN
- Robot icons / AI mascots
- Emoji-heavy UI
- "Chatbot" aesthetics
- Tacky gradients
- Full-width solid emerald sections for generic content blocks
- Glow/blur background effects used as decoration
- Overly technical jargon

### ✅ REQUIRED
- Clean, professional SaaS look
- Calm color palette (whites, slates, neutral grays)
- **Trades-friendly**: big buttons, minimal text, clear CTAs
- Mobile-first design patterns
- Subtle animations (Framer Motion allowed)
- Accessibility (WCAG 2.1 AA minimum)
- **Account/settings forms**: avoid always-editable text fields; require an explicit **Edit** action to enable changes

### Dashboard Home (Owner View)
- Today's schedule
- New leads count
- Missed calls
- Urgent items (flagged questions, complaints)
- Quick actions

**All interactions must be completable in under 10 seconds.**

---

## 🚀 MVP SCOPE

### Phase 1: Infrastructure Setup ✅ COMPLETE
- [x] Monorepo structure
- [x] Backend (NestJS) with modules
- [x] Shared types package
- [x] DynamoDB service abstraction
- [x] S3 service abstraction
- [x] Auth guards and decorators
- [ ] Web dashboard (Next.js)
- [ ] Mobile app (React Native)

### Phase 2: Database Schema ✅ COMPLETE
- [x] DB_SCHEMA.md documentation
- [x] 12 table designs with PK/SK strategies
- [x] GSI definitions for all access patterns
- [x] DynamoDB table creation scripts (AWS CLI)
- [x] Seed data scripts
- [x] Table listing and deletion utilities

### Phase 3: API Implementation (NEXT)
- [ ] Auth endpoints (login, register, refresh)
- [ ] Companies endpoints
- [ ] Contacts/Leads endpoints
- [ ] Calls endpoints
- [ ] Appointments endpoints
- [ ] Knowledge endpoints
- [ ] Flagged questions endpoints
- [ ] Dashboard stats endpoint

### Phase 3: RAG Implementation
- [ ] Embedding service (Bedrock Titan)
- [ ] Vector search implementation
- [ ] RAG query service
- [ ] Agent execution service
- [ ] Knowledge chunking

### Phase 4: Core UI
- [ ] Login/register screens
- [ ] Dashboard home
- [ ] Calls list + replay
- [ ] Flagged questions queue
- [ ] Knowledge base management

### Phase 5: Learning Loop
- [ ] Flagged question creation
- [ ] Owner answer submission
- [ ] Automatic KB update
- [ ] Call highlight extraction

### Phase 6: Mock Telephony
- [ ] Mock provider implementation
- [ ] Simulated call flow
- [ ] Test scenarios

---

## 📝 IMPLEMENTATION STATUS

### Completed (Sections 1-2)
✅ Root monorepo structure
✅ Shared types (`@handycall/shared`)
✅ Backend foundation (NestJS)
✅ Infrastructure layer (DynamoDB, S3)
✅ Auth strategy (JWT with Passport)
✅ Module scaffolding (auth, companies, calls, etc.)
✅ Common utilities (guards, decorators, filters)
✅ PROJECT_CONTEXT.md (this file)
✅ DB_SCHEMA.md with 12 table designs
✅ DynamoDB creation scripts (AWS CLI)
✅ Seed data scripts

### In Progress
🔄 API endpoint implementation

### Not Started
⏳ Web dashboard
⏳ Mobile app
⏳ RAG service
⏳ Mock telephony provider
⏳ Frontend UI implementation

---

## 🛠️ DEVELOPMENT COMMANDS

```bash
# Root level
npm install              # Install all dependencies
npm run dev              # Run all services
npm run build            # Build all packages

# Individual packages
npm run backend:dev      # Start API server
npm run web:dev          # Start web dashboard
npm run mobile:dev       # Start mobile app
npm run shared:build     # Build shared types
```

---

## 🌍 ENVIRONMENT VARIABLES

### Backend (.env)
```
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

JWT_SECRET=your-secret
JWT_EXPIRES_IN=3600

AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=http://localhost:8000  # For local dev
DYNAMODB_TABLE_PREFIX=handycall_dev_

S3_BUCKET_RECORDINGS=handycall-recordings-dev
S3_BUCKET_TRANSCRIPTS=handycall-transcripts-dev

# Webhook delivery (optional)
WEBHOOK_SQS_URL=
WEBHOOK_KMS_KEY_ID=
WEBHOOK_TIMEOUT_MS=6000

# Email (optional)
NO_REPLY_EMAIL=no-reply@handycall.org
RESET_TOKEN_TTL_MINUTES=5

BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v1

TELEPHONY_PROVIDER=mock
```

---

## 📚 FUTURE WORK (POST-MVP)

### Authentication
- AWS Cognito integration
- SSO support (Google, Microsoft)
- MFA

### Telephony
- Twilio integration
- Amazon Connect integration
- Real-time call transcription

### Advanced Features
- Calendar integration (Google Calendar, Outlook)
- SMS campaigns
- Analytics dashboard
- Webhook system
- Public API

### Scalability
- DynamoDB auto-scaling policies
- CloudFront CDN
- Multi-region support

---

## 🔗 RELATED DOCUMENTATION

- [DB_SCHEMA.md](./DB_SCHEMA.md) - DynamoDB table designs (to be created)
- [API_REFERENCE.md](./API_REFERENCE.md) - API endpoint documentation (to be created)
- [RUNBOOK.md](./RUNBOOK.md) - AWS setup and deployment (to be created)

---

## 📌 NOTES FOR FUTURE SESSIONS

### When resuming this project:
1. **Read this file first** to restore context
2. Check "IMPLEMENTATION STATUS" to see what's done
3. Review "MVP SCOPE" to see current phase
4. Check DB_SCHEMA.md for latest table designs
5. Reference API_REFERENCE.md for endpoint contracts

### Key Conventions:
- All timestamps in **milliseconds** (Unix epoch)
- Phone numbers in **E.164 format** (+1234567890)
- All API responses use **ApiResponse wrapper**
- All queries **scoped by company_id**
- TypeScript **strict mode** enabled

---

**End of PROJECT_CONTEXT.md**
