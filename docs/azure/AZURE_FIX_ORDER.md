# Azure Manifest Fix - Correct Order

## The Problem
Azure CLI error: **"Unable to change signInAudience to AzureADandPersonalMicrosoftAccount. Application must accept Access Token Version 2."**

This means you **MUST set `requestedAccessTokenVersion` to 2 FIRST**, then you can change `signInAudience`.

## Solution: Fix in Azure Portal (Easiest)

### Step 1: Set requestedAccessTokenVersion to 2

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to: **Azure Active Directory → App registrations → HandyCall Calendar Integration**
3. Click **"Manifest"** in the left menu
4. Find the `"api"` section (around line 50-60)
5. Change it to:
   ```json
   "api": {
     "requestedAccessTokenVersion": 2
   }
   ```
6. **Click "Save"** at the top
7. Wait for confirmation that it saved

### Step 2: Change signInAudience

1. Still in the **"Manifest"** editor
2. Find `"signInAudience"` (around line 20-30)
3. Change from: `"AzureADMyOrg"`
4. To: `"AzureADandPersonalMicrosoftAccount"`
5. **Click "Save"** at the top
6. Wait for confirmation

### Step 3: Verify

1. Go to **"Overview"** page
2. Check that `signInAudience` shows: **"Accounts in any organizational directory and personal Microsoft accounts"**
3. Go back to **"Manifest"**
4. Verify `"api": { "requestedAccessTokenVersion": 2 }` is present

## Why This Order Matters

Azure requires `requestedAccessTokenVersion: 2` to support consumer accounts (personal Microsoft accounts). Without it, you can only use `AzureADMyOrg` (work/school accounts only).

## If You Get "Required Resource Access" Error

This error usually means:
1. **JSON syntax error** in the manifest (extra comma, missing bracket)
2. **Duplicate keys** in the manifest
3. **Invalid permission IDs** in `requiredResourceAccess`

### Quick Fix for Required Resource Access Error:

1. **Don't edit `requiredResourceAccess` in the manifest**
2. Instead, use the **"API permissions"** UI:
   - Go to **"API permissions"** in left menu
   - Remove any existing permissions
   - Click **"Add a permission"**
   - Select **"Microsoft Graph"**
   - Select **"Delegated permissions"**
   - Search for **"Calendars.ReadWrite"**
   - Check it and click **"Add permissions"**
   - Click **"Grant admin consent"**

This will automatically update `requiredResourceAccess` correctly.

## Complete Manifest Structure

After all fixes, your manifest should have:

```json
{
  "id": "...",
  "appId": "4beb149c-f51c-45e4-93f0-82882f50a3bc",
  "displayName": "HandyCall Calendar Integration",
  "signInAudience": "AzureADandPersonalMicrosoftAccount",
  "api": {
    "requestedAccessTokenVersion": 2
  },
  "requiredResourceAccess": [
    {
      "resourceAppId": "00000003-0000-0000-c000-000000000000",
      "resourceAccess": [
        {
          "id": "465a38f9-76ea-45b9-9f6f-4297fe7c17f8",
          "type": "Scope"
        }
      ]
    }
  ],
  "web": {
    "redirectUris": [
      "https://api.handycall.org/api/v1/calendar-integration/auth/microsoft/callback"
    ]
  }
}
```

## After Fixing

1. **Wait 2-3 minutes** for changes to propagate
2. **Try connecting Microsoft Calendar** again
3. Should work now! ✅
