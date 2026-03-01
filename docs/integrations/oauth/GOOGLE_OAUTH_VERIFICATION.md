# Google OAuth Redirect URI Verification

## Current Configuration

**Parameter Store:**
- Redirect URI: `https://cal.handycall.org/api/integrations/googlecalendar/callback`

**Backend Routes:**
- New route: `/api/v1/calendar-integration/auth/google/callback` (CalendarIntegrationController)
- Legacy route: `/api/integrations/googlecalendar/callback` (LegacyCalendarController)

## The Issue

The error "Missing required parameter: redirect_uri" means Google isn't receiving the redirect_uri in the OAuth request.

## Verification Steps

### 1. Check Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID: `92137952830-1mf6m1k8toj9k366ld6417m1f71ft8m7.apps.googleusercontent.com`
3. Check "Authorized redirect URIs"
4. **Verify it includes:** `https://cal.handycall.org/api/integrations/googlecalendar/callback`

### 2. Check Backend Logs

When you try to connect Google Calendar, check backend logs for:
```
[GoogleCalendarService] Loaded credentials - clientId: SET (...), clientSecret: SET, redirectUri: ...
[GoogleCalendarService] OAuth client initialized with redirectUri: ...
[GoogleCalendarService] Generating auth URL with clientId: ..., redirectUri: ...
```

If `redirectUri: MISSING`, then Parameter Store isn't loading correctly.

### 3. Verify Parameter Store

```powershell
aws ssm get-parameter --name "/handycall/oauth/google/redirect-uri" --query "Parameter.Value" --output text
```

Should return: `https://cal.handycall.org/api/integrations/googlecalendar/callback`

## If Redirect URI Doesn't Match

### Option A: Update Google Cloud Console (Recommended)

1. Go to Google Cloud Console → Credentials
2. Edit your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", ensure you have:
   - `https://cal.handycall.org/api/integrations/googlecalendar/callback` (for legacy route)
   - OR `https://api.handycall.org/api/v1/calendar-integration/auth/google/callback` (for new route)
4. Click "Save"

### Option B: Update Parameter Store

If you want to use the new route instead:

```powershell
aws ssm put-parameter --name "/handycall/oauth/google/redirect-uri" --value "https://api.handycall.org/api/v1/calendar-integration/auth/google/callback" --type "String" --overwrite
```

Then update Google Cloud Console to match.

## After Fixing

1. **Redeploy backend** (if changes were made)
2. **Wait 2-3 minutes** for changes to propagate
3. **Try connecting Google Calendar again**
4. **Check backend logs** to see if redirectUri is being loaded correctly

## Debugging

If still not working:

1. Check backend logs for the exact redirectUri being used
2. Compare it character-by-character with Google Cloud Console
3. Ensure no trailing slashes or extra spaces
4. Verify the domain matches exactly (cal.handycall.org vs api.handycall.org)
