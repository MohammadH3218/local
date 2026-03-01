# Local Migration and AWS Teardown Report (2026-03-01)

This document records the migration of HandyCall development from AWS-managed runtime infrastructure to local-first development, while keeping AWS Cognito auth and WorkMail as requested.

## Scope and Constraints

- Goal: reduce AWS spend and move development workflow to local.
- Keep: AWS Cognito (authentication) and WorkMail resources.
- Decommission: project AWS runtime resources not required for local dev.
- Deliver: working local stack scripts/config + teardown evidence.

## Code and Configuration Changes

### 1) Local infrastructure and scripts

- Added `docker-compose.local.yml` with `dynamodb-local` service.
- Added local scripts:
  - `scripts/local/start-local-dev.sh`
  - `scripts/local/bootstrap-localstack.sh` (repurposed to bootstrap local DynamoDB)
  - `scripts/local/stop-local-dev.sh`
- Added root npm scripts in `package.json`:
  - `local:start`
  - `local:bootstrap`
  - `local:stop`

### 2) Backend local-mode support

- Updated `packages/backend/src/infrastructure/storage/s3.service.ts`:
  - Added `STORAGE_PROVIDER=local` mode.
  - Added local filesystem storage support using `LOCAL_STORAGE_DIR`.
  - Kept S3 path for non-local environments.
- Updated `packages/backend/src/infrastructure/config/parameter-store.service.ts`:
  - Added optional endpoint-based client config support for local development compatibility.
- Updated `packages/backend/src/modules/webhooks/webhooks.service.ts`:
  - Added optional endpoint-based configuration for local-compatible client wiring.
- Updated `packages/backend/src/modules/calendar-integration/calendar-integration.service.ts`:
  - Added optional endpoint support for local-compatible encryption client wiring.
- Updated `packages/backend/src/modules/public-booking/email.util.ts`:
  - Added console email mode for local dev:
    - `EMAIL_PROVIDER=console` or `DISABLE_EMAIL_DELIVERY=true`

### 3) Local environment template and docs

- Added `packages/backend/.env.local.example` with:
  - Local DynamoDB endpoint values.
  - Local storage configuration.
  - Console email toggles.
  - Cognito placeholders retained for AWS auth.
- Updated `docs/LOCAL_DEV_SETUP.md` with local start/stop/bootstrap workflow and known fallback guidance.

## Local Validation Performed

### Tooling

- Supabase CLI installed and verified (`supabase 2.75.0`).

### Infra bootstrap checks

- `npm run local:start` validated with `SKIP_SUPABASE_START=true`.
- Local DynamoDB container starts successfully.
- Bootstrap script creates all `handycall_dev_*` tables against local endpoint.
- Seed script populates local DynamoDB test data successfully.

### Notes

- Supabase Docker startup was intermittently blocked by image pull EOF/hang in this environment.
- A fallback path was documented and supported for continued local backend development while Supabase image pull is unstable.

## AWS Teardown Actions Completed (us-east-1)

All HandyCall runtime resources found for this project were removed, except Cognito and WorkMail.

### Removed

- Amplify app:
  - `d3rf5jbk1jklag` (`HandyCall.ai`)
- Elastic Beanstalk:
  - Environments terminated:
    - `handycall-voice-bridge-alb`
    - `handycall-api-lb`
  - Applications deleted:
    - `handycall-voice-bridge`
    - `handycall-api`
- ECR repositories:
  - `handycall-voice-bridge`
  - `handycall-calcom`
  - `handycall-backend`
  - `handycall-stream-processor`
- S3 buckets:
  - `handycall-api-deployments`
  - `handycall-recordings-prod`
  - `handycall-transcripts-prod`
- DynamoDB tables:
  - all AWS tables matching `handycall_*`
- Lambda functions:
  - `handycall-webhook-delivery-prod`
  - `handycall-webhook-delivery-dev`
- SQS queues:
  - HandyCall webhook queues and DLQs (dev/prod)
- EventBridge:
  - `handycall-warm-call-orchestrator` rule (targets removed first)
- Kinesis Video Streams:
  - HandyCall media-connect streams
- CloudWatch Logs:
  - HandyCall-related log groups
- SSM Parameter Store:
  - HandyCall-related parameters (`handycall-*`, `/handycall/*`)

### Preserved (explicitly)

- Cognito user pools (kept active).
- WorkMail organization and message flow resources (kept active).

## New Repository for Local Development

- Created GitHub repository:
  - `https://github.com/MohammadH3218/local`
- Intended usage:
  - `master` in `HandyCall.ai` remains production/AWS-oriented.
  - `local` repo is used for local-development stream.

## Remaining Considerations

- Before production return, re-introduce cloud resources via IaC (recommended) instead of manual console setup.
- Add an automated local smoke test command that validates API boot, DB connectivity, and one end-to-end booking flow in local mode.
- Keep Cognito/WorkMail credentials isolated and never committed.
