# OAuth Setup Guide

## Azure OAuth Setup ✅ COMPLETED

Azure AD app registration has been created and credentials stored in AWS Parameter Store:
- **App ID**: `4beb149c-f51c-45e4-93f0-82882f50a3bc`
- **Redirect URI**: `https://api.handycall.org/api/v1/calendar-integration/auth/microsoft/callback`
- **Credentials stored in**: `/handycall/oauth/microsoft/*`

## Google OAuth Setup ⚠️ REQUIRES MANUAL STEP

Google Cloud OAuth 2.0 credentials must be created via the Google Cloud Console.

### Steps:

1. **Configure OAuth Consent Screen** (if not already done):
   - Go to: https://console.cloud.google.com/apis/credentials/consent?project=handycall-calcom
   - Choose "External" user type
   - Fill in required fields:
     - App name: `HandyCall`
     - User support email: Your email
     - Developer contact: Your email
   - Click "Save and Continue"
   - Add scopes: `https://www.googleapis.com/auth/calendar`
   - Click "Save and Continue"
   - Add test users (if needed)
   - Click "Save and Continue"

2. **Create OAuth 2.0 Client ID**:
   - Go to: https://console.cloud.google.com/apis/credentials?project=handycall-calcom
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Web application**
   - Name: `HandyCall Calendar Integration`
   - Authorized redirect URIs: 
     ```
     https://api.handycall.org/api/v1/calendar-integration/auth/google/callback
     ```
   - Click "Create"

3. **Store Credentials**:
   After creation, you'll see the Client ID and Client Secret. Run:
   ```powershell
   .\scripts\store-google-oauth.ps1 -ClientId "YOUR_CLIENT_ID" -ClientSecret "YOUR_CLIENT_SECRET"
   ```

## AWS Parameter Store

All OAuth credentials are stored in AWS Parameter Store under `/handycall/oauth/`:
- `/handycall/oauth/google/client-id`
- `/handycall/oauth/google/client-secret`
- `/handycall/oauth/google/redirect-uri`
- `/handycall/oauth/microsoft/client-id`
- `/handycall/oauth/microsoft/client-secret`
- `/handycall/oauth/microsoft/redirect-uri`
- `/handycall/oauth/microsoft/tenant-id`

## Environment Variables

The backend code will automatically use Parameter Store if `USE_PARAMETER_STORE=true` is set, otherwise it falls back to environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_REDIRECT_URI`
- `BACKEND_URL` (used to construct redirect URIs if not set)
