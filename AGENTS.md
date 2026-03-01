# AGENTS.md

## Purpose
This file is the fast context handoff for coding agents working in this repo.

## Snapshot (2026-02-26)
- Repo: `HandyCall.ai`
- Branch: `master`
- Architecture: monorepo (`packages/backend`, `packages/web`, `packages/shared`, `apps/ios`, `packages/widget`)
- Pricing migration in progress: weekly -> monthly
- Large feature wave in progress: Stripe Connect payments, dashboard redesign, notifications, usage gating, settings wiring, differentiators
- Worktree may be intentionally dirty during implementation; do not revert unrelated local changes

## Product Context
HandyCall is a multi-tenant AI receptionist SaaS for local service businesses.
Key domains:
- telephony (calls/SMS)
- appointments/bookings
- contacts/leads
- notifications
- billing/subscriptions/usage
- CRM/webhooks
- customer payments (Stripe Connect)

## Current Implementation Focus
1. Monthly subscription pricing and limits
2. Stripe Connect onboarding + customer payments
3. Dashboard redesign to business metrics
4. Web + iOS notification UX improvements
5. Hard usage-limit enforcement for AI handling
6. Settings reliability (call modes, transfer, CRM)
7. Differentiators (follow-up sequences, review automation, widget)

## Critical Guardrails
- Multi-tenant isolation: always scope by `company_id`
- Plan-based access: gate restricted functionality by plan features
- Keep shared types/constants in sync with backend + web + iOS
- Keep pricing labels and usage periods consistent (`monthly`, not `weekly`)
- Never hardcode secrets in code or docs

## Where To Start
- Backend billing: `packages/backend/src/modules/billing/`
- Dashboard API: `packages/backend/src/modules/dashboard/`
- Notifications API: `packages/backend/src/modules/notifications/`
- Public booking/payments: `packages/backend/src/modules/public-booking/`
- Web dashboard: `packages/web/src/app/dashboard/`
- Web pricing: `packages/web/src/app/pricing/page.jsx`
- Shared domain/types: `packages/shared/src/types/domain.ts`
- Shared constants: `packages/shared/src/utils/constants.ts`

## Deployment Paths
- GitHub remote: `origin` -> `https://github.com/MohammadH3218/HandyCall.ai.git`
- Backend Docker/EB scripts:
  - `packages/backend/deploy.sh` (bash)
  - `packages/backend/deploy-docker-eb.ps1` (PowerShell)
- Prereqs:
  - Docker running
  - AWS CLI authenticated
  - ECR + Elastic Beanstalk permissions

## Recommended Agent Workflow
1. Read `docs/IMPLEMENTATION_STATUS.md`
2. Check `git status` and avoid reverting unrelated work
3. Make smallest cohesive changes per area (shared -> backend -> web/iOS)
4. Run targeted validation before push
5. Update docs when feature behavior or deployment flow changes
