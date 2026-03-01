# Voice Bridge Patch Plan (Executed)

This document details the changes applied to `packages/voice-bridge/src/index.ts` to fully enable the "Chaos-Resilient" dialog manager.

## Objective
Enable OpenAI Realtime tools *at all times*, even when the legacy FSM (Finite State Machine) logic is enabled. This allows a hybrid approach where the FSM guides the conversation but tools (like `knowledge_search`, `check_service_area`) can be triggered dynamically by the model to handle interruptions or specific queries.

## Changes Applied

### 1. Enable Tools in Session Update
Modified the `session.update` payload sent to OpenAI to always include `toolsSchema()` and set `tool_choice` to `'auto'`.

**Location:** `packages/voice-bridge/src/index.ts` (approx line 2270)

```typescript
// BEFORE
tools: fsmEnabled ? [] : toolsSchema(),
tool_choice: fsmEnabled ? 'none' : 'auto',

// AFTER (Applied)
tools: toolsSchema(),
tool_choice: 'auto',
```

### 2. Add Tool Handlers
Verified that `invokeTool` in `index.ts` supports the new tools required for production:

- `check_service_area`: Checks zip code eligibility.
- `list_appointments_by_phone`: Retreives booking history.
- `cancel_appointment`: Cancels an existing booking.
- `reschedule_appointment`: Updates a booking time.

These handlers are already present in `invokeTool` and map correctly to the backend endpoints defined in `TOOLS_API_CONTRACT.md`.

## Verification
- **Tools Schema:** Updated to include new tool definitions.
- **Backend Controller:** `RealtimeToolsController` has corresponding endpoints.
- **Deployment:** The voice bridge requires redeployment for the `index.ts` change to take effect.
