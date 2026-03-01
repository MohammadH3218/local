# HandyCall QA Execution Report

Date: 2026-02-13
Tester: Codex QA pass
Plan reference: `docs/QA_TEST_PLAN_2026-02-13.md`

## 1. Executive Summary

Overall result: FAIL (improved, but not production-ready yet).

What improved in this remediation cycle:
1. Workspace builds now pass.
2. Previous backend/realtime compile blockers are fixed.
3. High-risk auth/session/security issues were reduced (no hardcoded NextAuth secret fallback, no token persistence in `localStorage`, security headers added, contact HTML escaping added, CORS deny path no longer returns `500`, calendar credentials now support KMS encryption-at-rest).
4. Automated API surface probe was added and executed against all discovered controller routes.

Remaining release blockers:
1. `npm run lint` is still non-CI-safe (missing backend ESLint config and interactive Next lint setup prompt).
2. `npm run test` still fails (no backend tests).
3. Dependency vulnerabilities remain high (`37` high severity in audit output).
4. Homepage stress still shows timeout behavior under heavier concurrency.

## 2. Remediation Implemented

### Build/reliability fixes

1. `packages/backend/src/modules/auth/strategies/jwt.strategy.ts`
1. Typed `catch` variable to satisfy strict TS.
2. `packages/backend/src/modules/webhooks/webhooks.service.ts`
1. Typed `catch` variable to satisfy strict TS.
3. `packages/realtime-controller/src/index.ts`
1. Fixed malformed multiline string and newline join logic.

### Security hardening

1. `packages/web/src/lib/auth-config.ts`
1. Removed static NextAuth secret fallback.
2. Removed noisy token/session debug logs.
2. `packages/web/src/middleware.ts`
1. Removed static secret fallback in middleware token parsing.
3. `packages/web/src/stores/auth-store.ts`
1. Removed auth-token writes to `localStorage`.
2. Removed sensitive auth debug logs.
4. `packages/web/src/app/admin/*.tsx` and `packages/web/src/components/admin/*.tsx`
1. Removed direct bearer-token fallback calls from `localStorage`; enforced cookie/session proxy path.
5. `packages/backend/src/app.controller.ts`
1. Added HTML escaping for contact form values before email template interpolation.
6. `packages/backend/src/main.ts`
1. Added baseline security headers.
2. Changed blocked CORS origin callback behavior to deny without throwing server error.
7. `packages/web/next.config.js`
1. Added app-wide security headers including CSP/XFO/XCTO/Referrer/Permissions and conditional HSTS.
8. `packages/backend/src/modules/calendar-integration/calendar-integration.service.ts`
1. Added optional KMS encryption/decryption helpers.
2. Added encrypted storage path for `access_token`, `refresh_token`, and `app_specific_password` in calendar connection records.

### QA automation added

1. `scripts/qa/api-surface-probe.mjs`
1. Discovers backend controller routes.
2. Probes each route unauthenticated and captures status/latency matrix.
2. `package.json`
1. Added `qa:api-probe`, `qa:stress:web`, and `qa:stress:api` scripts.

## 3. Re-Test Results (Post-Remediation)

### Quality gates

1. `npm run build` -> PASS (all workspaces built).
2. `npm run lint` -> FAIL.
1. Backend ESLint config missing.
2. Web lint prompts interactively for setup.
3. `npm run test` -> FAIL (`No tests found` in backend).

### Single-user checks

1. Web:
1. `/` -> `200`
2. `/login` -> `200`
3. `/dashboard` -> `307` to `/login?callbackUrl=%2Fdashboard`
2. NextAuth cookie check (`/api/auth/csrf`, with `NEXTAUTH_SECRET` set for runtime validation):
1. `Set-Cookie` observed with `HttpOnly; Secure; SameSite=Lax`.
3. Backend:
1. `/api/v1/health` -> `200`
2. `POST /api/v1/contact` malicious/script payload -> `201` (request accepted; HTML escaping now applied in server-rendered email body code path)
3. `POST /api/v1/contact` invalid email -> `400`

### Security/header checks

1. Backend `/api/v1/health` now returns:
1. `X-Content-Type-Options: nosniff`
2. `X-Frame-Options: DENY`
3. `Referrer-Policy: strict-origin-when-cross-origin`
4. `Permissions-Policy: camera=(), microphone=(), geolocation=()`
2. Web `/` now returns CSP/XFO/XCTO headers (via Next headers config).
3. Blocked-origin CORS preflight no longer returns `500` (observed `404` on denied preflight request path).

### API surface probe

Command:
`node scripts/qa/api-surface-probe.mjs --base-url http://localhost:3000 --api-prefix /api/v1 --out .tmp/api-surface-probe.json`

Results:
1. Discovered routes: `141`
2. Status distribution:
1. `200`: `4`
2. `400`: `11`
3. `401`: `117`
4. `404`: `1`
5. `500`: `8`
3. `500` routes observed were mainly callback/public-booking tokenized paths hit with synthetic path placeholders (expected for missing/invalid token context), not global app crash behavior.

### Stress tests (multi-user)

1. Web home: `npx autocannon -c 50 -d 20 -p 10 http://localhost:3001/`
1. Avg latency: `1666ms`
2. Avg req/sec: `245.65`
3. Timeouts: `70`
2. Web protected dashboard: `npx autocannon -c 60 -d 20 -p 10 http://localhost:3001/dashboard`
1. Avg latency: `279ms`
2. Avg req/sec: `2131`
3. Non-2xx expected due auth redirect path.
3. API health: `npx autocannon -c 100 -d 20 -p 10 http://localhost:3000/api/v1/health`
1. Avg latency: `52.79ms`
2. Avg req/sec: `18,747.8`
4. API protected dashboard stats: `npx autocannon -c 80 -d 20 -p 10 http://localhost:3000/api/v1/dashboard/stats`
1. Avg latency: `112ms`
2. Avg req/sec: `7086.6`
3. Non-2xx expected without auth token.

### Dependency audit

1. `npm audit` vulnerabilities:
1. Total: `51`
2. High: `37`
3. Moderate: `2`
4. Low: `12`

## 4. Current Findings (Open)

## High

1. Dependency vulnerability backlog remains high (`37` high).
2. CI quality gates remain incomplete (lint/test non-passing).

## Medium

1. Home page still degrades under higher concurrent load (timeouts).
2. API probe found context-dependent `500` responses on callback/public-booking tokenized paths when hit with placeholder IDs.
3. Calendar credential encryption is optional and depends on KMS env configuration (`CALENDAR_KMS_KEY_ID` or fallback key env); enforce in production config.

## Low

1. Multiple verbose operational logs remain in some backend modules and should be reviewed for production minimization.
2. UI maintainability still has large page/component files and inconsistent composition patterns.

## 5. Resolved From Prior Report

1. Backend/realtime compile blockers resolved.
2. Static NextAuth secret fallback removed.
3. LocalStorage token persistence removed.
4. Contact HTML interpolation now escaped server-side.
5. Missing web/API security headers addressed.
6. CORS blocked-origin `500` behavior removed.
7. Calendar sensitive fields now have encrypted storage path.
8. API surface probe automation added and executed.

## 6. Recommended Next Actions

1. Add non-interactive ESLint configs for backend and web, then enforce lint in CI.
2. Add baseline backend unit/integration tests and set `--passWithNoTests` policy explicitly if intentional.
3. Triage and patch `npm audit` high vulnerabilities by package and exploitability.
4. Optimize homepage rendering/data loading path (reduce SSR/JS weight and expensive runtime work).
5. Enforce KMS key presence in production for calendar credential writes and run one-time migration for existing plaintext calendar secrets.
