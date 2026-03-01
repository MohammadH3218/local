# Quick Google OAuth Setup - Fix "Missing client_id" Error

The error "Missing required parameter: client_id" means Google OAuth credentials haven't been created yet.

## Step 1: Create OAuth Client in Google Cloud Console

1. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/apis/credentials?project=handycall-calcom

2. **Configure OAuth Consent Screen (if not done):**
   - Click "OAuth consent screen" in the left menu
   - Choose "External" user type
   - Fill in:
     - App name: `HandyCall`
     - User support email: Your email
     - Developer contact: Your email
   - Click "Save and Continue"
   - Add scope: `https://www.googleapis.com/auth/calendar`
   - Click "Save and Continue"
   - Add test users if needed
   - Click "Save and Continue"

3. **Create OAuth 2.0 Client ID:**
   - Go back to "Credentials" page
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Web application**
   - Name: `HandyCall Calendar Integration`
   - **Authorized redirect URIs** - Click "+ ADD URI" and add:
     ```
     https://api.handycall.org/api/v1/calendar-integration/auth/google/callback
     ```
   - Click "Create"

4. **Copy Your Credentials:**
   - You'll see a popup with:
     - **Your Client ID** (looks like: `123456789-abcdefg.apps.googleusercontent.com`)
     - **Your Client Secret** (looks like: `GOCSPX-xxxxxxxxxxxxx`)
   - **IMPORTANT:** Copy both values now - you won't see the secret again!

## Step 2: Store Credentials in AWS Parameter Store

Run this command (replace with your actual values):

```powershell
.\scripts\store-google-oauth.ps1 -ClientId "YOUR_CLIENT_ID_HERE" -ClientSecret "YOUR_CLIENT_SECRET_HERE"
```

Example:
```powershell
.\scripts\store-google-oauth.ps1 -ClientId "123456789-abcdefg.apps.googleusercontent.com" -ClientSecret "GOCSPX-xxxxxxxxxxxxx"
```

## Step 3: Restart Backend (if running locally)

If you're running the backend locally, restart it so it picks up the new credentials.

## Step 4: Verify

Check that credentials are stored:
```powershell
aws ssm get-parameter --name "/handycall/oauth/google/client-id" --with-decryption --query "Parameter.Value" --output text
```

You should see your Client ID. If you see an error, the credentials weren't stored correctly.

## Troubleshooting

- **"ParameterNotFound"**: Credentials haven't been stored yet - run Step 2
- **"Missing client_id"**: Backend can't find credentials - check Parameter Store and restart backend
- **"Invalid redirect_uri"**: The redirect URI in Google Console doesn't match exactly
