# How to Set Redirect URLs for OAuth

## Google Cloud Console

### Step 1: Navigate to OAuth Credentials
1. Go to: **https://console.cloud.google.com/apis/credentials?project=handycall-calcom**
2. If you haven't created an OAuth client yet, click **"Create Credentials"** > **"OAuth client ID"**
3. If you already have one, click on it to edit

### Step 2: Add Authorized Redirect URI
In the OAuth client configuration:

1. **Application type**: Select **"Web application"**

2. **Authorized redirect URIs**: Click **"+ ADD URI"** and add:
   ```
   https://api.handycall.org/api/v1/calendar-integration/auth/google/callback
   ```

3. Click **"Save"**

### Step 3: Verify
The redirect URI should now appear in your OAuth client's authorized redirect URIs list.

---

## Azure Portal (Microsoft)

The redirect URI was already configured when we ran the setup script, but you can verify/update it:

### Step 1: Navigate to App Registration
1. Go to: **https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/4beb149c-f51c-45e4-93f0-82882f50a3bc**
2. Or search for "App registrations" in Azure Portal and find "HandyCall Calendar Integration"

### Step 2: Check Redirect URIs
1. Click on **"Authentication"** in the left menu
2. Under **"Platform configurations"** > **"Web"**, you should see:
   ```
   https://api.handycall.org/api/v1/calendar-integration/auth/microsoft/callback
   ```

3. If it's missing, click **"Add a platform"** > **"Web"** and add the URI above

---

## Important Notes

- **The redirect URI must match exactly** - including the protocol (https), domain, and path
- **No trailing slashes** unless your backend expects them
- **Both Google and Microsoft require the redirect URI to be registered** before OAuth will work
- The redirect URI in your code must match what's registered in the OAuth provider's console

## Current Configuration

- **Google Redirect URI**: `https://api.handycall.org/api/v1/calendar-integration/auth/google/callback`
- **Microsoft Redirect URI**: `https://api.handycall.org/api/v1/calendar-integration/auth/microsoft/callback`

Both are configured in:
- `packages/backend/src/modules/calendar-integration/providers/google-calendar.service.ts`
- `packages/backend/src/modules/calendar-integration/providers/microsoft-calendar.service.ts`

And stored in AWS Parameter Store as:
- `/handycall/oauth/google/redirect-uri`
- `/handycall/oauth/microsoft/redirect-uri`
