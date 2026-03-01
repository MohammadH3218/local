# iOS App + Notifications Implementation Guide

## What was added

### Backend
- New `NotificationsModule` with:
  - `GET /notifications/events`
  - `GET /notifications/preferences`
  - `PUT /notifications/preferences`
  - `GET /notifications`
  - `GET /notifications/unread-count`
  - `POST /notifications/:notificationId/read`
  - `POST /notifications/read-all`
  - `POST /notifications/devices`
  - `DELETE /notifications/devices/:deviceId`
- Domain events now trigger notifications through `WebhooksService.emitEvent(...)`.
- Usage threshold notifications are emitted automatically from usage updates at:
  - `25%`, `50%`, `75%`, `90%`, `100%`

### iOS
- New SwiftUI scaffold under `apps/ios/HandyCallApp/Sources`
- Includes:
  - Auth flow
  - Dashboard
  - Appointments, Calls, Leads
  - Notifications inbox
  - Notification settings page with Save button + toast
  - APNs registration manager

## New DynamoDB tables

Add these tables in each environment:
- `notification_preferences`
- `notifications`
- `notification_devices`
- `notification_usage_alerts`

`scripts/create-dynamodb-tables.sh` was updated to include all of them.

## APNs backend environment variables

Set in backend runtime:
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY` (or `APNS_PRIVATE_KEY_BASE64`)

If these are missing, in-app notifications still work but push delivery is skipped.

### Parameter Store fallback (recommended)

Backend now also supports loading APNs values from SSM Parameter Store (when `USE_PARAMETER_STORE=true`):
- `/handycall/apns/key-id`
- `/handycall/apns/team-id`
- `/handycall/apns/bundle-id`
- `/handycall/apns/private-key` (SecureString)

Use:
- `scripts/set-apns-parameters.sh`

Example:
```bash
AWS_PROFILE=handycall-dev AWS_REGION=us-east-1 \
APNS_KEY_ID="<apple-key-id>" \
APNS_TEAM_ID="<apple-team-id>" \
APNS_BUNDLE_ID="<ios-bundle-id>" \
APNS_PRIVATE_KEY_FILE="/path/to/AuthKey_XXXXXXXXXX.p8" \
./scripts/set-apns-parameters.sh
```

## Suggested rollout

1. Deploy backend with new notification endpoints.
2. Create new DynamoDB tables.
3. Verify login + notifications feed in a staging build.
4. Enable APNs key variables and test push on physical devices.
5. Submit TestFlight build and validate App Review checklist.

## App Review checklist (must-pass items)

- Provide account deletion path in-app if accounts can be created.
- Ensure notification permission prompt appears in context (not immediately on launch without explanation).
- Include privacy policy URL and data-use disclosures in app metadata.
- Ensure push notifications are user-consented and relevant.
- If social login exists, verify Sign in with Apple rules for parity.
