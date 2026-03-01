# API_REFERENCE.md

**HandyCall Platform API Documentation**

> **Last Updated**: 2025-12-26
> **Base URL**: `http://localhost:3000/api/v1`
> **Status**: Section 3 Complete - Core endpoints implemented

---

## 🔐 AUTHENTICATION

All authenticated endpoints require the `Authorization` header:
```
Authorization: Bearer {access_token}
```

### Register New Company

**POST** `/auth/register`

Creates a new company account with an owner user.

**Request Body:**
```json
{
  "company_name": "Joe's Handyman Services",
  "service_type": "HANDYMAN",
  "email": "joe@handyman.com",
  "password": "SecurePassword123!",
  "phone_number": "+15551234567",
  "first_name": "Joe",
  "last_name": "Smith",
  "timezone": "America/New_York"
}
```

**Response:** `RegisterResponse`
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": "uuid",
      "company_id": "uuid",
      "email": "joe@handyman.com",
      "first_name": "Joe",
      "last_name": "Smith",
      "role": "OWNER",
      "is_active": true,
      "created_at": 1703000000000,
      "updated_at": 1703000000000
    },
    "company": {
      "company_id": "uuid",
      "company_name": "Joe's Handyman Services",
      "service_type": "HANDYMAN",
      "phone_number": "+15551234567",
      "email": "joe@handyman.com",
      "status": "TRIAL",
      "timezone": "America/New_York",
      "business_hours": { ... },
      "created_at": 1703000000000,
      "updated_at": 1703000000000,
      "trial_ends_at": 1704209600000
    },
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG..."
  }
}
```

**Validation:**
- Email must be valid format
- Phone number must be E.164 format (+1234567890)
- Password minimum 8 characters
- Timezone must be valid IANA timezone

**Error Codes:**
- `409` - Company with email or phone already exists
- `400` - Invalid input format

---

### Login

**POST** `/auth/login`

Authenticate existing user.

**Request Body:**
```json
{
  "email": "joe@handyman.com",
  "password": "SecurePassword123!"
}
```

**Response:** `LoginResponse`
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "company": { ... },
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "expires_in": 3600
  }
}
```

**Error Codes:**
- `401` - Invalid credentials
- `401` - User account inactive
- `401` - Company account suspended/cancelled

---

### Refresh Token

**POST** `/auth/refresh`

Get a new access token using refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbG..."
}
```

**Response:** `RefreshTokenResponse`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbG...",
    "expires_in": 3600
  }
}
```

**Error Codes:**
- `401` - Invalid or expired refresh token

---

## 🏢 COMPANIES

### Get My Company

**GET** `/companies/me`

Get the authenticated user's company details.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:** `Company`
```json
{
  "success": true,
  "data": {
    "company_id": "uuid",
    "company_name": "Joe's Handyman Services",
    "service_type": "HANDYMAN",
    "phone_number": "+15551234567",
    "email": "joe@handyman.com",
    "status": "TRIAL",
    "timezone": "America/New_York",
    "business_hours": {
      "monday": { "open": "09:00", "close": "17:00" },
      "tuesday": { "open": "09:00", "close": "17:00" },
      ...
    },
    "created_at": 1703000000000,
    "updated_at": 1703000000000,
    "trial_ends_at": 1704209600000
  }
}
```

---

### Update My Company

**PUT** `/companies/me`

Update company settings.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Request Body:**
```json
{
  "company_name": "Joe's Professional Handyman",
  "phone_number": "+15559876543",
  "timezone": "America/Los_Angeles",
  "business_hours": {
    "monday": { "open": "08:00", "close": "18:00" },
    ...
  }
}
```

**Response:** `Company` (updated)

**Error Codes:**
- `404` - Company not found

---

## 📊 ADDITIONAL ENDPOINTS (To Be Implemented)

The following endpoints are scaffolded and ready for implementation:

### Contacts/Leads
- `GET /contacts` - List all contacts
- `POST /contacts` - Create new contact
- `GET /contacts/:id` - Get contact details
- `PUT /contacts/:id` - Update contact

### Calls
- `GET /calls` - List all calls
- `GET /calls/:id` - Get call details with transcript

### Appointments
- `GET /appointments` - List appointments
- `POST /appointments` - Create appointment
- `PUT /appointments/:id` - Update appointment

### Knowledge Base
- `GET /knowledge-items` - List knowledge items
- `POST /knowledge-items` - Create knowledge item
- `PUT /knowledge-items/:id` - Update knowledge item
- `DELETE /knowledge-items/:id` - Delete knowledge item

### Flagged Questions
- `GET /flagged-questions` - List pending questions
- `PUT /flagged-questions/:id/resolve` - Answer and resolve question

### Dashboard
- `GET /dashboard/stats` - Get dashboard statistics

### Agent Config
- `GET /agent-config` - Get AI agent configuration
- `PUT /agent-config` - Update AI agent settings

### Realtime Tools (Server-to-Server)
These endpoints are used by the OpenAI Realtime SIP controller (not the web dashboard). They are **public** but protected by `x-handycall-tools-key`.

- `POST /tenant/resolve` - Resolve tenant config for a dialed number
- `POST /tools/create_lead` - Create/update contact + call record for an inbound call
- `POST /tools/save_call` - Persist transcript/summary + collected fields for a completed call

---

## 🔔 NOTIFICATIONS (Implemented)

### Notification event catalog
- `GET /notifications/events`

Returns all configurable notification event keys and labels.

### Notification preferences
- `GET /notifications/preferences`
- `PUT /notifications/preferences`

Store per-user toggles for `in_app` and `push` channels.

### Notification inbox
- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/:notificationId/read`
- `POST /notifications/read-all`

### Device registration (iOS/APNs)
- `POST /notifications/devices`
- `DELETE /notifications/devices/:deviceId`

Registers APNs device tokens for push delivery.

### Webhooks (CRM/Automation)
Generic outbound webhooks for CRM sync (Zapier/Make/n8n/custom).

- `GET /webhooks/events` - List supported webhook event types
- `GET /webhooks/config` - Get current webhook configuration
- `PUT /webhooks/config` - Create/update webhook configuration
- `POST /webhooks/test` - Send a test webhook delivery
- `POST /webhooks/rotate-secret` - Rotate signing secret

---

## 📐 STANDARD RESPONSE FORMAT

All API responses follow this structure:

```json
{
  "success": boolean,
  "data": any,
  "error": {
    "code": string,
    "message": string
  },
  "meta": {
    "timestamp": number,
    "request_id": string,
    "pagination": {
      "total": number,
      "page": number,
      "page_size": number,
      "has_next": boolean,
      "has_prev": boolean
    }
  }
}
```

---

## 🔒 AUTHORIZATION & SCOPING

### Company-Scoped Access
All API requests automatically scope to the authenticated user's `company_id`. Users cannot access data from other companies.

### Role-Based Access Control (Future)
- `OWNER` - Full access to all company data and settings
- `ADMIN` - Manage users, view all data
- `STAFF` - View assigned data only

---

## ⚠️ ERROR CODES

| Code | Description |
|------|-------------|
| `AUTH001` | Invalid credentials |
| `AUTH002` | Token expired |
| `AUTH003` | Insufficient permissions |
| `VAL001` | Invalid input |
| `VAL002` | Missing required field |
| `BIZ001` | Resource not found |
| `BIZ002` | Duplicate resource |
| `BIZ003` | Operation not allowed |
| `SYS001` | Internal server error |

---

## 🧪 TESTING

### Using curl

**Register:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Company",
    "service_type": "HANDYMAN",
    "email": "test@example.com",
    "password": "TestPassword123!",
    "phone_number": "+15551234567",
    "first_name": "Test",
    "last_name": "User",
    "timezone": "America/New_York"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

**Get Company (Authenticated):**
```bash
curl -X GET http://localhost:3000/api/v1/companies/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

**End of API_REFERENCE.md**
