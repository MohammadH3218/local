# HandyCall.ai — Payments & Subscriptions Design

> Complete payment architecture for the expanded platform covering pro subscriptions, customer payments, marketplace fees, and recurring service billing.

---

## 1. Current Payment State

### 1.1 What Exists

| Component | Status | Details |
|-----------|--------|---------|
| **Pro Subscriptions (Stripe)** | ✅ Implemented | Starter ($19.99), Pro ($39.99), Max ($99.99) monthly |
| **Stripe Customer Management** | ✅ Implemented | Customer creation, payment methods, invoices |
| **Stripe Connect (Express)** | ✅ Implemented | Pro payout accounts for customer payments |
| **Customer Booking Payments** | ✅ Implemented | Payment collection via public booking links |
| **Usage Tracking** | ✅ Implemented | Minutes, SMS, contacts metered per billing cycle |
| **Usage Gating** | ✅ Implemented | Block calls/SMS when plan limit exhausted |
| **Stripe Webhooks** | ✅ Implemented | Subscription updates, payment events |
| **Admin Billing Controls** | ✅ Implemented | Create/update/cancel subscriptions, usage adjustments |

### 1.2 What's Missing

| Component | Status | Required For |
|-----------|--------|-------------|
| **Customer accounts on Stripe** | ❌ | Customer portal payments |
| **Marketplace platform fee** | ❌ | Revenue from customer payments |
| **Recurring service billing** | Partial | Customer subscriptions (pest control, etc.) |
| **Refund processing** | ❌ | Customer disputes |
| **Tipping** | ❌ | Post-job tips |
| **Multi-currency** | ❌ | International expansion (future) |

---

## 2. Payment Architecture (Expanded)

### 2.1 Money Flow Diagram

```
                    Customer Pays
                         │
                         ▼
              ┌──────────────────────┐
              │     Stripe           │
              │                      │
              │  Payment Intent      │
              │  Amount: $100.00     │
              │                      │
              │  ┌────────────────┐  │
              │  │ Platform Fee   │  │  → HandyCall: $10.00 (10%)
              │  │ (application   │  │
              │  │  fee)          │  │
              │  └────────────────┘  │
              │  ┌────────────────┐  │
              │  │ Stripe Fee     │  │  → Stripe: $3.20 (2.9% + $0.30)
              │  │ (processing)   │  │
              │  └────────────────┘  │
              │  ┌────────────────┐  │
              │  │ Pro Payout     │  │  → Pro's bank: $86.80
              │  │ (net)          │  │
              │  └────────────────┘  │
              └──────────────────────┘
```

### 2.2 Three Payment Contexts

| Context | Who Pays | Who Receives | Mechanism |
|---------|----------|-------------|-----------|
| **Pro Subscription** | Pro | HandyCall | Direct Stripe subscription |
| **Customer Booking** | Customer | Pro (via Connect) | Stripe Connect payment intent with application fee |
| **Customer Subscription** | Customer | Pro (via Connect) | Stripe Connect subscription with application fee |

---

## 3. Pro Subscription System

### 3.1 Plans (Existing — No Changes)

| Plan | Price | Minutes | SMS | Contacts | Trial |
|------|-------|---------|-----|----------|-------|
| **Starter** | $19.99/mo | 100 | 200 | 300 | No |
| **Pro** | $39.99/mo | 300 | 600 | 1,000 | 14-day |
| **Max** | $99.99/mo | 750 | 1,500 | 3,000 | No |

### 3.2 Subscription Lifecycle

```
Pro signs up
     │
     ▼
  Select plan → Create Stripe Customer
     │
     ├── Pro plan selected → 14-day free trial
     │   └── Trial ends → charge begins (or cancel)
     │
     ├── Starter/Max selected → immediate charge
     │
     ▼
  Active subscription
     │
     ├── Upgrade → prorate, immediate switch
     ├── Downgrade → switch at period end
     ├── Cancel → access until period end
     ├── Payment fails → retry 3x over 7 days → suspend
     └── Reactivate → resume billing
```

### 3.3 Usage Metering

**Tracked per billing period:**
- Call minutes (rounded up to nearest minute per call)
- SMS messages (each send = 1 unit)
- Contacts (total active contacts, not incremental)

**Enforcement:**
- `UsageGateService` checks before each call/SMS
- At 80%: warning notification + dashboard alert
- At 100%: block new calls/SMS, show upgrade prompt
- Contacts: soft limit (warning, not blocking)

### 3.4 Future: Usage-Based Pricing Add-Ons

| Add-On | Price | Description |
|--------|-------|-------------|
| Extra minutes pack | $9.99 / 100 min | One-time overage purchase |
| Extra SMS pack | $4.99 / 200 SMS | One-time overage purchase |
| Priority support | $29.99/mo | Dedicated account manager |
| White-label | $49.99/mo | Remove HandyCall branding |

*Implementation: Stripe one-time charges (packs) or subscription add-on line items.*

---

## 4. Customer Payment System

### 4.1 Customer Stripe Setup

**When a customer first pays through the platform:**

1. Create Stripe Customer for customer (separate from pro's Stripe Customer)
2. Collect payment method via Stripe Elements (card)
3. Store `stripe_customer_id` on CustomerProfiles table
4. Reuse for future bookings across all providers

### 4.2 Booking Payment Flow

```
Customer books a service
     │
     ▼
  Frontend: Show price breakdown
  ├── Service fee: $89.00
  ├── Platform fee: $0.00 (absorbed — customer sees total only)
  └── Total: $89.00
     │
     ▼
  Customer enters/selects payment method
     │
     ▼
  Backend: POST /api/v1/customer/bookings/:id/pay
    1. Create PaymentIntent via Stripe Connect
       - amount: 8900 (cents)
       - application_fee_amount: 890 (10% platform fee)
       - transfer_data: { destination: pro's Stripe Connect account }
       - customer: customer's Stripe customer ID
       - metadata: { booking_id, customer_id, provider_id }
    2. Return client_secret to frontend
     │
     ▼
  Frontend: Confirm payment with Stripe.js
     │
     ▼
  Stripe webhook: payment_intent.succeeded
    1. Update booking payment_status = 'paid'
    2. Send receipt to customer (email + SMS)
    3. Notify pro of payment received
    4. Update provider revenue metrics
```

### 4.3 Payment Timing Options

| Mode | When Customer Pays | Use Case |
|------|-------------------|----------|
| **Pay on booking** | At time of booking | Standard: customer pays upfront |
| **Pay on completion** | Pro marks job complete → payment charged | Trust-based: charge after service delivered |
| **Deposit + remainder** | 50% on booking, 50% on completion | Large jobs (remodels, installs) |
| **Quote-based** | After pro sends quote, customer accepts and pays | Custom pricing jobs |

*Phase 1: Pay on booking only. Phase 2: Add pay on completion. Phase 3: Add deposit model.*

### 4.4 Platform Fee Structure

| Fee Type | Amount | Applied To | Collected Via |
|----------|--------|-----------|---------------|
| **Marketplace booking fee** | 10% | Customer payments through marketplace | Stripe Connect application_fee |
| **Direct booking fee** | 5% | Customer payments through pro's direct link | Stripe Connect application_fee |
| **Subscription billing fee** | 10% | Recurring service payments | Stripe Connect application_fee |

**Pro sees:**
- Dashboard: "Revenue: $890.00 (after fees)"
- Payout details show gross, platform fee, Stripe fee, net

**Customer sees:**
- Only the total price (platform fee is invisible to them — it comes from the pro's side)

---

## 5. Customer Recurring Service Subscriptions

### 5.1 How It Works

Customers can subscribe to recurring services (e.g., monthly pest control, bi-weekly cleaning):

```
Customer books a recurring service
     │
     ▼
  Pro creates recurring service offering:
    - Service type: Pest Control
    - Frequency: Monthly
    - Price per visit: $79.00
    - Duration: Ongoing (or 12 months)
     │
     ▼
  Customer subscribes:
    1. First payment collected immediately
    2. Stripe Subscription created (Connect, with application_fee_percent)
    3. Next appointment auto-scheduled
     │
     ▼
  Monthly cycle:
    1. Stripe charges customer automatically
    2. Appointment auto-created for next visit
    3. Customer notified of upcoming visit
    4. Pro receives payout
     │
     ▼
  Customer can:
    - Pause (skip next N months)
    - Cancel (at period end)
    - Update payment method
```

### 5.2 Subscription Billing via Stripe Connect

```typescript
// Create subscription on pro's Connect account
const subscription = await stripe.subscriptions.create({
  customer: customer_stripe_id,
  items: [{ price: recurring_price_id }],
  application_fee_percent: 10, // Platform fee
  transfer_data: { destination: pro_connect_account_id },
  metadata: {
    customer_id: customer.id,
    provider_id: provider.id,
    service_type: 'PEST_CONTROL',
    subscription_id: our_subscription_id,
  },
});
```

### 5.3 Subscription Management (Customer Side)

| Action | Implementation |
|--------|---------------|
| **View subscriptions** | GET /api/v1/customer/subscriptions → list active/paused/cancelled |
| **Pause** | PATCH /api/v1/customer/subscriptions/:id → pause Stripe subscription, skip next auto-schedule |
| **Resume** | PATCH /api/v1/customer/subscriptions/:id → resume Stripe subscription |
| **Cancel** | DELETE /api/v1/customer/subscriptions/:id → cancel at period end |
| **Update payment** | PUT /api/v1/customer/subscriptions/:id/payment-method |

### 5.4 Subscription Management (Pro Side)

| Action | Implementation |
|--------|---------------|
| **View subscribers** | GET /api/v1/subscriptions → list all customer subscriptions |
| **Create offering** | POST /api/v1/subscription-offerings → define recurring service + price |
| **Modify price** | PUT /api/v1/subscription-offerings/:id → change price (applies to new subs only) |
| **Cancel customer** | DELETE /api/v1/subscriptions/:id → cancel customer's subscription |

---

## 6. Refunds & Disputes

### 6.1 Refund Flow

```
Customer requests refund (or pro initiates)
     │
     ▼
  Backend: POST /api/v1/customer/bookings/:id/refund
    1. Validate: booking is paid, within refund window
    2. Create Stripe refund
       - Full refund: refund entire payment, reverse application fee
       - Partial refund: refund partial amount, proportional fee reversal
    3. Update booking payment_status = 'refunded' or 'partial_refund'
    4. Notify customer (email + SMS)
    5. Notify pro
    6. Update revenue metrics
```

### 6.2 Refund Policy

| Scenario | Refund Amount | Timeframe |
|----------|-------------|-----------|
| Customer cancels > 24h before | Full refund | Immediate |
| Customer cancels < 24h before | 50% refund (configurable per pro) | Immediate |
| Customer no-show | No refund (pro keeps payment) | — |
| Pro cancels | Full refund | Immediate |
| Service quality complaint | Admin reviews, up to full refund | 1–3 business days |

### 6.3 Dispute Handling

```
Customer disputes charge (Stripe chargeback)
     │
     ▼
  Stripe webhook: charge.dispute.created
    1. Notify admin + pro
    2. Freeze payout for disputed amount
    3. Auto-gather evidence:
       - Booking details
       - Communication logs
       - Completion confirmation
       - Customer signature (if applicable)
    4. Submit evidence to Stripe
     │
     ▼
  Stripe resolves dispute
    ├── Won: funds released to pro
    └── Lost: funds returned to customer, pro debited
```

---

## 7. Invoicing System

### 7.1 Invoice Types

| Type | Creator | Recipient | Use Case |
|------|---------|-----------|----------|
| **Service invoice** | Pro (or auto-generated) | Customer | One-time job billing |
| **Quote → Invoice** | Pro | Customer | Convert accepted quote to invoice |
| **Subscription invoice** | Stripe (auto) | Customer | Recurring billing |
| **Platform invoice** | HandyCall | Pro | Monthly platform subscription receipt |

### 7.2 Invoice Flow

```
Pro creates invoice
     │
     ▼
  Backend: POST /api/v1/invoices
    1. Create invoice record in DB
    2. Generate invoice number (HC-{company_slug}-{sequential})
    3. Calculate: line items + tax + discount = total
     │
     ▼
  Pro sends invoice
    1. Email with PDF attachment
    2. SMS with payment link
    3. In-app notification
     │
     ▼
  Customer pays
    1. Click payment link → Stripe Checkout / Payment Intent
    2. Payment collected via Connect (with platform fee)
    3. Invoice status → PAID
    4. Receipt sent automatically
```

### 7.3 Invoice Data Model

| Field | Type | Description |
|-------|------|-------------|
| `invoice_id` | string | UUID |
| `invoice_number` | string | Human-readable (HC-MIKE-0042) |
| `company_id` | string | Issuing company |
| `customer_id` | string | Billed customer |
| `booking_id` | string | Optional linked booking |
| `line_items` | array | `[{ description, quantity, unit_price, total }]` |
| `subtotal` | number | Sum of line items (cents) |
| `tax_rate` | number | Tax percentage |
| `tax_amount` | number | Tax in cents |
| `discount_amount` | number | Discount in cents |
| `total` | number | Final amount (cents) |
| `status` | string | `draft`, `sent`, `viewed`, `paid`, `overdue`, `cancelled` |
| `due_date` | number | Payment due date |
| `paid_at` | number | When payment was received |
| `payment_intent_id` | string | Stripe payment intent |
| `notes` | string | Free-text notes |
| `created_at` | number | |
| `updated_at` | number | |

---

## 8. Payout Management

### 8.1 Pro Payout Schedule

| Setting | Value |
|---------|-------|
| Default payout schedule | Daily (T+2 for Standard, instant for Express with fee) |
| Minimum payout | $1.00 |
| Payout method | Bank transfer (via Stripe Connect) |
| Manual payout | Not offered (Stripe manages schedule) |

### 8.2 Payout Dashboard (Pro)

```
┌────────────────────────────────────────────────┐
│ Payments & Payouts                             │
├────────────────────────────────────────────────┤
│                                                │
│ Available Balance: $1,245.80                   │
│ Next Payout: $1,245.80 on Feb 28              │
│ Pending: $340.00 (processing)                 │
│                                                │
│ This Month                                    │
│ ┌──────────────────────────────────────────┐  │
│ │ Gross Revenue:      $4,320.00            │  │
│ │ Platform Fees:      -$432.00  (10%)      │  │
│ │ Stripe Fees:        -$155.52  (3.6%)     │  │
│ │ Refunds:            -$89.00              │  │
│ │ ─────────────────────────────            │  │
│ │ Net Earnings:       $3,643.48            │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ Recent Payments:                              │
│ ✓ Sarah M. — Drain cleaning — $89.00  2/25   │
│ ✓ John K. — HVAC repair — $245.00    2/24   │
│ ⏳ Mike P. — Plumbing install — $340  2/26   │
│                                                │
│ [View All Transactions]  [Download CSV]       │
└────────────────────────────────────────────────┘
```

---

## 9. Tax Considerations

### 9.1 Tax Collection Strategy

**Phase 1–3:** HandyCall does NOT collect sales tax. Pros are responsible for their own tax obligations.

**Phase 4+:** Consider integrating Stripe Tax for automatic tax calculation:
- Stripe Tax calculates applicable sales tax per state/jurisdiction
- Added to customer's total at checkout
- Remitted to pro (who files/remits taxes)

### 9.2 Tax Reporting

| Report | For | Frequency |
|--------|-----|-----------|
| **1099-K** | Pros receiving > $600/year via Connect | Annual (Stripe handles) |
| **Payment summary** | Pros (CSV export from dashboard) | On-demand |
| **Platform revenue** | HandyCall accounting | Monthly |

---

## 10. Security & Compliance

### 10.1 PCI Compliance

| Requirement | Implementation |
|-------------|---------------|
| Card data handling | Never touches our servers — Stripe Elements/Checkout |
| PCI DSS scope | SAQ A (fully delegated to Stripe) |
| Token storage | Only Stripe payment method IDs stored in our DB |
| Secure webhooks | Stripe signature verification on all webhook endpoints |

### 10.2 Fraud Prevention

| Measure | Implementation |
|---------|---------------|
| **Stripe Radar** | Built-in fraud detection on all payments |
| **3D Secure** | Enable for high-risk transactions |
| **Duplicate payment detection** | Idempotency keys on all payment intents |
| **Suspicious activity** | Flag: multiple failed payments, rapid account creation, unusual amounts |
| **Velocity limits** | Max 5 payment attempts per card per hour |

### 10.3 Financial Controls

| Control | Implementation |
|---------|---------------|
| **Audit trail** | All payment events logged with timestamps and user IDs |
| **Reconciliation** | Daily comparison of Stripe records vs internal DB |
| **Refund limits** | Max refund = original payment amount |
| **Payout holds** | Automatic hold on disputed payments |
