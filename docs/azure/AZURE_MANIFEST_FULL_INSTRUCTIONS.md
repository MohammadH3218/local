# Complete Azure Manifest Fix - Step by Step

## The Problem
You're getting: **"The Required Resource Access specified in the request is invalid"** when trying to save the manifest.

## Root Cause
The manifest has incorrect or malformed `requiredResourceAccess`, `signInAudience`, or `api.requestedAccessTokenVersion` fields.

## Solution: Complete Corrected Manifest

### Step 1: Get Your Current Manifest

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to: **Azure Active Directory → App registrations → HandyCall Calendar Integration**
3. Click **"Manifest"** in the left menu
4. Click **"Download"** to save a backup (optional but recommended)

### Step 2: Find Your App Object ID

1. Still in the app registration
2. Go to **"Overview"** page
3. Copy the **"Object (principal) ID"** - you'll need this

### Step 3: Replace the Manifest

1. Go back to **"Manifest"** page
2. Click **"Edit"** or the edit icon
3. **DELETE ALL** the existing JSON
4. **COPY AND PASTE** the corrected manifest below, but **REPLACE** `"YOUR_APP_OBJECT_ID"` with your actual Object ID from Step 2

### Step 4: Corrected Manifest (Copy This)

```json
{
  "id": "YOUR_APP_OBJECT_ID",
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
    ],
    "implicitGrantSettings": {
      "enableIdTokenIssuance": false,
      "enableAccessTokenIssuance": false
    }
  }
}
```

**⚠️ IMPORTANT:** This is a **MINIMAL** manifest with only the essential fields. If your current manifest has other fields you need to keep (like `identifierUris`, `oauth2PermissionScopes`, etc.), you'll need to merge them carefully.

### Step 5: Alternative - Use Portal UI (Safer)

If replacing the entire manifest seems risky, use this **safer approach**:

#### A. Fix `api.requestedAccessTokenVersion` First

1. In **"Manifest"**, find the `"api"` section
2. Change it to:
   ```json
   "api": {
     "requestedAccessTokenVersion": 2
   }
   ```
3. **Save** (should work now)

#### B. Fix `signInAudience`

1. Still in **"Manifest"**, find `"signInAudience"`
2. Change to: `"AzureADandPersonalMicrosoftAccount"`
3. **Save**

#### C. Fix `requiredResourceAccess` via UI

1. Go to **"API permissions"** in left menu
2. **Remove ALL existing permissions** (click "..." → "Remove permission" for each)
3. Click **"Add a permission"**
4. Select **"Microsoft Graph"**
5. Select **"Delegated permissions"**
6. Search for **"Calendars.ReadWrite"**
7. Check the box and click **"Add permissions"**
8. Click **"Grant admin consent for [Your Organization]"** (if you have admin rights)

This will automatically update `requiredResourceAccess` correctly.

### Step 6: Verify

After saving, verify:

1. **Overview page** → `signInAudience` should show: **"Accounts in any organizational directory and personal Microsoft accounts"**
2. **Manifest** → `"api": { "requestedAccessTokenVersion": 2 }` should be present
3. **API permissions** → Should show "Calendars.ReadWrite" under Microsoft Graph

### Step 7: Wait and Test

1. **Wait 2-3 minutes** for changes to propagate
2. Try connecting Microsoft Calendar again
3. Should work! ✅

## What Each Field Does

- **`signInAudience: "AzureADandPersonalMicrosoftAccount"`** - Allows both work/school AND personal Microsoft accounts (Outlook.com, Hotmail, etc.)
- **`api.requestedAccessTokenVersion: 2`** - Required for consumer account support (modern token format)
- **`requiredResourceAccess`** - Defines which Microsoft Graph permissions your app needs
  - `resourceAppId: "00000003-0000-0000-c000-000000000000"` - Microsoft Graph API
  - `id: "465a38f9-76ea-45b9-9f6f-4297fe7c17f8"` - Calendars.ReadWrite permission
  - `type: "Scope"` - Delegated permission (user context)

## If You Still Get Errors

### Error: "Invalid JSON"
- Check for trailing commas (no comma after last item in arrays/objects)
- Check all brackets `[]` and braces `{}` are closed
- Use a JSON validator: https://jsonlint.com/

### Error: "Required Resource Access invalid"
- The permission IDs might be wrong
- Use the Portal UI method (Step 5C) instead of editing JSON

### Error: "Cannot change signInAudience"
- You MUST set `requestedAccessTokenVersion: 2` FIRST
- Then you can change `signInAudience`

## Need Help?

If you're still stuck:
1. Use the **Portal UI method** (Step 5) - it's safer and validates as you go
2. Don't edit `requiredResourceAccess` in JSON - use "API permissions" UI instead
3. Make changes one at a time and save between each
