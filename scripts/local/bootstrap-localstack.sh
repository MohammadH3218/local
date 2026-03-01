#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_REGION="${AWS_REGION:-us-east-1}"
DYNAMODB_ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"

export AWS_REGION

log() {
  echo "[local-bootstrap] $1"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local max_attempts=60
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$name is ready."
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  echo "$name did not become ready in time ($url)." >&2
  return 1
}

wait_for_dynamodb() {
  local max_attempts=60
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if AWS_ENDPOINT_URL="$DYNAMODB_ENDPOINT" aws dynamodb list-tables --region "$AWS_REGION" >/dev/null 2>&1; then
      log "DynamoDB Local is ready."
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  echo "DynamoDB Local did not become ready in time ($DYNAMODB_ENDPOINT)." >&2
  return 1
}

main() {
  wait_for_dynamodb

  log "Creating DynamoDB tables (dev prefix) in local DynamoDB..."
  AWS_ENDPOINT_URL="$DYNAMODB_ENDPOINT" AWS_REGION="$AWS_REGION" "$ROOT_DIR/scripts/create-dynamodb-tables.sh" dev

  log "Seeding DynamoDB local test data..."
  AWS_ENDPOINT_URL="$DYNAMODB_ENDPOINT" AWS_REGION="$AWS_REGION" "$ROOT_DIR/scripts/seed-dynamodb.sh" dev

  log "Bootstrap completed."
}

main "$@"
