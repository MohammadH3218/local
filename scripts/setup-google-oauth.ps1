# Setup Google Cloud OAuth 2.0 Credentials
# This script creates OAuth 2.0 credentials for Google Calendar integration

param(
    [string]$ProjectId = "handycall-calcom",
    [string]$ClientName = "HandyCall Calendar Integration",
    [string]$RedirectUri = "https://api.handycall.org/api/v1/calendar-integration/auth/google/callback"
)

Write-Host "Setting up Google Cloud OAuth 2.0 credentials..." -ForegroundColor Cyan

# Get access token
$accessToken = gcloud auth print-access-token --project=$ProjectId
if (-not $accessToken) {
    Write-Host "Error: Failed to get access token. Please ensure you're authenticated with gcloud." -ForegroundColor Red
    exit 1
}

# Note: Google Cloud OAuth 2.0 client creation via API requires special permissions
# The easiest way is through the Console UI. This script will guide you through it.

Write-Host "`nGoogle Cloud OAuth 2.0 credentials must be created via the Console UI." -ForegroundColor Yellow
Write-Host "Please follow these steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://console.cloud.google.com/apis/credentials?project=$ProjectId" -ForegroundColor White
Write-Host "2. Click 'Create Credentials' > 'OAuth client ID'" -ForegroundColor White
Write-Host "3. If prompted, configure the OAuth consent screen first:" -ForegroundColor White
Write-Host "   - Go to: https://console.cloud.google.com/apis/credentials/consent?project=$ProjectId" -ForegroundColor White
Write-Host "   - Choose 'External' user type" -ForegroundColor White
Write-Host "   - Fill in required fields (App name, User support email, Developer contact)" -ForegroundColor White
Write-Host "   - Add scopes: https://www.googleapis.com/auth/calendar" -ForegroundColor White
Write-Host "4. Back to Credentials, create OAuth client ID:" -ForegroundColor White
Write-Host "   - Application type: Web application" -ForegroundColor White
Write-Host "   - Name: $ClientName" -ForegroundColor White
Write-Host "   - Authorized redirect URIs: $RedirectUri" -ForegroundColor White
Write-Host "5. After creation, copy the Client ID and Client Secret" -ForegroundColor White
Write-Host "`nOnce you have the credentials, run:" -ForegroundColor Yellow
Write-Host "  .\scripts\store-google-oauth.ps1 -ClientId 'YOUR_CLIENT_ID' -ClientSecret 'YOUR_CLIENT_SECRET'" -ForegroundColor Cyan
