# Fix Azure AD App Manifest
# This script fixes signInAudience and requestedAccessTokenVersion

param(
    [string]$AppId = "4beb149c-f51c-45e4-93f0-82882f50a3bc"
)

Write-Host "Fixing Azure AD app manifest..." -ForegroundColor Cyan
Write-Host "App ID: $AppId" -ForegroundColor Yellow

# Get current app
Write-Host "`nFetching current app configuration..." -ForegroundColor Cyan
$app = az ad app show --id $AppId -o json | ConvertFrom-Json

if (-not $app) {
    Write-Host "Error: App not found" -ForegroundColor Red
    exit 1
}

Write-Host "Current signInAudience: $($app.signInAudience)" -ForegroundColor Yellow
Write-Host "Current requestedAccessTokenVersion: $($app.api.requestedAccessTokenVersion)" -ForegroundColor Yellow

# Update signInAudience
Write-Host "`nUpdating signInAudience to 'AzureADandPersonalMicrosoftAccount'..." -ForegroundColor Cyan
try {
    az ad app update --id $AppId --set signInAudience="AzureADandPersonalMicrosoftAccount" | Out-Null
    Write-Host "✓ signInAudience updated" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to update signInAudience: $_" -ForegroundColor Red
    Write-Host "You may need to do this manually in Azure Portal" -ForegroundColor Yellow
}

# Update requestedAccessTokenVersion
Write-Host "`nUpdating requestedAccessTokenVersion to 2..." -ForegroundColor Cyan
try {
    # Get current manifest
    $manifest = az ad app show --id $AppId -o json | ConvertFrom-Json
    
    # Update the api section
    $apiSection = @{
        requestedAccessTokenVersion = 2
    }
    
    # Convert to JSON and update
    $apiJson = $apiSection | ConvertTo-Json -Compress
    az ad app update --id $AppId --set "api.requestedAccessTokenVersion=2" | Out-Null
    Write-Host "✓ requestedAccessTokenVersion updated" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to update requestedAccessTokenVersion: $_" -ForegroundColor Red
    Write-Host "You may need to do this manually in Azure Portal" -ForegroundColor Yellow
}

# Verify changes
Write-Host "`nVerifying changes..." -ForegroundColor Cyan
$updated = az ad app show --id $AppId --query "{signInAudience:signInAudience, requestedAccessTokenVersion:api.requestedAccessTokenVersion}" -o json | ConvertFrom-Json

$signInColor = if ($updated.signInAudience -eq "AzureADandPersonalMicrosoftAccount") { "Green" } else { "Red" }
$tokenVersionColor = if ($updated.requestedAccessTokenVersion -eq 2) { "Green" } else { "Red" }

Write-Host "Updated signInAudience: $($updated.signInAudience)" -ForegroundColor $signInColor
Write-Host "Updated requestedAccessTokenVersion: $($updated.requestedAccessTokenVersion)" -ForegroundColor $tokenVersionColor

$isFixed = ($updated.signInAudience -eq "AzureADandPersonalMicrosoftAccount") -and ($updated.requestedAccessTokenVersion -eq 2)

if ($isFixed) {
    Write-Host ""
    Write-Host "✓ Manifest fixed successfully!" -ForegroundColor Green
    Write-Host "Wait 2-3 minutes for changes to propagate, then try connecting Microsoft Calendar again." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "WARNING: Some changes may have failed. Please verify in Azure Portal:" -ForegroundColor Yellow
    $baseUrl = 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/'
    Write-Host ($baseUrl + $AppId) -ForegroundColor Cyan
}
