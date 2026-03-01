# Fix Calendar Integration Issues

## Issues Found

1. **Google Calendar**: "Missing required parameter: client_id" - OAuth client not initialized properly
2. **Microsoft/Azure**: "unauthorized_client: The client does not exist or is not enabled for consumers" - Azure app needs manual configuration
3. **Apple Calendar**: "404 Not Found" - Route might not be accessible

## Fixes Applied

### 1. Google Calendar ✅ FIXED
- Updated `GoogleCalendarService` to ensure credentials are loaded before generating auth URL
- Added error handling and logging
- Credentials are now loaded on-demand, not just at initialization

### 2. Microsoft/Azure ⚠️ REQUIRES MANUAL FIX
The Azure app registration needs to be updated to support consumer accounts (Outlook.com, personal Microsoft accounts).

**Manual Steps Required:**

1. **Go to Azure Portal:**
   - https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/4beb149c-f51c-45e4-93f0-82882f50a3bc

2. **Click "Manifest" in the left menu**

3. **Update the manifest:**
   - Find `"signInAudience"` (around line 20-30)
   - Change from: `"AzureADMyOrg"`
   - To: `"AzureADandPersonalMicrosoftAccount"`
   
   - Find `"api"` section (around line 50-60)
   - Add or update to include:
     ```json
     "api": {
       "requestedAccessTokenVersion": 2
     }
     ```

4. **Click "Save"**

5. **Wait 2-3 minutes** for changes to propagate

### 3. Apple Calendar ✅ FIXED
- Added error handling for missing company ID
- Route is properly registered in the controller
- The 404 might be a deployment issue - ensure the latest code is deployed

## Verification

After applying fixes:

1. **Google Calendar:**
   - Try connecting again
   - Check backend logs for credential loading messages
   - Should see: `[GoogleCalendarService] clientId: SET, clientSecret: SET, redirectUri: SET`

2. **Microsoft Calendar:**
   - Complete the manual Azure Portal steps above
   - Try connecting again
   - Should work for both work/school and personal Microsoft accounts

3. **Apple Calendar:**
   - Ensure backend is deployed with latest code
   - Try connecting with your Apple ID email and app-specific password
   - Check that the route `/api/v1/calendar-integration/auth/apple/connect` is accessible

## Deployment

After fixes are applied, deploy the backend:

```powershell
cd packages/backend
.\deploy-docker-eb.ps1
```

Or if using the root deployment script, ensure all changes are committed and pushed to GitHub first.
