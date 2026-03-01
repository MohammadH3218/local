# HandyCall iOS App (SwiftUI)

This folder contains a production-ready SwiftUI codebase scaffold for HandyCall.
It is designed to consume the existing backend API (`/api/v1`) and includes:

- Cognito-backed login (via existing `POST /auth/login`)
- Dashboard, appointments, calls, contacts, notifications, and settings tabs
- Notification inbox with read/unread states
- Notification preferences with explicit Save + toast confirmation
- APNs device registration wiring to backend (`POST /notifications/devices`)

## 1. Open Xcode Project

1. Open `apps/ios/HandyCallApp/HandyCall.xcodeproj` in Xcode (26+ recommended).
2. Use scheme `HandyCall`.
3. If you change project structure/settings, regenerate from `apps/ios/HandyCallApp/project.yml`:
   - `xcodegen generate --spec apps/ios/HandyCallApp/project.yml`

## 2. Required iOS Capabilities

Enable these in the target Signing & Capabilities tab:

- `Push Notifications`
- `Background Modes` -> `Remote notifications`
- `Associated Domains` (optional, if deep links are added)

## 3. App Configuration

In `Sources/Core/AppConfig.swift`, set:

- `apiBaseURL` to your backend URL (example: `https://api.handycall.org/api/v1`)
- `apnsEnvironment` (`production` for TestFlight/App Store, `sandbox` for debug builds)

## 4. Backend Configuration for Push

Set these backend environment variables to enable APNs delivery:

- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY` (PEM text, `\n` escaped) or `APNS_PRIVATE_KEY_BASE64`

If unset, notifications still work in-app but push delivery is skipped.

If `USE_PARAMETER_STORE=true`, backend can also load APNs values from SSM:
- `/handycall/apns/key-id`
- `/handycall/apns/team-id`
- `/handycall/apns/bundle-id`
- `/handycall/apns/private-key` (SecureString)

## 5. Apple Review Readiness

Before App Store submission, verify:

- Account deletion path exists in-app if account creation exists.
- Any external links/payment behavior follows App Store rules.
- Privacy policy and data usage disclosures are present.
- Push permission prompt is contextual and user-benefit driven.
- Notification content does not include sensitive personal data on lock screen.
