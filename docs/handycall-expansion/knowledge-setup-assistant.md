# AI Knowledge Setup Assistant

## What this adds
- Guided chat interview for knowledge setup in:
  - Onboarding knowledge step
  - Dashboard Knowledge page
- Assistant asks focused follow-up questions based on company/service type.
- One-click generation of structured knowledge items (FAQ/SERVICE/POLICY/PRODUCT/SAFETY).
- Generated items are saved into the same `knowledge_items` store, so users can edit/delete them normally.

## API endpoints
- `POST /api/v1/knowledge-items/assistant/respond`
  - Input: `messages[]` (`user` / `assistant`)
  - Output: `assistant_message`, `done`, `missing_topics`, `gathered_topics`
- `POST /api/v1/knowledge-items/assistant/generate`
  - Input: `messages[]`, `auto_create`
  - Output: generated items + created/updated counters

## Model and cost
- Uses existing `OPENAI_API_KEY`.
- New optional env var: `KNOWLEDGE_SETUP_MODEL_ID`
  - Default: `gpt-4.1-nano`
  - Fallback order: configured model -> `gpt-4.1-nano` -> `gpt-4o-mini` -> `gpt-4.1-mini`

## How generation behaves
- Uses company context:
  - `service_type`
  - `pricing_profile`
  - `booking_services`
  - service area and business hours
  - payment mode
- Enforces coverage for:
  - service catalog + add-ons
  - one-time vs subscription options
  - pricing and estimate policy
  - booking/cancellation rules
  - payment expectations
  - guarantees/exclusions and edge cases
- Upserts by title (case-insensitive) to reduce duplicates on re-runs.

## UX notes
- Users can still manually add/edit knowledge entries.
- Assistant can be restarted at any time.
- “Generate” works even before completion, but best results come when `done=true`.
