# Azure Manifest Fix - Complete Steps

## Current Status
You've fixed the JSON syntax error (removed duplicate `requestedAccessTokenVersion`, added comma).

## Still Required: Change signInAudience

The error "unauthorized_client: The client does not exist or is not enabled for consumers" means you need to change the `signInAudience` field.

### Steps:

1. **In the Azure Portal manifest**, find the `signInAudience` field (usually around line 20-30, near the top of the JSON)

2. **Change it from:**
   ```json
   "signInAudience": "AzureADMyOrg"
   ```
   
   **To:**
   ```json
   "signInAudience": "AzureADandPersonalMicrosoftAccount"
   ```

3. **Verify the `api` section** (around line 50-60) looks like this:
   ```json
   "api": {
     "acceptMappedClaims": null,
     "knownClientApplications": [],
     "oauth2PermissionScopes": [],
     "preAuthorizedApplications": [],
     "requestedAccessTokenVersion": 2
   }
   ```
   (Make sure there's only ONE `requestedAccessTokenVersion` set to `2`, not `null`)

4. **Click "Save"** at the top

5. **Wait 2-3 minutes** for changes to propagate

6. **Try connecting Microsoft Calendar again**

## What This Does

- `AzureADandPersonalMicrosoftAccount`: Allows both work/school accounts AND personal Microsoft accounts (Outlook.com, Hotmail, etc.)
- `requestedAccessTokenVersion: 2`: Required for consumer account support (modern token format)

## Verification

After saving, the manifest should have:
- ✅ `"signInAudience": "AzureADandPersonalMicrosoftAccount"`
- ✅ `"api": { "requestedAccessTokenVersion": 2 }`
- ✅ No duplicate keys
- ✅ Valid JSON (no syntax errors)
