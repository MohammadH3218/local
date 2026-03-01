# Copy-Paste Ready: Azure Manifest Fix

## Quick Fix Instructions

1. Go to Azure Portal → App registrations → HandyCall Calendar Integration → **Manifest**
2. Click **"Edit"**
3. **DELETE ALL** existing JSON
4. **COPY AND PASTE** the JSON below
5. Click **"Save"**
6. Wait 2-3 minutes
7. Test Microsoft Calendar connection

---

## ✅ CORRECTED MANIFEST (Copy This Entire Block)

```json
{
  "id": "0ccaaf40-b4c3-437e-b148-0e3fef75fa36",
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

---

## ⚠️ Important Notes

**This is a MINIMAL manifest** with only the essential fields. If your current manifest has other important fields (like `identifierUris`, `oauth2PermissionScopes`, `passwordCredentials`, etc.), you may need to merge them.

### If You Have Other Fields to Keep

Instead of replacing everything, use this **safer step-by-step approach**:

#### Step 1: Fix `api.requestedAccessTokenVersion`
In your current manifest, find:
```json
"api": {
  ...
}
```
Replace with:
```json
"api": {
  "requestedAccessTokenVersion": 2
}
```
**Save**

#### Step 2: Fix `signInAudience`
Find:
```json
"signInAudience": "AzureADMyOrg"
```
Replace with:
```json
"signInAudience": "AzureADandPersonalMicrosoftAccount"
```
**Save**

#### Step 3: Fix `requiredResourceAccess`
Find the `requiredResourceAccess` section and replace with:
```json
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
]
```
**Save**

---

## What This Fixes

✅ **`signInAudience`**: Changed from `"AzureADMyOrg"` (work/school only) to `"AzureADandPersonalMicrosoftAccount"` (work/school + personal accounts)

✅ **`api.requestedAccessTokenVersion`**: Set to `2` (required for consumer account support)

✅ **`requiredResourceAccess`**: Correct Microsoft Graph resource ID and Calendars.ReadWrite permission ID

---

## Verification

After saving, check:

1. **Overview page** → Should show: "Accounts in any organizational directory and personal Microsoft accounts"
2. **API permissions** → Should show "Calendars.ReadWrite" under Microsoft Graph
3. **Manifest** → Should have `"requestedAccessTokenVersion": 2` in the `api` section

---

## Still Getting Errors?

If you get "Required Resource Access invalid" error:

1. **Don't edit `requiredResourceAccess` in JSON**
2. Instead, use the **"API permissions"** UI:
   - Go to **"API permissions"** (left menu)
   - Remove all existing permissions
   - Click **"Add a permission"**
   - Select **"Microsoft Graph"** → **"Delegated permissions"**
   - Search **"Calendars.ReadWrite"** → Check it → **"Add permissions"**
   - Click **"Grant admin consent"**

This automatically updates `requiredResourceAccess` correctly.
