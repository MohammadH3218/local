# Voice Bridge Runbook

This service terminates Twilio Media Streams, handles VAD/Speech using OpenAI Realtime, and tools.

## Local Development

1. **Prerequisites**
   - Node.js 18+
   - Ngrok (for exposing localhost to Twilio)

2. **Environment Variables**
   Create `.env` in `packages/voice-bridge/`:
   ```env
   PORT=8082
   OPENAI_API_KEY=sk-...
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   PUBLIC_BASE_URL=https://<your-ngrok>.ngrok-free.app
   # Tuning
   REALTIME_VAD_THRESHOLD=0.75
   REALTIME_SILENCE_MS=400
   NOISE_GATE_THRESHOLD=500
   ```

3. **Run**
   ```bash
   cd packages/voice-bridge
   npm run dev
   ```

4. **Connect Twilio**
   - Point your Twilio Phone Number Voice Webhook to: `https://<your-ngrok>.ngrok-free.app/twilio/voice`

## Tuning for Noise

If callers complain about interruptions:
1. **Increase VAD Threshold**: Set `REALTIME_VAD_THRESHOLD=0.8` (0.0-1.0). Higher means harder to interrupt.
2. **Increase Silence Duration**: Set `REALTIME_SILENCE_MS=600`. Higher means wait longer before responding.
3. **Increase Noise Gate**: Set `NOISE_GATE_THRESHOLD=1000`. Filters out louder background fuzz.

## Logs
Logs are printed to stdout in JSON-like format (if configured) or plain text.
Search for `[callSid=...]` to trace a specific call.
