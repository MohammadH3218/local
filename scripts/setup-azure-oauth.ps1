# Setup Azure AD OAuth App Registration
# This script creates an Azure AD app registration for Microsoft Calendar integration

param(
    [string]$AppName = "HandyCall Calendar Integration",
    [string]$RedirectUri = "https://api.handycall.org/api/v1/calendar-integration/auth/microsoft/callback"
)

Write-Host "Setting up Azure AD OAuth app registration..." -ForegroundColor Cyan

# Get current subscription
$subscription = az account show --query "{id:id, name:name}" -o json | ConvertFrom-Json
Write-Host "Using Azure subscription: $($subscription.name) ($($subscription.id))" -ForegroundColor Yellow

# Create app registration
Write-Host "`nCreating Azure AD app registration..." -ForegroundColor Cyan
$appJson = az ad app create --display-name $AppName --web-redirect-uris $RedirectUri --enable-id-token-issuance false -o json | ConvertFrom-Json

if (-not $appJson) {
    Write-Host "Error: Failed to create app registration" -ForegroundColor Red
    exit 1
}

$appId = $appJson.appId
Write-Host "App registration created! App ID: $appId" -ForegroundColor Green

# Create service principal
Write-Host "Creating service principal..." -ForegroundColor Cyan
az ad sp create --id $appId | Out-Null

# Generate client secret
Write-Host "Generating client secret..." -ForegroundColor Cyan
$secretName = "HandyCall-Calendar-Secret-$(Get-Date -Format 'yyyyMMdd')"
$secretJson = az ad app credential reset --id $appId --display-name $secretName -o json | ConvertFrom-Json

if (-not $secretJson) {
    Write-Host "Error: Failed to generate client secret" -ForegroundColor Red
    exit 1
}

$clientSecret = $secretJson.password
Write-Host "Client secret generated!" -ForegroundColor Green

# Add Calendar API permissions
Write-Host "Adding Calendar API permissions..." -ForegroundColor Cyan
$calendarScope = "Calendars.ReadWrite"
az ad app permission add --id $appId --api 00000003-0000-0000-c000-000000000000 --api-permissions "$calendarScope=Scope" | Out-Null

# Grant admin consent (this may require admin privileges)
Write-Host "Granting admin consent..." -ForegroundColor Cyan
try {
    az ad app permission admin-consent --id $appId | Out-Null
    Write-Host "Admin consent granted!" -ForegroundColor Green
} catch {
    Write-Host "Warning: Could not grant admin consent automatically. You may need to do this manually in Azure Portal." -ForegroundColor Yellow
    Write-Host "Go to: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$appId" -ForegroundColor Cyan
}

# Store in AWS Parameter Store
Write-Host "`nStoring credentials in AWS Parameter Store..." -ForegroundColor Cyan
aws ssm put-parameter --name "/handycall/oauth/microsoft/client-id" --value $appId --type "SecureString" --overwrite
aws ssm put-parameter --name "/handycall/oauth/microsoft/client-secret" --value $clientSecret --type "SecureString" --overwrite
aws ssm put-parameter --name "/handycall/oauth/microsoft/redirect-uri" --value $RedirectUri --type "String" --overwrite
aws ssm put-parameter --name "/handycall/oauth/microsoft/tenant-id" --value "common" --type "String" --overwrite

Write-Host "`nCredentials stored in AWS Parameter Store:" -ForegroundColor Green
Write-Host "  /handycall/oauth/microsoft/client-id: $appId" -ForegroundColor Yellow
Write-Host "  /handycall/oauth/microsoft/client-secret: [HIDDEN]" -ForegroundColor Yellow
Write-Host "  /handycall/oauth/microsoft/redirect-uri: $RedirectUri" -ForegroundColor Yellow
Write-Host "  /handycall/oauth/microsoft/tenant-id: common" -ForegroundColor Yellow

Write-Host "`nSetup complete!" -ForegroundColor Green
