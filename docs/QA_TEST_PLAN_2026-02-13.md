# HandyCall QA Test Plan

Date: 2026-02-13
Tester: Codex QA pass
Scope: Monorepo (`packages/backend`, `packages/web`, `packages/realtime-controller`, `packages/voice-bridge`)
Out of scope: Live AI call-quality evaluation (per request)

## 1. Objectives

1. Validate single-user baseline behavior across web and API routes.
2. Execute multi-user stress checks to identify latency/error hotspots.
3. Assess cybersecurity posture: auth/session, input handling, injection vectors, headers, secret management, encryption-at-rest paths.
4. Inventory API route surface and probe unauthenticated/public behavior.
5. Verify Stripe-related security controls in code and runtime behavior.
6. Produce prioritized remediation steps and re-test deltas.

## 2. Test Strategy

### Phase A: Quality gates

1. Run `npm run build`, `npm run lint`, `npm run test`.
2. Record blockers and regressions.

### Phase B: Single-user route coverage

1. Web routes: `/`, `/login`, `/dashboard`, `/admin`, `/api/auth/*`, `/api/proxy/*`.
2. Backend public routes: `/api/v1/health`, `/api/v1`, `/api/v1/contact`.
3. Protected-route behavior without session/bearer.

### Phase C: Security testing

1. Injection payload checks (SQL-like, object-style, HTML/script) on public endpoints.
2. Cookie/session checks for NextAuth flags and route protection behavior.
3. Header hardening checks (CSP, XFO, XCTO, HSTS, Referrer-Policy, Permissions-Policy).
4. CORS deny-path behavior validation.
5. Secret handling and encryption-at-rest code review.

### Phase D: API surface mapping

1. Enumerate controllers and route decorators.
2. Probe all discovered routes unauthenticated with status/latency capture.
3. Identify status anomalies and likely missing guard/public annotations.

### Phase E: Stress/performance

1. Stress web home route under concurrent load.
2. Stress protected web dashboard route under concurrent load.
3. Stress backend health and representative protected API routes.
4. Identify optimization candidates from latency/error distribution.

### Phase F: Remediation and re-test

1. Patch highest-severity security and reliability issues.
2. Re-run build/security/stress/API probe and report deltas.

## 3. Pass/Fail Criteria

1. Workspace build passes.
2. Lint and test run non-interactively.
3. No critical security findings remain.
4. No severe stress instability on core routes.
5. Route protections enforce expected auth boundaries.

## 4. Required Environment

1. Node/npm workspace installed.
2. Local backend and web startup with required env vars (`NEXTAUTH_SECRET` for production-mode NextAuth routes).
3. Optional cloud credentials for full Cognito/Stripe/Twilio/AWS integration paths.

## 5. Deliverables

1. Execution report with evidence and metrics.
2. Severity-ranked findings (resolved vs open).
3. Prioritized next remediation steps.
