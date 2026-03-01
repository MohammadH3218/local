# Fix Azure "Required Resource Access" Error

## The Problem
When saving the Azure manifest, you get: **"The Required Resource Access specified in the request is invalid."**

This means the `requiredResourceAccess` section in your manifest has invalid resource IDs or permission IDs.

## Solution: Fix the requiredResourceAccess Section

### Step 1: Find the requiredResourceAccess Section

In the Azure Portal manifest editor, scroll down to find the `requiredResourceAccess` section. It should look something like this:

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

### Step 2: Verify the Correct Values

**Microsoft Graph Resource ID:**
- **MUST BE:** `00000003-0000-0000-c000-000000000000`
- This is the fixed GUID for Microsoft Graph API

**Calendars.ReadWrite Permission ID:**
- **MUST BE:** `465a38f9-76ea-45b9-9f6f-4297fe7c17f8`
- This is the delegated permission for reading and writing calendars
- **Type MUST BE:** `"Scope"` (not `"Role"`)

### Step 3: Replace the Entire requiredResourceAccess Section

**Copy and paste this EXACT structure** into your manifest:

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

### Step 4: Common Issues to Check

1. **Wrong Resource ID:**
   - ❌ `00000002-0000-0000-c000-000000000000` (Azure AD Graph - deprecated)
   - ✅ `00000003-0000-0000-c000-000000000000` (Microsoft Graph)

2. **Wrong Permission ID:**
   - ❌ `calendars.readwrite` (string name - wrong format)
   - ❌ `465a38f9-76ea-45b9-9f6f-4297fe7c17f8` with wrong type
   - ✅ `465a38f9-76ea-45b9-9f6f-4297fe7c17f8` with `"type": "Scope"`

3. **Wrong Type:**
   - ❌ `"type": "Role"` (application permission)
   - ✅ `"type": "Scope"` (delegated permission)

4. **Malformed JSON:**
   - Missing commas
   - Extra commas
   - Unclosed brackets

### Step 5: Complete Manifest Structure

Your manifest should have these sections in this order:

```json
{
  "id": "...",
  "appId": "...",
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

## Alternative: Remove and Re-add via Portal

If editing the manifest keeps failing, use the Azure Portal UI instead:

### Method 1: Use API Permissions UI

1. Go to your app registration in Azure Portal
2. Click **"API permissions"** in the left menu
3. Click **"Add a permission"**
4. Select **"Microsoft Graph"**
5. Select **"Delegated permissions"**
6. Search for **"Calendars.ReadWrite"**
7. Check the box and click **"Add permissions"**
8. Click **"Grant admin consent"** (if you have permissions)

This will automatically update the manifest correctly.

### Method 2: Verify Current Permissions

1. Go to **"API permissions"**
2. Check what's currently listed
3. If you see duplicates or wrong permissions, remove them
4. Then add the correct one using Method 1

## Verification

After fixing:

1. **Check the manifest** - `requiredResourceAccess` should match the structure above
2. **Check API Permissions** - Should show "Calendars.ReadWrite" under Microsoft Graph
3. **Save the manifest** - Should save without errors
4. **Wait 2-3 minutes** for changes to propagate

## Still Getting Errors?

If you still get errors after following these steps:

1. **Check for duplicate entries** in `requiredResourceAccess`
2. **Remove ALL entries** from `requiredResourceAccess` temporarily
3. **Save the manifest** (should work now)
4. **Add permissions via the Portal UI** (Method 1 above)
5. **Verify the manifest** was updated correctly

## Reference: Microsoft Graph Permission IDs

| Permission | ID | Type |
|------------|----|----|
| Calendars.ReadWrite | `465a38f9-76ea-45b9-9f6f-4297fe7c17f8` | Scope (Delegated) |
| Calendars.Read | `798ee544-9d2d-430a-a08b-f670321be290` | Scope (Delegated) |
| offline_access | `7427e0e9-2fba-42fe-b0c0-848c9e6a8182` | Scope (Delegated) |

**Microsoft Graph Resource App ID:** `00000003-0000-0000-c000-000000000000`
