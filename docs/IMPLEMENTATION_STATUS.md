# Implementation Status

Last updated: 2026-02-26

## Program Phases

1. Pricing Overhaul (Weekly -> Monthly): in progress
- Shared plan limits/features added and being propagated
- Backend usage/billing/notification period changes in progress
- Web pricing and billing/onboarding updates in progress
- iOS display updates in progress

2. Stripe Connect + Customer Payments: in progress
- Backend service/controller scaffolding present
- Web payments surfaces added (`dashboard/payments`, booking payment step)
- Billing page now supports in-place payment mode switching (`Managed in HandyCall` <-> `Self-managed`)
- Requires environment + end-to-end validation in Stripe test mode

3. Dashboard Redesign: in progress
- Backend dashboard response evolving toward business metrics
- Web dashboard UI rewrite in progress
- iOS dashboard parity in progress

4. Notifications Enhancement: in progress
- Web notifications page/components added
- Settings wiring and UX polish still required
- Polling path exists; realtime stream optional

5. Usage Limit Enforcement: in progress
- Usage gate service scaffold present
- Telephony integration and user-facing limit states need full validation

6. Settings Reliability: in progress
- CRM and call handling settings are being connected end-to-end
- Must verify mode behavior and webhook deliveries with retries

7. Differentiators: partially implemented/in progress
- Follow-up sequences module scaffold present
- Widget package present
- Review-request automation requires full completion + QA

## Release Risks To Track
- Plan feature gating inconsistencies across backend/web/iOS
- Monthly period math edge cases (timezone + subscription start)
- Stripe Connect onboarding state handling
- Telephony fallback behavior when usage is exhausted
- Dirty worktree risk during large merge/deploy operations

## Pre-Deploy Checklist
- Confirm Stripe monthly price IDs in environment
- Build shared package successfully
- Run backend and web smoke checks
- Validate migration from weekly -> monthly labels/usages
- Verify AWS credentials and target EB environment

## Suggested Verification Commands
```bash
# from repo root
npm run -w packages/shared build
npm run -w packages/backend build
npm run -w packages/web build
```

```bash
# backend deployment prerequisites
aws sts get-caller-identity
docker --version
```
