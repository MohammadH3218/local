#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"
AWS_REGION="${AWS_REGION:-us-east-1}"
DYNAMODB_ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

echo "[local-start] Validating prerequisites..."
require_cmd docker
require_cmd supabase
require_cmd aws
require_cmd jq
require_cmd curl

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running." >&2
  exit 1
fi

echo "[local-start] Starting local Docker services (DynamoDB)..."
docker compose -f "$COMPOSE_FILE" up -d

if [ ! -d "$ROOT_DIR/supabase" ]; then
  echo "[local-start] Initializing Supabase project..."
  supabase init --workdir "$ROOT_DIR" --yes
fi

if [ "${SKIP_SUPABASE_START:-false}" = "true" ]; then
  echo "[local-start] SKIP_SUPABASE_START=true, skipping Supabase container startup."
else
  echo "[local-start] Starting Supabase local stack..."
  supabase start \
    --workdir "$ROOT_DIR" \
    --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
    --yes
fi

echo "[local-start] Bootstrapping local resources..."
AWS_REGION="$AWS_REGION" DYNAMODB_ENDPOINT="$DYNAMODB_ENDPOINT" "$ROOT_DIR/scripts/local/bootstrap-localstack.sh"

echo "[local-start] Done."
echo "[local-start] Next: configure packages/backend/.env.local and packages/web/.env.local using docs/LOCAL_DEV_SETUP.md."
