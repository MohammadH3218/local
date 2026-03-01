# Apple App Store Compliance Checklist (iOS)

Use this checklist before shipping your SwiftUI app build to TestFlight/App Store.

## Core policy checks

1. App completeness
- App must be fully functional at submission (no placeholder screens, dead buttons, or mock-only login).
- Ensure your backend environment is production-ready before review.

2. Accurate metadata
- Screenshots and app description must match actual app behavior.
- If notifications are optional, describe them clearly and accurately.

3. Sign in with Apple parity
- If you allow third-party sign-in providers (for account login), follow Apple parity rules for Sign in with Apple.

4. Data collection + privacy
- Only request data needed for product features.
- Ensure privacy policy is publicly accessible and linked in App Store Connect and in-app settings.

5. Account management
- If users can create an account in the app, provide an in-app path to initiate account deletion.

6. Push notifications
- Push notifications must be user-consented and not abusive/spammy.
- Do not gate core app functionality on accepting push notifications.

## HandyCall-specific checks

1. Notification content safety
- Avoid sending sensitive customer details in lock-screen notification text.
- Keep body text short and operational (e.g., “New appointment booked”).

2. Permission UX
- Ask for notifications after explaining value (not immediately at first frame without context).
- If denied, allow users to continue using the app normally.

3. Billing/usage alerts
- Usage threshold notifications should reflect real backend values (25/50/75/90/100).
- Provide in-app details page so notification taps have a meaningful destination.

4. Settings controls
- Provide in-app toggles for each notification type and explicit save feedback.
- Persist preferences server-side per user.

## Apple source references

- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Guideline 4.8 (Sign in with Apple): https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple
- Guideline 5.1.1 (Data Collection and Storage): https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- Guideline 4.5.4 (Push Notifications): https://developer.apple.com/app-store/review/guidelines/#push-notifications
- UserNotifications framework: https://developer.apple.com/documentation/usernotifications
