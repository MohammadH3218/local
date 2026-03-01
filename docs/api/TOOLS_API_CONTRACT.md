# HandyCall Voice Bridge & Realtime Tools API Contract

This document defines the tool definitions (for OpenAI Realtime) and the corresponding backend API endpoints.

## Base URL
`POST {BACKEND_URL}/tools/{tool_name}`

## headers
- `Content-Type`: `application/json`
- `x-handycall-tools-key`: `{YOUR_SECRET_KEY}`

---

## 1. Tool: `check_service_area`

**Description:** Check whether the company services the provided ZIP code.

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "check_service_area",
  "description": "Check whether the company services the provided ZIP code.",
  "parameters": {
    "type": "object",
    "properties": {
      "zip": { "type": "string" }
    },
    "required": ["zip"]
  }
}
```

**Backend Endpoint:** `POST /tools/check_service_area`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "zip": "90210"
}
```

**Response:**
```json
{
  "eligible": true,
  "message": "We service that area."
}
```
OR
```json
{
  "eligible": false,
  "message": "Sorry, we do not service 90210."
}
```

---

## 2. Tool: `list_appointments_by_phone`

**Description:** List caller appointments (for "what did I book last time?" or reschedule/cancel context).

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "list_appointments_by_phone",
  "description": "List caller appointments.",
  "parameters": {
    "type": "object",
    "properties": {
      "range_days": { "type": "number", "description": "Default 90" }
    },
    "required": []
  }
}
```

**Backend Endpoint:** `POST /tools/list_appointments_by_phone`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "phone": "+15551234567",
  "range_days": 90
}
```

**Response:**
```json
[
  {
    "appointment_id": "appt_abc",
    "start_time": "2025-02-15T14:00:00Z",
    "service_type": "Plumbing",
    "status": "confirmed"
  }
]
```

---

## 3. Tool: `cancel_appointment`

**Description:** Cancel an appointment.

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "cancel_appointment",
  "description": "Cancel an appointment.",
  "parameters": {
    "type": "object",
    "properties": {
      "appointment_id": { "type": "string" },
      "reason": { "type": "string" }
    },
    "required": ["appointment_id"]
  }
}
```

**Backend Endpoint:** `POST /tools/cancel_appointment`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "appointment_id": "appt_abc",
  "reason": "Customer needs to reschedule"
}
```

**Response:**
```json
{ "ok": true, "appointment_id": "appt_abc", "status": "cancelled" }
```

---

## 4. Tool: `reschedule_appointment`

**Description:** Reschedule an appointment.

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "reschedule_appointment",
  "description": "Reschedule an appointment.",
  "parameters": {
    "type": "object",
    "properties": {
      "appointment_id": { "type": "string" },
      "new_start_time": { "type": "string" },
      "timezone": { "type": "string" }
    },
    "required": ["appointment_id", "new_start_time", "timezone"]
  }
}
```

**Backend Endpoint:** `POST /tools/reschedule_appointment`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "appointment_id": "appt_abc",
  "new_start_time": "2025-02-16T10:00:00",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{ "ok": true, "appointment_id": "appt_abc", "new_start_time": "...", "status": "confirmed" }
```

---

## 5. Tool: `get_availability`

**Description:** Find available slots.

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "get_availability",
  "parameters": {
    "type": "object",
    "properties": {
      "start_time": { "type": "string" },
      "end_time": { "type": "string" },
      "timezone": { "type": "string" }
    }
  }
}
```

**Backend Endpoint:** `POST /tools/get_availability`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "start_time": "2025-02-15",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "slots": ["2025-02-15T09:00:00", "2025-02-15T10:00:00"],
  "timezone": "America/New_York",
  "spoken_availability": "I have 9am or 10am."
}
```

---

## 6. Tool: `create_booking`

**Description:** Create a booking. Requires confirmation.

**OpenAI Tool Definition:**
```json
{
  "type": "function",
  "name": "create_booking",
  "parameters": {
    "type": "object",
    "properties": {
      "full_name": { "type": "string" },
      "start_time": { "type": "string" },
      "timezone": { "type": "string" },
      "confirmed": { "type": "boolean" }
    },
    "required": ["full_name", "start_time", "confirmed"]
  }
}
```

**Backend Endpoint:** `POST /tools/create_booking`

**Request Body:**
```json
{
  "company_id": "cmp_123",
  "full_name": "John Doe",
  "start_time": "2025-02-15T09:00:00",
  "timezone": "America/New_York",
  "confirmed": true
}
```

**Response:**
```json
{ "ok": true, "appointment_id": "appt_xyz" }
```
