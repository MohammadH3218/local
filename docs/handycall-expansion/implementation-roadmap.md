# HandyCall.ai — Implementation Roadmap

> Phased execution plan for expanding HandyCall from AI communications SaaS to full marketplace platform.

---

## Phase Overview

```
Phase 1: AI Communications SaaS         ██████████████░░░░░░░░░░░░░░  (Fastest Revenue)
Phase 2: Pro Business OS                 ░░░░░░░░░░░░██████████░░░░░░  (Stickiness)
Phase 3: Consumer Marketplace            ░░░░░░░░░░░░░░░░░░░░████████  (Scale Acquisition)
Phase 4: Customer Portal                 ░░░░░░░░░░░░░░░░░░░░░░░░████  (Retention)
Phase 5: Advanced Automation             ░░░░░░░░░░░░░░░░░░░░░░░░░░██  (Differentiation)
```

---

## Phase 1: AI Communications SaaS

**Goal:** Ship fastest revenue — make the core AI calling + SMS product rock-solid and expand outbound capabilities.

**Duration:** 6–8 weeks

### Scope

| Work Item | Priority | Est. Effort |
|-----------|----------|------------|
| **Outbound AI calls** — appointment reminders, follow-ups | P0 | 2 weeks |
| **SMS automation engine** — templates, scheduled sends, compliance | P0 | 2 weeks |
| **Follow-up sequences** — multi-step automated outreach (SMS + call) | P1 | 1.5 weeks |
| **Usage-based add-on packs** — extra minutes/SMS purchase | P1 | 1 week |
| **Call quality dashboard** — completion rate, conversion rate, AI performance metrics | P1 | 1 week |
| **Improved call transcripts UI** — timestamps, highlights, search | P2 | 0.5 weeks |
| **Webhook reliability** — retry logic, SQS-backed delivery, monitoring | P2 | 0.5 weeks |

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Twilio outbound call API | Available | Need to wire into voice bridge |
| EventBridge for scheduling | Needs setup | Required for automated triggers |
| Follow-up sequences module | Scaffold exists | `follow-up-sequences` module in backend |
| Usage add-on pricing in Stripe | Needs setup | Create one-time price objects |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Outbound call quality issues (latency, drops) | Medium | High | Extensive testing, gradual rollout, fallback to voicemail |
| SMS compliance violations (TCPA) | Low | Critical | Strict opt-in enforcement, quiet hours, STOP handling |
| OpenAI Realtime API instability | Low | High | Voicemail fallback, retry logic, monitoring |
| Scope creep on follow-up sequences | Medium | Medium | Ship basic sequences first, iterate |

### Measurable Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Outbound calls operational | 100% of pros can trigger | Feature availability |
| SMS automation active | 50% of active pros using templates | Usage analytics |
| Follow-up conversion | 15% of followed-up leads book | Lead tracking |
| MRR growth | 25% increase from current baseline | Stripe dashboard |
| Call completion rate | > 80% | Call analytics |
| Churn reduction | < 8% monthly | Subscription metrics |

---

## Phase 2: Pro Business OS

**Goal:** Make HandyCall the daily operating system for pros — deep enough that they can't leave.

**Duration:** 8–10 weeks

### Scope

| Work Item | Priority | Est. Effort |
|-----------|----------|------------|
| **Lead inbox with scoring** — pipeline view, quality scores, follow-up actions | P0 | 2 weeks |
| **Route migration** — move `/dashboard/*` to `/pros/*`, implement redirects | P0 | 1 week |
| **Enhanced scheduling** — calendar view (day/week/month), drag-to-reschedule | P0 | 2 weeks |
| **CRM enhancement** — tags, notes, interaction timeline, lead source tracking | P1 | 1.5 weeks |
| **Team management** — invite members, role-based permissions (owner/dispatcher/tech) | P1 | 1.5 weeks |
| **Invoicing** — create, send, track invoices with payment links | P1 | 2 weeks |
| **Reporting dashboard** — call volume, conversion funnel, revenue trends | P2 | 1 week |
| **Pro onboarding rework** — 10-step flow with test mode and go-live checklist | P1 | 1.5 weeks |
| **Shared DataTable component** — extract, standardize across all list views | P2 | 0.5 weeks |

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Phase 1 complete (outbound, SMS, sequences) | Phase 1 | Required for lead follow-up integration |
| Stripe Connect fully operational | Mostly done | Invoice payment requires Connect |
| User roles in Cognito | Extend existing | Add `employee` account_type + permissions |
| Calendar UI library | Need to select | FullCalendar or build custom with date-fns |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Calendar UI complexity | High | Medium | Use proven library (FullCalendar), limit initial features |
| Team permissions complexity | Medium | Medium | Ship 3 preset roles first, custom permissions later |
| Invoice + payment flow edge cases | Medium | Medium | Extensive testing, limit to simple invoices first |
| Route migration breaks bookmarks | Low | Low | 301 redirects for 6 months |

### Measurable Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily active pro usage | 60% of subscribers login daily | Analytics |
| Lead response time | < 2 hours (median) | Lead tracking |
| Invoice adoption | 30% of pros sending invoices | Feature usage |
| Team feature adoption | 15% of Pro/Max plans add team members | User counts |
| Pro onboarding completion | > 70% complete all steps | Funnel analytics |
| NPS (pro users) | > 40 | Survey |

---

## Phase 3: Consumer Marketplace

**Goal:** Build the consumer-facing marketplace to drive organic customer acquisition for pros.

**Duration:** 10–12 weeks

### Scope

| Work Item | Priority | Est. Effort |
|-----------|----------|------------|
| **Customer account system** — signup, login, profile, Cognito extension | P0 | 2 weeks |
| **Provider search & discovery** — OpenSearch setup, search API, filter/sort | P0 | 3 weeks |
| **Public provider profiles** — slug-based URLs, services, reviews, availability | P0 | 2 weeks |
| **Review system** — post-booking reviews, star ratings, pro responses | P0 | 2 weeks |
| **Consumer landing page rework** — Thumbtack-inspired hero, search bar, categories | P0 | 1.5 weeks |
| **Category landing pages** — SEO pages per service type | P1 | 1 week |
| **Quote request system** — customer describes job, matched pros respond | P1 | 2 weeks |
| **Consumer navigation split** — separate consumer/pro nav, "For Pros" link | P0 | 0.5 weeks |
| **Audience-aware auth** — "I'm a Customer" / "I'm a Pro" at signup | P0 | 0.5 weeks |
| **Pro pricing page migration** — move from `/pricing` to `/pros/pricing` | P0 | 0.5 days |
| **SEO setup** — sitemap, structured data, meta tags, OG images | P1 | 1 week |

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Phase 2 complete | Phase 2 | Provider profiles need operational pros |
| OpenSearch cluster | Needs provisioning | Infrastructure setup + index design |
| DynamoDB Streams → Lambda | Needs setup | For search index sync |
| Customer Stripe accounts | Needs setup | For marketplace payments |
| Review moderation workflow | New | Admin panel addition |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| OpenSearch operational complexity | Medium | High | Use managed service, start with 2-node cluster |
| Low initial provider supply | High | Critical | Seed with existing pro customers, outbound sales |
| Fake reviews | Medium | High | Require completed booking, admin moderation, fraud detection |
| SEO takes months to rank | High | Medium | Supplement with paid acquisition, social marketing |
| Customer acquisition cost | High | Medium | Organic SEO + word-of-mouth first, measure CAC carefully |

### Measurable Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Customer signups | 1,000 in first 3 months | Registration analytics |
| Provider search volume | 5,000 searches/month | Search analytics |
| Booking through marketplace | 200 bookings/month | Booking source tracking |
| Provider profile views | 10,000/month | Page analytics |
| Average provider rating | > 4.2 stars | Review aggregation |
| Organic search traffic | 20% of total traffic by month 3 | Google Analytics |

---

## Phase 4: Customer Portal

**Goal:** Build a unified customer experience that drives retention, repeat bookings, and subscription services.

**Duration:** 6–8 weeks

### Scope

| Work Item | Priority | Est. Effort |
|-----------|----------|------------|
| **Customer portal layout** — tab nav, bookings, messages, payments, settings | P0 | 1.5 weeks |
| **Booking management** — view, reschedule, cancel upcoming/past bookings | P0 | 1.5 weeks |
| **In-app messaging** — customer ↔ pro message threads, booking context | P0 | 2 weeks |
| **Payment history & receipts** — invoices, receipts, download PDFs | P1 | 1 week |
| **Customer subscriptions** — view, pause, cancel recurring services | P1 | 1.5 weeks |
| **Notification center** — booking reminders, payment alerts, pro messages | P1 | 1 week |
| **Customer-facing AI assistant** — chatbot for support, booking help | P2 | 2 weeks |
| **Saved addresses** — manage multiple service locations | P2 | 0.5 weeks |
| **Rebooking flow** — "Book Again" from past appointments | P2 | 0.5 weeks |

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Phase 3 complete (customer accounts, search, reviews) | Phase 3 | Customer auth + profiles required |
| In-app messaging table + API | Phase 4 scope | New Messages tables |
| Customer AI assistant model | Phase 4 scope | Claude via Bedrock |
| PDF generation library | Need to select | For receipt/invoice downloads |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Messaging at scale (WebSocket infra) | Medium | Medium | Start with polling (30s), add WebSocket in Phase 5 |
| Customer AI hallucinations | Medium | High | Strict tool-based responses, no free-form answers for payments |
| Low customer engagement | Medium | Medium | Notification strategy, email drip campaigns, push notifications |

### Measurable Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Customer portal DAU | 30% of registered customers | Analytics |
| Repeat booking rate | 25% of customers book again within 60 days | Booking analytics |
| Message response rate | > 80% of customer messages answered within 4h | Messaging analytics |
| Subscription sign-up rate | 10% of one-time customers convert to recurring | Subscription analytics |
| Customer NPS | > 50 | Survey |
| Customer retention (90-day) | > 60% | Cohort analysis |

---

## Phase 5: Advanced Automation & Intelligence

**Goal:** Build deep intelligence and automation that separates HandyCall from competitors.

**Duration:** Ongoing (12+ weeks)

### Scope

| Work Item | Priority | Est. Effort |
|-----------|----------|------------|
| **Predictive lead scoring** — ML-based conversion prediction | P1 | 3 weeks |
| **Smart scheduling** — AI suggests optimal time slots based on travel, jobs, history | P1 | 2 weeks |
| **Automated upsell/cross-sell** — AI recommends additional services during calls | P2 | 2 weeks |
| **Predictive maintenance reminders** — "Your HVAC was serviced 11 months ago" | P2 | 2 weeks |
| **WhatsApp Business integration** | P2 | 3 weeks |
| **Real-time messaging (WebSocket)** | P1 | 2 weeks |
| **Multi-language support** — Spanish AI voice + knowledge base | P2 | 3 weeks |
| **API for third-party integrations** — public API for CRM/ERP systems | P2 | 3 weeks |
| **White-label option** — remove HandyCall branding for enterprise pros | P3 | 2 weeks |
| **Mobile app for customers** — iOS/Android customer app | P3 | 8 weeks |
| **Advanced analytics** — cohort analysis, LTV prediction, churn risk | P2 | 3 weeks |
| **Franchise/multi-location support** — one owner, multiple locations | P3 | 4 weeks |

### Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| All previous phases | Phase 1–4 | Foundation must be solid |
| ML infrastructure | Needs setup | SageMaker or Bedrock custom models |
| WhatsApp Business account | Needs approval | Meta verification process |
| Public API design | Phase 5 scope | API-first, versioned, documented |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| ML model accuracy | Medium | Medium | Start with rule-based, add ML incrementally |
| WhatsApp approval delays | High | Low | Not critical, SMS suffices |
| API abuse | Medium | Medium | Rate limiting, API keys, usage tiers |
| Mobile app maintenance burden | High | Medium | React Native for cross-platform, shared API |

### Measurable Goals

| Metric | Target | Measurement |
|--------|--------|-------------|
| Predictive scoring accuracy | > 75% precision on "hot leads" | A/B test vs baseline |
| Automated upsell revenue | 10% increase in average booking value | Revenue analytics |
| WhatsApp adoption | 20% of messaging volume | Channel analytics |
| API developer adoption | 50+ active API integrations | API analytics |
| Platform GMV | $1M+ monthly gross merchandise value | Payment analytics |

---

## Cross-Phase: Infrastructure & DevOps

These items run continuously across all phases:

| Work Item | Phase | Priority |
|-----------|-------|----------|
| **Monitoring & alerting** — CloudWatch dashboards, error alerting, uptime monitoring | All | P0 |
| **CI/CD pipeline hardening** — automated tests, staging environment, deploy previews | 1–2 | P1 |
| **Database backup & recovery** — DynamoDB point-in-time recovery, S3 versioning | 1 | P0 |
| **Load testing** — stress test API, voice bridge, search under load | 2–3 | P1 |
| **Security audit** — penetration testing, dependency scanning, OWASP review | 2 | P1 |
| **Cost optimization** — reserved capacity, spot instances, DynamoDB provisioned vs on-demand | 3+ | P2 |
| **Documentation** — API docs, developer guide, runbooks | All | P2 |
| **Staging environment** — full staging with test data, Stripe test mode | 1 | P1 |

---

## Timeline Summary

```
Month 1-2:   Phase 1 — AI Communications (outbound, SMS, sequences)
Month 3-4:   Phase 2 — Pro Business OS (leads, schedule, CRM, invoices, teams)
Month 5-7:   Phase 3 — Marketplace (search, profiles, reviews, customer accounts)
Month 8-9:   Phase 4 — Customer Portal (bookings, messaging, payments, subscriptions)
Month 10+:   Phase 5 — Advanced (ML, WhatsApp, API, mobile, multi-language)
```

---

## Resource Requirements

### Engineering

| Phase | Frontend | Backend | DevOps/Infra |
|-------|----------|---------|-------------|
| Phase 1 | 0.5 FTE | 1.5 FTE | 0.5 FTE |
| Phase 2 | 1 FTE | 1 FTE | 0.25 FTE |
| Phase 3 | 1.5 FTE | 1.5 FTE | 0.5 FTE |
| Phase 4 | 1 FTE | 1 FTE | 0.25 FTE |
| Phase 5 | 1 FTE | 1.5 FTE | 0.5 FTE |

### Design

| Phase | UI/UX Design | Content/Copy |
|-------|-------------|-------------|
| Phase 1 | 0.25 FTE | — |
| Phase 2 | 0.5 FTE | — |
| Phase 3 | 1 FTE | 0.5 FTE |
| Phase 4 | 0.5 FTE | 0.25 FTE |
| Phase 5 | 0.5 FTE | 0.25 FTE |

---

## Decision Log

Decisions that should be made before or during each phase:

| Decision | Phase | Options | Recommendation |
|----------|-------|---------|---------------|
| Search technology | Phase 3 | OpenSearch vs Algolia vs Typesense | OpenSearch (AWS-native, geo support) |
| Calendar UI library | Phase 2 | FullCalendar vs custom | FullCalendar (proven, rich features) |
| Data fetching library | Phase 2 | React Query vs SWR | React Query (more features, mutation support) |
| Form library | Phase 2 | React Hook Form + Zod vs Formik | React Hook Form + Zod (lighter, better DX) |
| PDF generation | Phase 4 | Puppeteer vs React-PDF vs external service | React-PDF (client-side, no server overhead) |
| Real-time messaging | Phase 4→5 | Polling → WebSocket | Polling first (simpler), WebSocket in Phase 5 |
| Mobile app framework | Phase 5 | React Native (existing iOS) vs Flutter | React Native (extend existing iOS app) |
| ML infrastructure | Phase 5 | SageMaker vs Bedrock fine-tuning vs external | Bedrock first (simpler), SageMaker if needed |
