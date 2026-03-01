# Fix Azure Manifest via Azure CLI (Bypass Portal Errors)

Since the Portal is giving errors, let's use Azure CLI to fix the two critical fields.

## Fix via Azure CLI

Run these commands in PowerShell:

### Step 1: Set requestedAccessTokenVersion

```powershell
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/0ccaaf40-b4c3-437e-b148-0e3fef75fa36" --headers "Content-Type=application/json" --body '{\"api\":{\"requestedAccessTokenVersion\":2}}'
```

### Step 2: Set signInAudience

```powershell
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/0ccaaf40-b4c3-437e-b148-0e3fef75fa36" --headers "Content-Type=application/json" --body '{\"signInAudience\":\"AzureADandPersonalMicrosoftAccount\"}'
```

### Step 3: Verify

```powershell
az ad app show --id 4beb149c-f51c-45e4-93f0-82882f50a3bc --query "{signInAudience:signInAudience, requestedAccessTokenVersion:api.requestedAccessTokenVersion}" -o json
```

## Alternative: Use Minimal Manifest

If you prefer to use the Portal, try this MINIMAL manifest with only editable fields:

```json
{
	"id": "0ccaaf40-b4c3-437e-b148-0e3fef75fa36",
	"appId": "4beb149c-f51c-45e4-93f0-82882f50a3bc",
	"displayName": "HandyCall Calendar Integration",
	"signInAudience": "AzureADandPersonalMicrosoftAccount",
	"requiredResourceAccess": [
		{
			"resourceAppId": "00000003-0000-0000-c000-000000000000",
			"resourceAccess": [
				{
					"id": "1ec239c2-d7c9-4623-a91a-a9775856bb36",
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
	},
	"api": {
		"requestedAccessTokenVersion": 2
	}
}
```
