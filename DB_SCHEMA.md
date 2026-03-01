# DB_SCHEMA.md

**DynamoDB Table Designs for HandyCall Platform**

> **Last Updated**: 2025-12-26
> **Status**: Design Complete - Implementation Pending

---

## 🎯 DESIGN PRINCIPLES

### Multi-Tenancy Strategy
- **Every table** includes `company_id` as part of the primary key or as a filterable attribute
- **All queries** must filter by `company_id` at the application layer
- **No cross-tenant data leakage** is possible

### Table Strategy
- **Multi-table design** (not single-table) for:
  - Clear separation of concerns
  - Easier access control
  - Better cost management per entity type
  - Simpler backup/restore strategies

### Key Patterns
- **PK (Partition Key)**: Usually `company_id` or composite like `company_id#entity_id`
- **SK (Sort Key)**: For ordering, timestamps, or entity types
- **GSIs**: For alternate access patterns (by email, phone, date ranges)

### Naming Convention
- Table Prefix: `handycall_{env}_` (e.g., `handycall_dev_`, `handycall_prod_`)
- All timestamps in **milliseconds** (Unix epoch)
- All IDs are **UUIDs v4**

---

## 📊 TABLE DESIGNS

## 1. Companies Table

**Table Name**: `handycall_{env}_companies`

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  company_name: string;
  service_type: string;        // HANDYMAN, PEST_CONTROL, etc.
  phone_number: string;        // E.164 format
  email: string;
  status: string;              // ACTIVE, INACTIVE, SUSPENDED, TRIAL, CANCELLED
  trial_used_at?: number;      // first Pro trial start timestamp (ms)
  timezone: string;            // IANA timezone
  business_hours: object;      // BusinessHours type
  call_handling_mode?: string; // ALWAYS, MISSED, AFTER_HOURS
  created_at: number;          // Unix timestamp (ms)
  updated_at: number;
  subscription_tier?: string;
  trial_ends_at?: number;
}
```

### GSIs
**GSI1: email-index**
- PK: `email`
- Purpose: Look up company by email during registration

**GSI2: phone-index**
- PK: `phone_number`
- Purpose: Look up company by phone number

### Access Patterns
1. Get company by ID → `GetItem(company_id)`
2. Get company by email → `Query GSI1 (email = ?)`
3. Get company by phone → `Query GSI2 (phone_number = ?)`
4. Update company settings → `UpdateItem(company_id)`

---

## 1b. Company Numbers Table (Inbound DID Routing)

**Table Name**: `handycall_{env}_company_numbers`

Use this table to map an inbound phone number (DID) to a tenant (`company_id`) for telephony providers (Connect, Twilio SIP trunking, etc.).

### Attributes
```typescript
{
  did_e164: string;     // E.164 (PK)
  company_id: string;   // tenant
  provider?: string;    // CONNECT | TWILIO | OTHER
  label?: string;       // optional friendly label
  created_at: number;
  updated_at: number;
}
```

### GSIs
**GSI1: company-index**
- PK: `company_id`
- Purpose: list all inbound numbers for a company

### Access Patterns
1. Resolve tenant by DID → `GetItem(did_e164)`
2. List numbers for company → `Query GSI1 (company_id = ?)`

---

## 2. Users Table

**Table Name**: `handycall_{env}_users`

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  user_id: string;             // UUID (SK)
  email: string;
  password_hash: string;       // bcrypt hash
  phone_number?: string;
  first_name: string;
  last_name: string;
  role: string;                // OWNER, ADMIN, STAFF
  is_active: boolean;
  created_at: number;
  updated_at: number;
  last_login_at?: number;
}
```

### GSIs
**GSI1: email-index**
- PK: `email`
- Purpose: Login by email (global lookup)

### Access Patterns
1. Get all users for company → `Query(company_id)`
2. Get user by ID → `GetItem(company_id, user_id)`
3. Get user by email (login) → `Query GSI1 (email = ?)`
4. Update user → `UpdateItem(company_id, user_id)`
5. List company staff → `Query(company_id) + filter(role)`

---

## 3. Contacts Table

**Table Name**: `handycall_{env}_contacts`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `contact_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  contact_id: string;          // UUID (SK)
  phone_number: string;        // E.164
  email?: string;
  first_name?: string;
  last_name?: string;
  source: string;              // INBOUND_CALL, INBOUND_SMS, MANUAL
  lead_status: string;         // NEW, CONTACTED, QUALIFIED, CONVERTED, LOST
  notes?: string;
  created_at: number;
  updated_at: number;
  last_contact_at?: number;
}
```

### GSIs
**GSI1: phone-lookup**
- PK: `company_id`
- SK: `phone_number`
- Purpose: Find contact by phone number within company

**GSI2: status-index**
- PK: `company_id`
- SK: `lead_status#created_at`
- Purpose: Query contacts by status, ordered by date

### Access Patterns
1. List all contacts for company → `Query(company_id)`
2. Get contact by ID → `GetItem(company_id, contact_id)`
3. Find contact by phone → `Query GSI1 (company_id, phone_number)`
4. List contacts by status → `Query GSI2 (company_id, lead_status#*)`
5. Update contact → `UpdateItem(company_id, contact_id)`

---

## 4. Calls Table

**Table Name**: `handycall_{env}_calls`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `call_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  call_id: string;             // UUID (SK)
  contact_id?: string;         // UUID reference
  direction: string;           // INBOUND, OUTBOUND
  from_number: string;         // E.164
  to_number: string;           // E.164
  status: string;              // COMPLETED, FAILED, NO_ANSWER, etc.
  intent?: string;             // QUESTION, BOOKING, EMERGENCY, etc.
  duration_seconds?: number;
  recording_url?: string;      // S3 presigned URL
  transcript_url?: string;     // S3 key
  summary?: string;
  ai_handled: boolean;
  escalated: boolean;
  appointment_created?: boolean;
  lead_captured?: boolean;
  started_at: number;          // Unix timestamp (ms)
  ended_at?: number;
  created_at: number;
}
```

### GSIs
**GSI1: date-index**
- PK: `company_id`
- SK: `started_at`
- Purpose: Query calls by date range

**GSI2: contact-calls**
- PK: `company_id#contact_id`
- SK: `started_at`
- Purpose: Get all calls for a specific contact

**GSI3: ai-handled-index**
- PK: `company_id`
- SK: `ai_handled#started_at`
- Purpose: Filter calls by AI handling status

### Access Patterns
1. List all calls for company → `Query(company_id)`
2. Get call by ID → `GetItem(company_id, call_id)`
3. List calls by date range → `Query GSI1 (company_id, started_at BETWEEN x AND y)`
4. List calls for contact → `Query GSI2 (company_id#contact_id)`
5. List AI-handled calls → `Query GSI3 (company_id, ai_handled#*)`

---

## 5. CallHighlights Table

**Table Name**: `handycall_{env}_call_highlights`

### Primary Key
- **PK**: `company_id#call_id` (String)
- **SK**: `timestamp_seconds` (Number)

### Attributes
```typescript
{
  highlight_id: string;        // UUID
  call_id: string;             // UUID
  company_id: string;          // UUID
  timestamp_seconds: number;   // Position in call (SK)
  type: string;                // PRICING, APPOINTMENT, COMPLAINT, etc.
  description: string;
  created_at: number;
}
```

### Access Patterns
1. Get all highlights for call → `Query(company_id#call_id)`
2. Get highlights in order → `Query(company_id#call_id) ordered by SK`

---

## 6. Appointments Table

**Table Name**: `handycall_{env}_appointments`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `appointment_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  appointment_id: string;      // UUID (SK)
  contact_id: string;          // UUID reference
  call_id?: string;            // UUID reference (if created via call)
  scheduled_start: number;     // Unix timestamp (ms)
  scheduled_end: number;
  status: string;              // SCHEDULED, CONFIRMED, COMPLETED, etc.
  service_type: string;
  description?: string;
  address?: object;            // Address type
  notes?: string;
  created_by: string;          // AI or USER
  confirmed: boolean;
  created_at: number;
  updated_at: number;
}
```

### GSIs
**GSI1: date-index**
- PK: `company_id`
- SK: `scheduled_start`
- Purpose: Query appointments by date

**GSI2: contact-appointments**
- PK: `company_id#contact_id`
- SK: `scheduled_start`
- Purpose: Get all appointments for a contact

**GSI3: status-date**
- PK: `company_id`
- SK: `status#scheduled_start`
- Purpose: Filter by status and date

### Access Patterns
1. List all appointments → `Query(company_id)`
2. Get appointment by ID → `GetItem(company_id, appointment_id)`
3. List appointments by date range → `Query GSI1 (company_id, scheduled_start BETWEEN x AND y)`
4. List contact appointments → `Query GSI2 (company_id#contact_id)`
5. List by status → `Query GSI3 (company_id, status#*)`

---

## 7. KnowledgeItems Table

**Table Name**: `handycall_{env}_knowledge_items`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `knowledge_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  knowledge_id: string;        // UUID (SK)
  type: string;                // FAQ, SERVICE, POLICY, SAFETY, WARRANTY, etc.
  question: string;
  answer: string;
  status: string;              // ACTIVE, DRAFT, ARCHIVED
  created_by: string;          // user_id
  source?: string;             // MANUAL, FLAGGED_QUESTION, IMPORT
  use_count?: number;          // How many times retrieved
  last_used_at?: number;
  created_at: number;
  updated_at: number;
}
```

### GSIs
**GSI1: type-index**
- PK: `company_id`
- SK: `type#created_at`
- Purpose: Filter by knowledge type

**GSI2: status-index**
- PK: `company_id`
- SK: `status#updated_at`
- Purpose: Filter by status

### Access Patterns
1. List all knowledge items → `Query(company_id)`
2. Get knowledge by ID → `GetItem(company_id, knowledge_id)`
3. List by type → `Query GSI1 (company_id, type#*)`
4. List active items → `Query GSI2 (company_id, ACTIVE#*)`
5. Full-text search → Application-layer search through retrieved items

---

## 8. KnowledgeChunks Table

**Table Name**: `handycall_{env}_knowledge_chunks`

### Primary Key
- **PK**: `company_id#knowledge_id` (String)
- **SK**: `chunk_index` (Number)

### Attributes
```typescript
{
  chunk_id: string;            // UUID
  knowledge_id: string;        // UUID
  company_id: string;          // UUID
  chunk_text: string;
  embedding: number[];         // Vector embedding (1536 dimensions for Titan)
  chunk_index: number;         // Position in original (SK)
  created_at: number;
}
```

### GSIs
**GSI1: company-chunks**
- PK: `company_id`
- SK: `chunk_id`
- Purpose: Get all chunks for vector search scope

### Access Patterns
1. Get all chunks for knowledge item → `Query(company_id#knowledge_id)`
2. Vector search → Application-layer cosine similarity on `Query GSI1 (company_id)`
3. Delete chunks when KB deleted → `Query(company_id#knowledge_id) + BatchDelete`

**Note**: For production, consider using DynamoDB with a vector index library or migrating to AWS OpenSearch for true vector search.

---

## 9. FlaggedQuestions Table

**Table Name**: `handycall_{env}_flagged_questions`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `flagged_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  flagged_id: string;          // UUID (SK)
  call_id: string;             // UUID reference
  question_text: string;
  context?: string;            // Conversation context
  timestamp_in_call?: number;  // Seconds into call
  status: string;              // PENDING, ANSWERED, DISMISSED
  resolved_by?: string;        // user_id
  resolution_answer?: string;
  knowledge_item_created?: string; // knowledge_id if KB created
  created_at: number;
  resolved_at?: number;
}
```

### GSIs
**GSI1: status-index**
- PK: `company_id`
- SK: `status#created_at`
- Purpose: Filter pending questions

### Access Patterns
1. List all flagged questions → `Query(company_id)`
2. Get flagged question by ID → `GetItem(company_id, flagged_id)`
3. List pending questions → `Query GSI1 (company_id, PENDING#*)`
4. Resolve question → `UpdateItem(company_id, flagged_id)`

---

## 10. AgentConfigs Table

**Table Name**: `handycall_{env}_agent_configs`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: Not used (single config per company)

### Attributes
```typescript
{
  config_id: string;           // UUID
  company_id: string;          // UUID (PK)
  greeting_tone: string;       // PROFESSIONAL, FRIENDLY, CASUAL
  custom_greeting?: string;
  booking_mode: string;        // PROPOSE_TIMES, CALENDAR_BOOKING, INTERNAL_ONLY
  can_discuss_pricing: boolean;
  can_handle_emergencies: boolean;
  escalation_threshold: number; // 0-1 confidence threshold
  require_callback_confirmation: boolean;
  send_sms_summary: boolean;
  created_at: number;
  updated_at: number;
}
```

### Access Patterns
1. Get config for company → `GetItem(company_id)`
2. Update config → `UpdateItem(company_id)`

---

## 11. PricingRules Table

**Table Name**: `handycall_{env}_pricing_rules`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `pricing_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  pricing_id: string;          // UUID (SK)
  service_name: string;
  base_price?: number;
  price_range_min?: number;
  price_range_max?: number;
  unit?: string;               // "per hour", "flat rate"
  description: string;
  can_quote_exact: boolean;
  requires_inspection: boolean;
  created_at: number;
  updated_at: number;
}
```

### Access Patterns
1. List all pricing rules → `Query(company_id)`
2. Get pricing rule by ID → `GetItem(company_id, pricing_id)`
3. Update pricing → `UpdateItem(company_id, pricing_id)`
4. Delete pricing → `DeleteItem(company_id, pricing_id)`

---

## 12. SMS Table

**Table Name**: `handycall_{env}_sms`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `sms_id` (String) - UUID

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  sms_id: string;              // UUID (SK)
  contact_id?: string;         // UUID reference
  direction: string;           // INBOUND, OUTBOUND
  from_number: string;         // E.164
  to_number: string;           // E.164
  message_body: string;
  status: string;              // QUEUED, SENT, DELIVERED, FAILED
  ai_handled: boolean;
  call_id?: string;            // If part of call follow-up
  created_at: number;
  updated_at: number;
}
```

### GSIs
**GSI1: date-index**
- PK: `company_id`
- SK: `created_at`
- Purpose: Query SMS by date

**GSI2: contact-sms**
- PK: `company_id#contact_id`
- SK: `created_at`
- Purpose: Get SMS thread with contact

### Access Patterns
1. List all SMS → `Query(company_id)`
2. Get SMS by ID → `GetItem(company_id, sms_id)`
3. List SMS by date → `Query GSI1 (company_id, created_at BETWEEN x AND y)`
4. Get contact SMS thread → `Query GSI2 (company_id#contact_id)`

---

## 13. WebhookConfigs Table

**Table Name**: `handycall_{env}_webhook_configs`

### Primary Key
- **PK**: `company_id` (String)

### Attributes
```typescript
{
  company_id: string;         // UUID (PK)
  webhook_url: string;        // HTTPS endpoint provided by customer
  enabled_events: string[];   // contact.created, call.completed, etc.
  signing_secret: string;     // HMAC secret for signature verification
  is_enabled: boolean;
  created_at: number;
  updated_at: number;
  last_delivery_at?: number;
  last_success_at?: number;
  last_status_code?: number;
  last_error?: string;
  last_event?: string;
}
```

### Access Patterns
1. Get webhook config -> `GetItem(company_id)`
2. Update webhook config -> `UpdateItem(company_id)`

---

## 14. Notifications Table

**Table Name**: `handycall_{env}_notifications`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `notification_id` (String)

### Attributes
```typescript
{
  company_id: string;                  // UUID (PK)
  notification_id: string;             // UUID (SK)
  company_user: string;                // `${company_id}#${user_id}`
  user_id: string;                     // recipient user id
  event_key: string;                   // appointment_created, usage_threshold_75, etc.
  category: string;                    // APPOINTMENTS, CALLS, LEADS, USAGE, SYSTEM
  title: string;
  body: string;
  channels: string[];                  // IN_APP, PUSH
  is_read: boolean;
  read_at?: number;
  action_url?: string;
  payload?: Record<string, any>;
  created_at: number;
}
```

### GSIs
**GSI1: recipient-index**
- PK: `company_user`
- SK: `created_at`
- Purpose: Fetch notifications for one user in recency order

### Access Patterns
1. List user notifications -> `Query GSI1 (company_user)`
2. Mark single notification read -> `UpdateItem(company_id, notification_id)`
3. Mark all read -> `Query GSI1`, then batch `UpdateItem`

---

## 15. NotificationPreferences Table

**Table Name**: `handycall_{env}_notification_preferences`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `user_id` (String)

### Attributes
```typescript
{
  company_id: string;                             // UUID (PK)
  user_id: string;                                // UUID (SK)
  preferences: {
    [eventKey: string]: {
      in_app: boolean;
      push: boolean;
    }
  };
  created_at: number;
  updated_at: number;
}
```

### Access Patterns
1. Get user preference profile -> `GetItem(company_id, user_id)`
2. Update preference profile -> `PutItem(company_id, user_id)`

---

## 16. NotificationDevices Table

**Table Name**: `handycall_{env}_notification_devices`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `device_id` (String)

### Attributes
```typescript
{
  company_id: string;             // UUID (PK)
  device_id: string;              // app-generated stable id (SK)
  company_user: string;           // `${company_id}#${user_id}`
  user_id: string;
  platform: 'IOS';
  apns_token: string;
  apns_environment: 'sandbox' | 'production';
  push_enabled: boolean;
  is_active: boolean;
  app_version?: string;
  device_model?: string;
  locale?: string;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
}
```

### GSIs
**GSI1: user-index**
- PK: `company_user`
- SK: `updated_at`
- Purpose: List active devices for a single user quickly

### Access Patterns
1. Register/update device -> `PutItem(company_id, device_id)`
2. Soft-remove device -> `UpdateItem(company_id, device_id)`
3. List user devices -> `Query GSI1 (company_user)`

---

## 17. NotificationUsageAlerts Table

**Table Name**: `handycall_{env}_notification_usage_alerts`

### Primary Key
- **PK**: `company_id` (String)
- **SK**: `alert_key` (String)

### Attributes
```typescript
{
  company_id: string;          // UUID (PK)
  alert_key: string;           // `${period_start}:${metric}:${threshold}`
  period_start: number;
  metric: 'minutes' | 'sms' | 'contacts';
  threshold: number;           // 25, 50, 75, 90, 100
  created_at: number;
}
```

### Access Patterns
1. Deduplicate threshold alert emission -> `GetItem(company_id, alert_key)`
2. Record emitted alert marker -> `PutItem(company_id, alert_key)`

---

## 🔧 CAPACITY PLANNING

### Provisioned vs On-Demand
- **Development**: On-Demand mode (pay per request)
- **Production**: Start with On-Demand, monitor usage, consider Provisioned if consistent traffic

### Estimated Item Sizes
- Companies: ~1 KB
- Users: ~500 bytes
- Contacts: ~1 KB
- Calls: ~2 KB
- Appointments: ~1.5 KB
- KnowledgeItems: ~5 KB
- KnowledgeChunks: ~10 KB (due to embeddings)
- FlaggedQuestions: ~3 KB
- WebhookConfigs: ~1 KB
- Notifications: ~1 KB
- NotificationDevices: ~0.5 KB

### GSI Costs
- Each GSI doubles storage costs for projected items
- Consider GSI necessity vs application-layer filtering

---

## 🔐 SECURITY CONSIDERATIONS

### Row-Level Security
- **DynamoDB does not have built-in RLS**
- **Enforcement**: Application layer MUST filter all queries by `company_id`
- **IAM Policies**: Restrict backend service to only CRUD operations

### Data Encryption
- **At Rest**: Enable DynamoDB encryption (AWS-managed keys)
- **In Transit**: All connections use TLS 1.2+

### Backup Strategy
- **Point-in-Time Recovery**: Enabled for all tables
- **Retention**: 35 days
- **Manual Snapshots**: Weekly for production

---

## 📝 MIGRATION NOTES

### Table Creation Order
1. Companies (no dependencies)
2. Users (depends on Companies)
3. Contacts (independent)
4. Calls (independent)
5. CallHighlights (depends on Calls)
6. Appointments (depends on Contacts)
7. KnowledgeItems (independent)
8. KnowledgeChunks (depends on KnowledgeItems)
9. FlaggedQuestions (depends on Calls)
10. AgentConfigs (depends on Companies)
11. PricingRules (independent)
12. SMS (independent)
13. WebhookConfigs (depends on Companies)

### Seed Data Requirements
- At least 1 test company
- 1 owner user per company
- Sample knowledge items
- Sample contacts
- Agent config with defaults

---

**End of DB_SCHEMA.md**




