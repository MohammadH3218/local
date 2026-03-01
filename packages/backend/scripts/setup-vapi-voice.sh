#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -z "${VAPI_API_KEY:-}" ]]; then
  echo "VAPI_API_KEY is required. Set it in packages/backend/.env first."
  exit 1
fi

if [[ -z "${API_BASE_URL:-}" ]]; then
  echo "API_BASE_URL is required (e.g. https://handycall-api-lb....elasticbeanstalk.com)."
  exit 1
fi

if [[ -z "${VAPI_SERVER_SECRET:-}" ]]; then
  VAPI_SERVER_SECRET="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
)"
fi

VAPI_ASSISTANT_NAME="${VAPI_ASSISTANT_NAME:-HandyCall Voice Runtime}"
VAPI_MODEL="${VAPI_MODEL:-gpt-4o-mini}"
SERVER_URL="${API_BASE_URL%/}/api/v1/vapi/server?secret=${VAPI_SERVER_SECRET}"

read -r -d '' PAYLOAD <<JSON || true
{
  "name": "${VAPI_ASSISTANT_NAME}",
  "firstMessage": "Thanks for calling. I'm your HandyCall assistant. How can I help today?",
  "endCallMessage": "Thanks for calling HandyCall. Have a great day.",
  "serverUrl": "${SERVER_URL}",
  "serverMessages": ["tool-calls", "end-of-call-report", "assistant-request"],
  "transcriber": { "provider": "deepgram", "model": "nova-2", "language": "en" },
  "model": {
    "provider": "openai",
    "model": "${VAPI_MODEL}",
    "temperature": 0.4,
    "messages": [
      {
        "role": "system",
        "content": "You are HandyCall voice receptionist. Always call resolve_company_context first before answering pricing/services. Keep responses short and natural (1-2 sentences, then one question). Collect intent and booking details step-by-step. If booking is requested, use get_availability -> hold_slot -> create_booking. For pricing/service questions, use knowledge_search and resolve_company_context. For service-area questions, use check_service_area. Create/update lead early with create_lead. Before ending the call, always call save_call with summary and collected_info. If caller wants link/checkout, use send_booking_link and confirm email clearly."
      }
    ],
    "functions": [
      {
        "name": "resolve_company_context",
        "description": "Fetch the company context, service options, billing modes, and AI-specific instructions.",
        "parameters": { "type": "object", "properties": {} }
      },
      {
        "name": "create_lead",
        "description": "Create or update caller lead and capture collected details.",
        "parameters": {
          "type": "object",
          "properties": { "collected_info": { "type": "object" } }
        }
      },
      {
        "name": "save_call",
        "description": "Persist final summary/transcript and collected intake data.",
        "parameters": {
          "type": "object",
          "properties": {
            "summary": { "type": "string" },
            "transcript": { "type": "string" },
            "duration_seconds": { "type": "number" },
            "collected_info": { "type": "object" }
          }
        }
      },
      {
        "name": "knowledge_search",
        "description": "Search company knowledge for FAQs, pricing, and policies.",
        "parameters": {
          "type": "object",
          "properties": { "query": { "type": "string" }, "top_k": { "type": "number" } },
          "required": ["query"]
        }
      },
      {
        "name": "check_service_area",
        "description": "Check whether the business services a ZIP code.",
        "parameters": {
          "type": "object",
          "properties": { "zip": { "type": "string" } },
          "required": ["zip"]
        }
      },
      {
        "name": "get_availability",
        "description": "Get available booking slots for a date/time request.",
        "parameters": {
          "type": "object",
          "properties": {
            "start_time": { "type": "string" },
            "end_time": { "type": "string" },
            "timezone": { "type": "string" }
          },
          "required": ["start_time"]
        }
      },
      {
        "name": "hold_slot",
        "description": "Temporarily hold a slot while confirming details.",
        "parameters": {
          "type": "object",
          "properties": {
            "slot": { "type": "string" },
            "timezone": { "type": "string" },
            "hold_minutes": { "type": "number" }
          },
          "required": ["slot"]
        }
      },
      {
        "name": "create_booking",
        "description": "Create appointment after caller confirms slot and details.",
        "parameters": {
          "type": "object",
          "properties": {
            "start_time": { "type": "string" },
            "end_time": { "type": "string" },
            "timezone": { "type": "string" },
            "customer_name": { "type": "string" },
            "full_name": { "type": "string" },
            "customer_email": { "type": "string" },
            "service_type": { "type": "string" },
            "notes": { "type": "string" },
            "details": { "type": "object" },
            "confirmed": { "type": "boolean" }
          },
          "required": ["start_time"]
        }
      },
      {
        "name": "list_appointments_by_phone",
        "description": "List caller appointments by their phone number.",
        "parameters": {
          "type": "object",
          "properties": { "range_days": { "type": "number" } }
        }
      },
      {
        "name": "cancel_appointment",
        "description": "Cancel an existing appointment.",
        "parameters": {
          "type": "object",
          "properties": { "appointment_id": { "type": "string" }, "reason": { "type": "string" } },
          "required": ["appointment_id"]
        }
      },
      {
        "name": "reschedule_appointment",
        "description": "Reschedule an appointment to a new start time.",
        "parameters": {
          "type": "object",
          "properties": {
            "appointment_id": { "type": "string" },
            "new_start_time": { "type": "string" },
            "timezone": { "type": "string" },
            "duration_minutes": { "type": "number" }
          },
          "required": ["appointment_id", "new_start_time"]
        }
      },
      {
        "name": "send_booking_link",
        "description": "Send the public booking/payment link to caller email after confirming address.",
        "parameters": {
          "type": "object",
          "properties": {
            "email": { "type": "string" },
            "service_id": { "type": "string" },
            "selected_service_name": { "type": "string" },
            "selected_billing_type": { "type": "string", "enum": ["ONE_TIME", "SUBSCRIPTION"] }
          },
          "required": ["email"]
        }
      }
    ]
  }
}
JSON

RESPONSE="$(
  curl -sS --http1.1 \
    -X POST "https://api.vapi.ai/assistant" \
    -H "Authorization: Bearer ${VAPI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
)"

ASSISTANT_ID="$(echo "$RESPONSE" | jq -r '.id // empty')"
if [[ -z "$ASSISTANT_ID" ]]; then
  echo "Failed to create assistant. Response:"
  echo "$RESPONSE"
  exit 1
fi

python3 - <<PY
from pathlib import Path
import re

env_path = Path(r"$ENV_FILE")
text = env_path.read_text() if env_path.exists() else ""
updates = {
    "VAPI_ENABLED": "true",
    "VAPI_ASSISTANT_ID": "$ASSISTANT_ID",
    "VAPI_ASSISTANT_NAME": "$VAPI_ASSISTANT_NAME",
    "VAPI_MODEL": "$VAPI_MODEL",
    "VAPI_SERVER_SECRET": "$VAPI_SERVER_SECRET",
}
for key, value in updates.items():
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    line = f"{key}={value}"
    if pattern.search(text):
        text = pattern.sub(line, text)
    else:
        if text and not text.endswith("\\n"):
            text += "\\n"
        text += line + "\\n"
env_path.write_text(text)
print(str(env_path))
PY

echo ""
echo "Vapi assistant created:"
echo "  Assistant ID: $ASSISTANT_ID"
echo "  Server URL:   $SERVER_URL"
echo ""
echo "Local env updated at: $ENV_FILE"
echo "Set TWILIO_VOICE_WEBHOOK_URL to:"
echo "  ${API_BASE_URL%/}/api/v1/vapi/twilio/voice"
echo ""
echo "Then redeploy backend."

