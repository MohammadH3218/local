# Fix Azure Manifest - Remove requiredResourceAccess First

## The Problem
Even with a minimal manifest, you're getting: **"The Required Resource Access specified in the request is invalid"**

This means Azure Portal is having trouble parsing the `requiredResourceAccess` section, even though the IDs look correct.

## Solution: Remove requiredResourceAccess, Then Add via UI

### Step 1: Use Manifest WITHOUT requiredResourceAccess

Copy this manifest (notice: **NO `requiredResourceAccess` field**):

```json
{
  "id": "0ccaaf40-b4c3-437e-b148-0e3fef75fa36",
  "appId": "4beb149c-f51c-45e4-93f0-82882f50a3bc",
  "displayName": "HandyCall Calendar Integration",
  "signInAudience": "AzureADandPersonalMicrosoftAccount",
  "api": {
    "requestedAccessTokenVersion": 2
  },
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

**Steps:**
1. Go to Azure Portal → App registrations → HandyCall Calendar Integration → **Manifest**
2. Click **"Edit"**
3. **DELETE ALL** existing JSON
4. **PASTE** the JSON above (without `requiredResourceAccess`)
5. Click **"Save"**
6. This should save successfully! ✅

### Step 2: Add Permissions via Portal UI (NOT Manifest)

Now that the manifest is saved, add permissions the safe way:

1. Go to **"API permissions"** in the left menu
2. **Remove ALL existing permissions** (if any):
   - Click **"..."** next to each permission
   - Click **"Remove permission"**
   - Confirm removal
3. Click **"Add a permission"**
4. Select **"Microsoft Graph"**
5. Select **"Delegated permissions"** (NOT Application permissions)
6. In the search box, type: **"Calendars.ReadWrite"**
7. Check the box next to **"Calendars.ReadWrite"**
8. Click **"Add permissions"** at the bottom
9. Click **"Grant admin consent for [Your Organization]"** (if you have admin rights)

This will automatically add the correct `requiredResourceAccess` to your manifest without errors.

### Step 3: Verify

1. Go back to **"Manifest"**
2. You should now see `requiredResourceAccess` was automatically added by the Portal
3. It should look like:
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

## Why This Works

- The Portal UI validates and formats `requiredResourceAccess` correctly
- You avoid JSON parsing errors
- Azure handles the structure automatically
- No manual ID entry needed

## Alternative: Fix One Field at a Time

If you want to keep your existing manifest structure, fix fields one at a time:

### A. First: Set `api.requestedAccessTokenVersion`

1. In Manifest, find the `"api"` section
2. Replace it with:
   ```json
   "api": {
     "requestedAccessTokenVersion": 2
   }
   ```
3. **Save** (should work)

### B. Second: Change `signInAudience`

1. Find `"signInAudience"`
2. Change to: `"AzureADandPersonalMicrosoftAccount"`
3. **Save**

### C. Third: Remove `requiredResourceAccess` from JSON

1. Find the `"requiredResourceAccess"` section
2. **DELETE the entire section** (including the array brackets)
3. **Save**

### D. Fourth: Add permissions via UI

Follow Step 2 above to add permissions via the Portal UI.

## Complete Working Manifest (After UI Adds Permissions)

After following all steps, your manifest should have:

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

But the `requiredResourceAccess` should be added by the Portal UI, not manually.

## Still Getting Errors?

If you still get errors:

1. **Clear browser cache** and try again
2. **Try a different browser** (Chrome, Edge, Firefox)
3. **Try incognito/private mode**
4. **Check for JSON syntax errors** using https://jsonlint.com/
5. **Make sure there are no trailing commas** after the last item in arrays/objects
