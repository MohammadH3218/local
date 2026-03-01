# Fix Azure AD app to support consumer accounts (Outlook.com, personal Microsoft accounts)

$appId = "4beb149c-f51c-45e4-93f0-82882f50a3bc"

Write-Host "Fixing Azure AD app to support consumer accounts..." -ForegroundColor Cyan

# Get access token for Microsoft Graph
$token = az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv

if (-not $token) {
    Write-Host "Error: Failed to get access token" -ForegroundColor Red
    exit 1
}

# Get current app registration
Write-Host "Fetching current app registration..." -ForegroundColor Yellow
$app = az rest --method GET --uri "https://graph.microsoft.com/v1.0/applications(appId='$appId')" --headers "Authorization=Bearer $token" -o json | ConvertFrom-Json

if (-not $app) {
    Write-Host "Error: App not found" -ForegroundColor Red
    exit 1
}

Write-Host "Current signInAudience: $($app.signInAudience)" -ForegroundColor Yellow

# Update app to support consumer accounts
Write-Host "Updating app to support consumer accounts..." -ForegroundColor Yellow

$body = @{
    api = @{
        requestedAccessTokenVersion = 2
    }
    signInAudience = "AzureADandPersonalMicrosoftAccount"
} | ConvertTo-Json -Depth 10

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$result = az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications($($app.id))" --headers "Authorization=Bearer $token" --headers "Content-Type=application/json" --body $body 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "App updated successfully!" -ForegroundColor Green
    Write-Host "The app now supports both organizational and personal Microsoft accounts (Outlook.com)" -ForegroundColor Green
} else {
    Write-Host "Error updating app via API. Manual steps required:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Go to Azure Portal:" -ForegroundColor Cyan
    Write-Host "   https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/$appId" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Click 'Manifest' in the left menu" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Find 'signInAudience' and change it to:" -ForegroundColor Cyan
    Write-Host "   AzureADandPersonalMicrosoftAccount" -ForegroundColor White
    Write-Host ""
    Write-Host "4. Find 'api' section and add:" -ForegroundColor Cyan
    Write-Host "   requestedAccessTokenVersion: 2" -ForegroundColor White
    Write-Host ""
    Write-Host "5. Click 'Save'" -ForegroundColor Cyan
}
