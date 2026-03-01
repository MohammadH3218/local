# Quick Fix for Azure Manifest "Required Resource Access" Error

## The Issue
You're getting: **"The Required Resource Access specified in the request is invalid"** when trying to save the manifest.

## Root Cause
Even though your `requiredResourceAccess` looks correct, Azure Portal can be very picky about:
1. **JSON syntax errors** (extra commas, missing brackets)
2. **Duplicate keys** in the manifest
3. **Invalid field combinations**

## EASIEST SOLUTION: Use Azure Portal UI Instead

**Don't edit the manifest JSON directly.** Use the Azure Portal UI to manage permissions:

### Step 1: Remove Permissions via UI
1. Go to your app: **Azure Portal → App registrations → HandyCall Calendar Integration**
2. Click **"API permissions"** in the left menu
3. If you see any permissions listed, click the **"..."** menu next to each
4. Click **"Remove permission"** for each one
5. Confirm removal

### Step 2: Add Permission via UI
1. Still in **"API permissions"**, click **"Add a permission"**
2. Select **"Microsoft Graph"**
3. Select **"Delegated permissions"** (NOT Application permissions)
4. Search for **"Calendars.ReadWrite"**
5. Check the box next to it
6. Click **"Add permissions"** at the bottom
7. Click **"Grant admin consent for [Your Organization]"** (if you have admin rights)

### Step 3: Fix signInAudience via Manifest
1. Go to **"Manifest"** in the left menu
2. Find `"signInAudience"` (around line 20-30)
3. Change it to: `"AzureADandPersonalMicrosoftAccount"`
4. **ONLY change this one field**
5. Click **"Save"**

### Step 4: Fix requestedAccessTokenVersion
1. Still in the manifest
2. Find the `"api"` section (around line 50-60)
3. Make sure it looks like this:
   ```json
   "api": {
     "requestedAccessTokenVersion": 2
   }
   ```
4. **ONLY change this section** (remove any duplicates, ensure it's valid JSON)
5. Click **"Save"**

## Why This Works
- The Portal UI automatically formats `requiredResourceAccess` correctly
- You avoid JSON syntax errors
- Azure validates the structure as you add permissions

## If You MUST Edit Manifest Directly

If you absolutely need to edit the manifest JSON, use this **EXACT** structure:

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

**Critical Checks:**
- ✅ No trailing commas after last items in arrays/objects
- ✅ All brackets and braces are closed
- ✅ No duplicate keys (especially `requestedAccessTokenVersion`)
- ✅ `requiredResourceAccess` is an array (has `[` and `]`)
- ✅ `resourceAccess` is an array (has `[` and `]`)

## Verification

After fixing:

1. **Check API Permissions page** - Should show "Calendars.ReadWrite" under Microsoft Graph
2. **Check Manifest** - Should have correct `signInAudience` and `api.requestedAccessTokenVersion`
3. **Save should work** - No more errors
4. **Wait 2-3 minutes** for propagation
5. **Test connection** - Try connecting Microsoft Calendar again

## Still Failing?

If it still fails after using the Portal UI:

1. **Check browser console** (F12) for JavaScript errors
2. **Try a different browser** (Chrome, Edge, Firefox)
3. **Clear browser cache** and try again
4. **Try incognito/private mode**

The Portal UI method should work 100% of the time because it validates as you go.
