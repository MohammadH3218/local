# Realtime Voice Architecture

> [!IMPORTANT]
> **Amazon Connect and Lex have been removed.**
> The only supported voice path is **Twilio Programmable Voice + Media Streams (WebSocket) ↔ OpenAI Realtime API**.

## Components

1. **Telephony Provider**: Twilio (Programmable Voice)
2. **Bridge**: `packages/voice-bridge`
   - Terminates `wss://` connection from Twilio.
   - Connects to OpenAI Realtime API.
   - Handles VAD, tools, and session management.
3. **Backend API**: `packages/backend`
   - Provides tools (`create_booking`, `knowledge_search`, `save_call`) via HTTP.
   - Stores call logs and recordings.

## Flow

1. **Inbound Call** -> Twilio Number
2. **Twilio Webhook** -> `POST /twilio/voice` (on Voice Bridge)
   - Returns TwiML `<Connect><Stream url="..." /></Connect>`
3. **WebSocket** -> Twilio connects to `/twilio/media`
4. **Bridge** connects to OpenAI Realtime.
5. **Conversation Loop**:
   - Audio from Twilio -> Bridge -> OpenAI (Input Audio)
   - OpenAI VAD detects speech -> Triggers response
   - OpenAI Audio -> Bridge -> Twilio (Media)
6. **Tools**:
   - OpenAI emits `function_call`
   - Bridge calls Backend API
   - Bridge sends `function_call_output` to OpenAI

## Setup

See [RUNBOOK.md](../RUNBOOK.md) for local dev and tuning instructions.
See [TWILIO_MEDIA_STREAMS_SETUP.md](./TWILIO_MEDIA_STREAMS_SETUP.md) for Twilio configuration.
