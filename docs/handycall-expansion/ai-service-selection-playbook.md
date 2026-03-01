# AI Service Selection + Payment Playbook

## Goal
Make call flows consistently capture the customer's exact service choice (including `subscription` vs `one-time` when applicable), then carry that choice into booking links and payment.

## Setup Checklist
1. In onboarding/company setup, define pricing tiers and add-ons clearly in `pricing_profile`.
2. In settings, configure `booking_services` with:
   - `name`
   - `amount_cents`
   - `billing_type` (`ONE_TIME` or `SUBSCRIPTION`)
   - optional interval/trial fields for subscriptions
3. Choose payment mode:
   - `Managed in HandyCall`: complete Stripe Connect onboarding (including payout/bank details).
   - `Self-managed`: HandyCall books appointments, payment handled externally.

## AI Behavior Rules
1. If multiple services exist, AI asks customer to pick one before booking.
2. If both one-time and subscription options exist, AI explicitly asks which model they want.
3. AI gives a short summary of choices only (no long sales script).
4. AI stores selected fields in booking details/call context:
   - `selected_service_id`
   - `selected_service_name`
   - `selected_billing_type`

## Vertical Guidance
- Pest control: always clarify `subscription plan` vs `one-time treatment`.
- Landscaping/lawn care: identify scope first (mowing, trimming, trees, mulch, seeding, etc.), then confirm package.
- Other verticals: keep scope-based selection; only explain differences needed for customer decision.

## Booking + Payment Flow
1. AI captures service selection on call.
2. Booking link token includes the selected service context.
3. Booking page preselects that service.
4. If `HANDYCALL_MANAGED`, payment intent/checkout defaults to selected service pricing + billing type.
5. Payment record stores selected service metadata for reporting and customer history.

## QA Scenarios
1. Call chooses subscription plan -> booking link opens with subscription option preselected.
2. Call chooses one-time service -> payment defaults to one-time charge.
3. Company with only one active service -> no extra service-choice prompt, still stored.
4. Self-managed mode -> booking works, payment disabled with clear message.
