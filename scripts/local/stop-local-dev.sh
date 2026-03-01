#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

echo "[local-stop] Stopping Supabase..."
supabase stop --workdir "$ROOT_DIR" || true

echo "[local-stop] Stopping LocalStack..."
docker compose -f "$COMPOSE_FILE" down || true

echo "[local-stop] Done."
