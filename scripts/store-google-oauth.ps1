# Store Google OAuth credentials in AWS Parameter Store

param(
    [Parameter(Mandatory=$true)]
    [string]$ClientId,
    
    [Parameter(Mandatory=$true)]
    [string]$ClientSecret,
    
    [string]$RedirectUri = "https://api.handycall.org/api/v1/calendar-integration/auth/google/callback"
)

Write-Host "Storing Google OAuth credentials in AWS Parameter Store..." -ForegroundColor Cyan

try {
    aws ssm put-parameter --name "/handycall/oauth/google/client-id" --value $ClientId --type "SecureString" --overwrite | Out-Null
    Write-Host "✓ Stored client ID" -ForegroundColor Green
    
    aws ssm put-parameter --name "/handycall/oauth/google/client-secret" --value $ClientSecret --type "SecureString" --overwrite | Out-Null
    Write-Host "✓ Stored client secret" -ForegroundColor Green
    
    aws ssm put-parameter --name "/handycall/oauth/google/redirect-uri" --value $RedirectUri --type "String" --overwrite | Out-Null
    Write-Host "✓ Stored redirect URI" -ForegroundColor Green
    
    Write-Host "`nCredentials stored successfully in AWS Parameter Store:" -ForegroundColor Green
    Write-Host "  /handycall/oauth/google/client-id" -ForegroundColor Yellow
    Write-Host "  /handycall/oauth/google/client-secret" -ForegroundColor Yellow
    Write-Host "  /handycall/oauth/google/redirect-uri" -ForegroundColor Yellow
} catch {
    Write-Host "Error storing credentials: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
