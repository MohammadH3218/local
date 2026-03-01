# Azure Manifest - Minimal Changes Needed

## Current Issues

Your manifest has:
1. ❌ `signInAudience: "AzureADMyOrg"` → Should be `"AzureADandPersonalMicrosoftAccount"`
2. ❌ Missing `api.requestedAccessTokenVersion` → Should be `2`
3. ⚠️ Permission ID might be wrong → Should verify it's Calendars.ReadWrite

## Solution: Make Only These 2 Changes

### Change 1: Fix `signInAudience`

Find this line:
```json
"signInAudience": "AzureADMyOrg",
```

Change to:
```json
"signInAudience": "AzureADandPersonalMicrosoftAccount",
```

### Change 2: Add `api` Section

At the END of the manifest (before the closing `}`), add:
```json
"api": {
	"requestedAccessTokenVersion": 2
}
```

**Important:** Add it BEFORE the closing brace `}`. The manifest should end like:
```json
	"tokenEncryptionKeyId": null,
	"api": {
		"requestedAccessTokenVersion": 2
	}
}
```

### Change 3: Verify Permission ID (Optional)

Check if the permission ID in `requiredResourceAccess` is correct:

- **Calendars.ReadWrite** should be: `"465a38f9-76ea-45b9-9f6f-4297fe7c17f8"`
- Your current ID is: `"1ec239c2-d7c9-4623-a91a-a9775856bb36"`

If it's wrong:
1. Go to **"API permissions"** in Portal
2. Remove the current permission
3. Add **"Microsoft Graph"** → **"Delegated permissions"** → **"Calendars.ReadWrite"**
4. Grant admin consent

## Step-by-Step

1. Open **Manifest** in Azure Portal
2. Click **"Edit"**
3. Find `"signInAudience": "AzureADMyOrg"` and change to `"AzureADandPersonalMicrosoftAccount"`
4. Scroll to the end, find `"tokenEncryptionKeyId": null,`
5. Add a comma after `null,` then add:
   ```json
   "api": {
   	"requestedAccessTokenVersion": 2
   }
   ```
6. Click **"Save"**
7. Should save successfully! ✅

## Complete Corrected Manifest

I've created `docs/azure/manifests/AZURE_MANIFEST_FINAL_FIX.json` with all your fields plus the fixes. You can copy that entire file if you prefer, but the minimal changes above should work.

## After Saving

1. Wait 2-3 minutes for changes to propagate
2. Test Microsoft Calendar connection
3. Should work! ✅
