# Twilio → OpenAI Realtime (Media Streams Bridge)

This is the correct integration path for Twilio phone numbers when you want “ChatGPT-style” real-time voice:

Twilio Phone Number → Twilio Programmable Voice (TwiML webhook) → Twilio Media Streams (WebSocket) → `handycall-voice-bridge` → OpenAI Realtime WebSocket → audio back to Twilio.

## What NOT to do

- Do **not** route the number to Twilio SIP Trunking to reach OpenAI. Twilio SIP trunking expects a SIP endpoint/carrier; OpenAI Realtime is a WebSocket API.

## Services involved in this repo

- Voice bridge: `packages/voice-bridge` (port `8082` by default)
- Tools API: HandyCall backend `packages/backend` (port `3000`, base `http://localhost:3000/api/v1`)

## Required environment variables

### Voice bridge (`packages/voice-bridge`)
- `PUBLIC_BASE_URL` (required) — public HTTPS URL for Twilio to reach your server (ngrok or your production domain)
- `TWILIO_AUTH_TOKEN` (required if `TWILIO_VALIDATE_SIGNATURE=true`)
- `OPENAI_API_KEY` (required)
- `TOOLS_API_BASE_URL` (required) — e.g. `http://localhost:3000/api/v1`
- `TOOLS_API_KEY` (required) — must match backend `HANDYCALL_TOOLS_API_KEY`
- Optional: `TWILIO_VALIDATE_SIGNATURE` (`true` by default)
- Optional: `TWILIO_MEDIA_STREAM_TOKEN` — if set, added to `<Stream>` and enforced on the WebSocket
- Optional: `REALTIME_MODEL` (default `gpt-realtime-mini`)
- Optional: `REALTIME_VOICE` (default `alloy`)

Aliases supported by the bridge:
- `VOICE_BRIDGE_PUBLIC_BASE_URL` (alias for `PUBLIC_BASE_URL`)
- `HANDYCALL_BACKEND_BASE_URL` (alias for `TOOLS_API_BASE_URL`)
- `HANDYCALL_TOOLS_API_KEY` (alias for `TOOLS_API_KEY`)
- `OPENAI_REALTIME_MODEL` (alias for `REALTIME_MODEL`)
- `OPENAI_REALTIME_VOICE` (alias for `REALTIME_VOICE`)

### Backend (`packages/backend`)
- `HANDYCALL_TOOLS_API_KEY` (required) — shared secret for server-to-server tools requests (`x-handycall-tools-key`)

## Twilio console setup

1. Twilio Console → Phone Numbers → Manage → Active numbers → select your number
2. Under **Voice & Fax**:
   - **A call comes in**: `Webhook`
   - URL: `https://YOUR_DOMAIN/twilio/voice` (must match `PUBLIC_BASE_URL`)
   - Method: `POST`
3. Save.

## Local testing with ngrok

1. Start backend:
   - `npm run backend:dev`
2. Start voice bridge:
   - `npm run dev -w handycall-voice-bridge`
3. Expose the bridge to the internet:
   - `ngrok http 8082`
4. Set `PUBLIC_BASE_URL` to the ngrok HTTPS URL (example `https://abc123.ngrok-free.app`)
5. In Twilio phone number settings, set the webhook URL to:
   - `https://abc123.ngrok-free.app/twilio/voice`
6. Call your Twilio number.

## AWS-first note (no local development)

If you are not doing local development, deploy `packages/voice-bridge` behind an HTTPS/WSS-capable edge (commonly an AWS ALB with TLS termination) and set:
- `PUBLIC_BASE_URL` to your production `https://YOUR_DOMAIN`
- Twilio webhook to `https://YOUR_DOMAIN/twilio/voice`

## Multi-tenant routing

Inbound tenant resolution is done via Tools API `POST /tenant/resolve`, using the dialed number (Twilio `To`).

To map a Twilio DID to a company:
- Use the API endpoint `POST /telephony/inbound-numbers` (authenticated) to assign `did_e164` → company, or
- Insert items into DynamoDB table `handycall_{env}_company_numbers` (PK: `did_e164`).
