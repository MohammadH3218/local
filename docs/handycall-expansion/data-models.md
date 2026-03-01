# HandyCall.ai — Data Models

> Complete data model specifications for the expanded platform. Covers existing tables (with extensions) and new tables.

---

## 1. Database Strategy

### 1.1 Current: DynamoDB (17+ tables)

All existing tables are retained. The expansion adds new tables and extends existing ones with new attributes. DynamoDB's schemaless nature makes adding fields non-breaking.

### 1.2 New: Amazon OpenSearch

Added specifically for marketplace search. Not a replacement for DynamoDB — it's a read-optimized search index synced via DynamoDB Streams.

### 1.3 Naming Convention

- Table prefix: `${DYNAMODB_TABLE_PREFIX}${table_name}` (e.g., `handycall_prod_companies`)
- IDs: UUID v4
- Timestamps: Unix epoch milliseconds
- Phone numbers: E.164 format (+1XXXXXXXXXX)
- Booleans: true/false (not 0/1)

---

## 2. Existing Tables — Extensions

### 2.1 Companies (Extended)

**Existing PK:** `company_id`

**New attributes for marketplace:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `public_profile_enabled` | boolean | Whether provider appears in marketplace search |
| `public_slug` | string | URL-friendly unique identifier (e.g., "mikes-plumbing-austin") |
| `public_description` | string | Long-form bio for public profile |
| `profile_photo_url` | string | S3 URL for profile photo |
| `cover_photo_url` | string | S3 URL for cover/banner photo |
| `gallery_urls` | string[] | Array of S3 URLs for work gallery |
| `overall_rating` | number | Cached average rating (1.0–5.0) |
| `total_reviews` | number | Cached total review count |
| `response_time_minutes` | number | Cached average response time |
| `verified` | boolean | Admin-verified provider |
| `verification_date` | number | When verification was granted |
| `badges` | string[] | Achievement badges ("top_rated", "quick_responder", "established") |
| `service_area_geo` | map | `{ lat: number, lng: number, radius_miles: number }` |
| `license_number` | string | Business license (optional) |
| `insurance_provider` | string | Insurance info (optional) |
| `insurance_expiry` | number | Insurance expiration date |
| `team_size` | number | Current team member count |
| `founded_year` | number | Year business started |
| `marketplace_joined` | number | When they joined marketplace |

**New GSIs:**
- `slug-index`: PK = `public_slug` → fast lookup by slug
- `marketplace-index`: PK = `public_profile_enabled`, SK = `overall_rating` → list public providers

### 2.2 Users (Extended)

**Existing PK:** `company_id`, **SK:** `user_id`

**New attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `account_type` | string | `pro`, `customer`, `employee` |
| `permissions` | string[] | For employees: array of ProPermission enums |
| `team_role` | string | `owner`, `dispatcher`, `technician`, `admin` |
| `last_active` | number | Last login/activity timestamp |
| `avatar_url` | string | Profile photo URL |

### 2.3 Contacts (Extended)

**Existing PK:** `company_id`, **SK:** `contact_id`

**New attributes for richer CRM:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `customer_user_id` | string | Link to customer account (if they have one) |
| `lead_score` | number | 0–100 quality score |
| `lead_source` | string | `ai_call`, `website`, `referral`, `marketplace`, `manual` |
| `total_bookings` | number | Cached booking count |
| `total_spent` | number | Cached total revenue from this contact |
| `last_booking_date` | number | Most recent booking timestamp |
| `preferred_contact_method` | string | `phone`, `sms`, `email` |
| `do_not_contact` | boolean | Opt-out flag |
| `custom_tags` | string[] | Pro-defined tags |

### 2.4 Appointments (Extended)

**Existing PK:** `company_id`, **SK:** `appointment_id`

**New attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `customer_user_id` | string | Link to customer account |
| `booking_source` | string | `ai_call`, `public_link`, `marketplace`, `manual`, `recurring` |
| `review_requested` | boolean | Whether review request was sent |
| `review_id` | string | Link to review (if submitted) |
| `payment_id` | string | Link to payment record |
| `payment_status` | string | `pending`, `paid`, `refunded` |
| `recurring_subscription_id` | string | If part of a subscription |
| `technician_user_id` | string | Assigned team member |
| `customer_rating` | number | Quick post-job rating (1–5) |
| `completion_notes` | string | Pro's notes after job |
| `completion_photos` | string[] | S3 URLs of completed work |

---

## 3. New Tables

### 3.1 CustomerProfiles

**Purpose:** Customer account data (separate from pro contacts).

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `customer_id` | string | PK | UUID, matches Cognito user_id |
| `email` | string | | Primary email |
| `phone` | string | | Phone number (E.164) |
| `first_name` | string | | |
| `last_name` | string | | |
| `display_name` | string | | Public display name for reviews |
| `avatar_url` | string | | Profile photo S3 URL |
| `default_location` | map | | `{ address, city, state, zip, lat, lng }` |
| `saved_addresses` | list | | Array of saved service addresses |
| `default_payment_method_id` | string | | Stripe payment method ID |
| `stripe_customer_id` | string | | Stripe customer ID |
| `notification_preferences` | map | | `{ email: bool, sms: bool, push: bool }` |
| `total_bookings` | number | | Cached booking count |
| `total_spent` | number | | Cached total spend |
| `member_since` | number | | Account creation date |
| `last_active` | number | | Last login/activity |
| `status` | string | | `active`, `suspended`, `deleted` |
| `created_at` | number | | |
| `updated_at` | number | | |

**GSIs:**
- `email-index`: PK = `email` → lookup by email
- `phone-index`: PK = `phone` → lookup by phone
- `stripe-index`: PK = `stripe_customer_id`

### 3.2 Reviews

**Purpose:** Customer reviews for marketplace providers.

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `provider_company_id` | string | PK | The reviewed company |
| `review_id` | string | SK | UUID |
| `customer_user_id` | string | | Reviewer's customer_id |
| `customer_display_name` | string | | Denormalized for display |
| `booking_id` | string | | Linked appointment |
| `service_type` | string | | ServiceType enum |
| `rating` | number | | 1–5 stars |
| `title` | string | | Review title (optional) |
| `comment` | string | | Review body text |
| `photos` | string[] | | Review photo URLs |
| `pro_response` | string | | Provider's reply |
| `pro_response_at` | number | | When pro responded |
| `reported` | boolean | | Flagged by user/pro |
| `report_reason` | string | | Why flagged |
| `visible` | boolean | | Admin moderation status |
| `helpful_count` | number | | "Helpful" votes |
| `created_at` | number | | |
| `updated_at` | number | | |

**GSIs:**
- `customer-reviews-index`: PK = `customer_user_id`, SK = `created_at` → "My Reviews"
- `rating-index`: PK = `provider_company_id`, SK = `rating` → filter by star rating
- `moderation-index`: PK = `reported#visible`, SK = `created_at` → admin moderation queue

### 3.3 CustomerBookings

**Purpose:** Customer-side view of bookings (links customer to appointment across multiple providers).

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `customer_id` | string | PK | Customer account ID |
| `booking_id` | string | SK | UUID (same as appointment_id on provider side) |
| `provider_company_id` | string | | Which provider |
| `provider_name` | string | | Denormalized for display |
| `service_type` | string | | ServiceType |
| `service_description` | string | | Specific job description |
| `status` | string | | `pending`, `confirmed`, `in_progress`, `completed`, `cancelled` |
| `scheduled_start` | number | | Appointment start (UTC ms) |
| `scheduled_end` | number | | Appointment end (UTC ms) |
| `actual_start` | number | | When pro actually started |
| `actual_end` | number | | When job completed |
| `address` | map | | Service location |
| `total_price` | number | | Price in cents |
| `payment_status` | string | | `unpaid`, `paid`, `refunded`, `partial_refund` |
| `payment_id` | string | | Stripe payment intent ID |
| `review_submitted` | boolean | | Whether customer left a review |
| `notes` | string | | Customer notes for the job |
| `created_at` | number | | |
| `updated_at` | number | | |

**GSIs:**
- `status-date-index`: PK = `customer_id#status`, SK = `scheduled_start` → filter by status
- `provider-index`: PK = `provider_company_id`, SK = `scheduled_start` → provider's customer bookings

### 3.4 CustomerSubscriptions

**Purpose:** Recurring service subscriptions (e.g., monthly pest control, weekly cleaning).

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `customer_id` | string | PK | Customer account ID |
| `subscription_id` | string | SK | UUID |
| `provider_company_id` | string | | Service provider |
| `provider_name` | string | | Denormalized |
| `service_type` | string | | ServiceType |
| `frequency` | string | | `weekly`, `biweekly`, `monthly`, `quarterly`, `annual` |
| `price_per_occurrence` | number | | Price in cents |
| `next_scheduled_date` | number | | Next service date (UTC ms) |
| `auto_schedule` | boolean | | Whether to auto-create appointments |
| `stripe_subscription_id` | string | | Stripe subscription ID (if recurring billing) |
| `status` | string | | `active`, `paused`, `cancelled`, `expired` |
| `start_date` | number | | Subscription start |
| `end_date` | number | | If applicable (fixed-term) |
| `cancelled_at` | number | | When cancelled |
| `pause_until` | number | | If paused, resume date |
| `total_occurrences` | number | | Count of completed services |
| `created_at` | number | | |
| `updated_at` | number | | |

**GSIs:**
- `provider-sub-index`: PK = `provider_company_id`, SK = `status` → provider's subscribers
- `next-date-index`: PK = `status`, SK = `next_scheduled_date` → scheduler processing

### 3.5 Messages (In-App)

**Purpose:** Platform messaging between customers and pros.

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `thread_id` | string | PK | `${customer_id}#${company_id}` |
| `message_id` | string | SK | UUID (ULID preferred for sort) |
| `sender_type` | string | | `customer`, `pro`, `system` |
| `sender_id` | string | | User ID of sender |
| `sender_name` | string | | Display name |
| `content` | string | | Message text |
| `message_type` | string | | `text`, `booking_link`, `payment_link`, `image`, `system` |
| `metadata` | map | | Booking ID, payment info, etc. |
| `read_by_customer` | boolean | | |
| `read_by_pro` | boolean | | |
| `created_at` | number | | |

**GSIs:**
- `customer-threads-index`: PK = `customer_id`, SK = `last_message_at` → customer's thread list
- `company-threads-index`: PK = `company_id`, SK = `last_message_at` → pro's thread list

**Thread metadata table (separate):**

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `thread_id` | string | PK | Same as Messages PK |
| `customer_id` | string | | |
| `company_id` | string | | |
| `customer_name` | string | | Denormalized |
| `company_name` | string | | Denormalized |
| `last_message_preview` | string | | First 100 chars of last message |
| `last_message_at` | number | | For sorting |
| `unread_count_customer` | number | | |
| `unread_count_pro` | number | | |
| `related_booking_id` | string | | Optional booking context |
| `status` | string | | `active`, `archived` |

### 3.6 QuoteRequests

**Purpose:** Customer requests for quotes (marketplace flow — customer describes job, pros respond).

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `request_id` | string | PK | UUID |
| `customer_id` | string | | |
| `service_type` | string | | ServiceType |
| `description` | string | | Job description |
| `location` | map | | `{ address, city, state, zip, lat, lng }` |
| `photos` | string[] | | S3 URLs of job photos |
| `preferred_dates` | string[] | | Preferred date ranges |
| `budget_range` | map | | `{ min: number, max: number }` (cents) |
| `urgency` | string | | `flexible`, `this_week`, `today`, `emergency` |
| `status` | string | | `open`, `quoted`, `booked`, `expired`, `cancelled` |
| `matched_providers` | string[] | | Company IDs matched by algorithm |
| `quotes_received` | number | | Count of quotes submitted |
| `selected_quote_id` | string | | Which quote was accepted |
| `created_at` | number | | |
| `expires_at` | number | | Auto-expire after 7 days |
| `updated_at` | number | | |

**GSIs:**
- `customer-requests-index`: PK = `customer_id`, SK = `created_at`
- `status-index`: PK = `status`, SK = `created_at` → processing queue
- `location-index`: PK = `state#service_type`, SK = `created_at` → provider matching

### 3.7 Quotes

**Purpose:** Pro responses to quote requests.

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `request_id` | string | PK | Links to QuoteRequest |
| `quote_id` | string | SK | UUID |
| `provider_company_id` | string | | Quoting company |
| `provider_name` | string | | Denormalized |
| `price` | number | | Quote amount in cents |
| `description` | string | | What's included |
| `estimated_duration` | string | | e.g., "2-3 hours" |
| `available_dates` | string[] | | When pro can do the work |
| `notes` | string | | Additional notes |
| `status` | string | | `pending`, `accepted`, `declined`, `expired` |
| `created_at` | number | | |
| `expires_at` | number | | Auto-expire |

**GSIs:**
- `provider-quotes-index`: PK = `provider_company_id`, SK = `created_at`

### 3.8 SearchIndex (OpenSearch)

**Not a DynamoDB table — this is the OpenSearch index structure.**

```json
{
  "mappings": {
    "properties": {
      "company_id": { "type": "keyword" },
      "company_name": { "type": "text", "analyzer": "standard" },
      "public_slug": { "type": "keyword" },
      "description": { "type": "text" },
      "categories": { "type": "keyword" },
      "location": { "type": "geo_point" },
      "city": { "type": "text" },
      "state": { "type": "keyword" },
      "zip": { "type": "keyword" },
      "overall_rating": { "type": "float" },
      "total_reviews": { "type": "integer" },
      "response_time_minutes": { "type": "integer" },
      "verified": { "type": "boolean" },
      "badges": { "type": "keyword" },
      "min_price": { "type": "integer" },
      "services_offered": { "type": "text" },
      "profile_photo_url": { "type": "keyword", "index": false },
      "public_profile_enabled": { "type": "boolean" },
      "subscription_status": { "type": "keyword" },
      "last_active": { "type": "date", "format": "epoch_millis" }
    }
  }
}
```

---

## 4. Data Relationships Diagram

```
                    CustomerProfiles
                         │
              ┌──────────┼──────────────┐
              │          │              │
        CustomerBookings Reviews  CustomerSubscriptions
              │          │              │
              │          │              │
              ▼          ▼              ▼
         Appointments  Companies ◄── CustomerSubscriptions
              │          │
              │     ┌────┼─────────┐
              │     │    │         │
              ▼     ▼    ▼         ▼
           Contacts Users  AgentConfigs
              │              │
         ┌────┼────┐         │
         │         │    PricingRules
       Calls    Messages
                    │
              KnowledgeItems
                    │
              KnowledgeChunks

  QuoteRequests ◄──── Quotes
       │
  (matched_providers → Companies)

  Messages (in-app) ─── MessageThreads
```

---

## 5. Data Migration Notes

### 5.1 Non-Breaking Changes

All extensions to existing tables add new attributes — existing records simply won't have these fields until updated. DynamoDB's schemaless nature means no migration is needed for existing data.

### 5.2 Backfill Requirements

| Table | Backfill | Trigger |
|-------|----------|---------|
| Companies | Set `public_profile_enabled: false` for all existing | Phase 3 (marketplace launch) |
| Companies | Generate `public_slug` from company name | Phase 3 |
| Companies | Calculate initial `overall_rating` from existing reviews | Phase 3 |
| Users | Set `account_type: 'pro'` for all existing users | Phase 1 |
| Appointments | Set `booking_source: 'legacy'` for existing | Phase 2 |

### 5.3 New GSI Creation

New GSIs can be added to existing DynamoDB tables without downtime. Create them before deploying code that queries them. Allow index backfill to complete (minutes to hours depending on table size).
