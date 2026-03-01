# Fix Azure Outlook Connection - Manual Steps

The Azure app registration needs to be updated to support consumer Microsoft accounts (Outlook.com, personal accounts).

## Quick Fix via Azure Portal

1. **Go to Azure Portal:**
   - https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/4beb149c-f51c-45e4-93f0-82882f50a3bc

2. **Click "Manifest" in the left menu**

3. **Find the `signInAudience` field** (around line 20-30) and change it from:
   ```json
   "signInAudience": "AzureADMyOrg"
   ```
   to:
   ```json
   "signInAudience": "AzureADandPersonalMicrosoftAccount"
   ```

4. **Find the `api` section** (around line 50-60) and add:
   ```json
   "api": {
     "requestedAccessTokenVersion": 2
   }
   ```
   If `api` already exists, just add `"requestedAccessTokenVersion": 2` to it.

5. **Click "Save"** at the top

6. **Wait a few minutes** for the changes to propagate

## Verify

After saving, try connecting Outlook again. The error "unauthorized_client: The client does not exist or is not enabled for consumers" should be resolved.

## What This Does

- **AzureADandPersonalMicrosoftAccount**: Allows both organizational (work/school) and personal (Outlook.com, Hotmail, etc.) Microsoft accounts
- **requestedAccessTokenVersion: 2**: Required for consumer account support
