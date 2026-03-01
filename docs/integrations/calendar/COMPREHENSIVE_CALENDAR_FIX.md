# Comprehensive Calendar Integration Fix

## Issues Identified

1. **Google Calendar**: "Missing required parameter: client_id"
   - OAuth client not properly initialized with credentials
   - Credentials might not be loaded from Parameter Store when needed

2. **Microsoft/Azure**: "unauthorized_client: The client does not exist or is not enabled for consumers"
   - Azure app manifest needs `signInAudience: "AzureADandPersonalMicrosoftAccount"`
   - Azure app manifest needs `requestedAccessTokenVersion: 2` in api section

3. **Apple Calendar**: "Cannot POST /api/v1/calendar-integration/auth/apple/connect" (404)
   - Route exists but might not be accessible
   - Could be deployment/routing issue

## Fixes Applied

### 1. Google Calendar ✅
- **Fixed**: OAuth client now always created fresh with current credentials
- **Fixed**: Added validation to ensure clientId and clientSecret are set before generating URL
- **Fixed**: Added detailed logging to debug credential loading
- **Fixed**: OAuth client is recreated on each request to ensure credentials are current

### 2. Microsoft/Azure ⚠️ MANUAL STEP REQUIRED
You fixed the JSON syntax (removed duplicate, added comma), but you still need to:

1. **Change `signInAudience`**:
   - Find `"signInAudience": "AzureADMyOrg"` (or similar)
   - Change to: `"signInAudience": "AzureADandPersonalMicrosoftAccount"`

2. **Save the manifest** and wait 2-3 minutes

### 3. Apple Calendar ✅
- **Fixed**: Added logging to debug route access
- **Fixed**: Added validation for missing company ID
- **Note**: The 404 might be a deployment issue - ensure latest code is deployed

## Verification Steps

### Google Calendar
1. Check backend logs for:
   - `[GoogleCalendarService] Generating auth URL with clientId: ...`
   - Should see credentials are SET, not MISSING

2. Try connecting - should redirect to Google OAuth

### Microsoft Calendar
1. Verify Azure Portal manifest has:
   - `"signInAudience": "AzureADandPersonalMicrosoftAccount"`
   - `"api": { "requestedAccessTokenVersion": 2 }`

2. Wait 2-3 minutes after saving

3. Try connecting again

### Apple Calendar
1. Check backend logs when connecting:
   - Should see: `[CalendarIntegrationController] Apple connect request - companyId: PRESENT`

2. If still 404, verify deployment includes latest code

## Deployment

After fixes, deploy backend:

```powershell
cd packages/backend
.\deploy-docker-eb.ps1
```

## Debugging

If issues persist:

1. **Check Parameter Store credentials:**
   ```powershell
   aws ssm get-parameter --name "/handycall/oauth/google/client-id" --with-decryption --query "Parameter.Value" --output text
   aws ssm get-parameter --name "/handycall/oauth/microsoft/client-id" --with-decryption --query "Parameter.Value" --output text
   ```

2. **Check backend logs** for credential loading messages

3. **Verify routes are registered:**
   - Google: `/api/v1/calendar-integration/auth/google/url`
   - Microsoft: `/api/v1/calendar-integration/auth/microsoft/url`
   - Apple: `/api/v1/calendar-integration/auth/apple/connect`
