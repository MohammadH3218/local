# Fix Google OAuth Redirect URI

## The Problem
Error: **"Missing required parameter: redirect_uri"**

The redirect URI in Parameter Store is: `https://cal.handycall.org/api/integrations/googlecalendar/callback`

But this needs to match what's registered in Google Cloud Console.

## Solution: Update Redirect URI in Parameter Store

The correct redirect URI should be one of:
1. `https://api.handycall.org/api/v1/calendar-integration/auth/google/callback` (new route)
2. `https://cal.handycall.org/api/integrations/googlecalendar/callback` (legacy route - if that's what's in Google Cloud Console)

### Step 1: Check What's in Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID
3. Check the "Authorized redirect URIs" section
4. Note what redirect URI is registered there

### Step 2: Update Parameter Store to Match

If Google Cloud Console has: `https://cal.handycall.org/api/integrations/googlecalendar/callback`
Then keep it as is (it's already correct in Parameter Store).

If Google Cloud Console has: `https://api.handycall.org/api/v1/calendar-integration/auth/google/callback`
Then update Parameter Store:

```powershell
aws ssm put-parameter --name "/handycall/oauth/google/redirect-uri" --value "https://api.handycall.org/api/v1/calendar-integration/auth/google/callback" --type "String" --overwrite
```

### Step 3: Verify Both Match

The redirect URI in:
- ✅ Parameter Store: `/handycall/oauth/google/redirect-uri`
- ✅ Google Cloud Console: "Authorized redirect URIs"

**MUST BE EXACTLY THE SAME** (including http vs https, trailing slashes, etc.)

## Alternative: Update Google Cloud Console

If you want to use the new route instead:

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Click on your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   `https://api.handycall.org/api/v1/calendar-integration/auth/google/callback`
4. Remove the old one if needed
5. Click "Save"
6. Update Parameter Store to match:
   ```powershell
   aws ssm put-parameter --name "/handycall/oauth/google/redirect-uri" --value "https://api.handycall.org/api/v1/calendar-integration/auth/google/callback" --type "String" --overwrite
   ```

## After Fixing

1. Restart your backend (if running locally) or redeploy
2. Try connecting Google Calendar again
3. Should work! ✅
