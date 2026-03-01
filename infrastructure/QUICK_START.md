# Quick Start Guide - HandyCall Voice Bridge

The Voice Bridge connects Twilio Media Streams to OpenAI Realtime API.

## Prerequisites
- Node.js 18+
- Twilio Account + Phone Number
- OpenAI API Key

## Setup (5 minutes)

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Voice Bridge**
   Create `packages/voice-bridge/.env`:
   ```env
   OPENAI_API_KEY=sk-your-key
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   PUBLIC_BASE_URL=https://your-domain.com
   ```

3. **Run Development Server**
   ```bash
   cd packages/voice-bridge
   npm run dev
   ```

4. **Point Twilio to Bridge**
   - In Twilio Console: Phone Number > Voice > Webhook
   - URL: `https://your-domain.com/twilio/voice`

See [RUNBOOK.md](../RUNBOOK.md) for detailed tuning and troubleshooting.



