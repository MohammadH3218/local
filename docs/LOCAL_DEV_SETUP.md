# Local Development Setup (Cognito Kept in AWS)

This setup keeps **AWS Cognito** for auth, and moves runtime dependencies to free/local services.

## Service Mapping

- Auth: AWS Cognito (kept)
- Database: DynamoDB Local (Docker)
- Object storage: local filesystem (`STORAGE_PROVIDER=local`)
- Email: local console mode (no external email cost during development)
- Webhook queue + KMS encryption: disabled locally by default (synchronous delivery)
- Optional relational stack: Supabase local (Docker)
- App hosting: local `npm run backend:dev` + `npm run web:dev` (no Amplify/EB)

## Prerequisites

- Docker + Docker Compose
- Node.js + npm
- AWS CLI
- Supabase CLI
- `jq`, `curl`

## One-Time Setup

1. Start local infra:
```bash
npm run local:start
```
This starts a minimal Supabase profile (Postgres container only) to reduce pull/startup time.
If your network fails while pulling Supabase images, run:
```bash
SKIP_SUPABASE_START=true npm run local:start
```
This still boots DynamoDB local + app services.

2. Create backend local env:
```bash
cp packages/backend/.env.local.example packages/backend/.env.local
```

3. In `packages/backend/.env.local`, set your real Cognito values:
- `AWS_COGNITO_*`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (if your local Cognito paths need IAM calls)

4. Create web local env:
```bash
cp packages/web/.env.local.example packages/web/.env.local
```

5. Update `packages/web/.env.local` with your real Cognito and NextAuth values.

## Run App Locally

```bash
npm run shared:build
npm run backend:dev
# in another terminal
npm run web:dev
```

## Stop Local Infra

```bash
npm run local:stop
```

## Notes

- Existing scripts `scripts/create-dynamodb-tables.sh` and `scripts/seed-dynamodb.sh` are reused against local DynamoDB through `AWS_ENDPOINT_URL`.
- Call recordings/transcripts are written to `.local/storage` in local mode.
- `packages/backend/.env.local` is loaded before `.env` in NestJS.
- Cognito remains AWS-hosted as requested.
