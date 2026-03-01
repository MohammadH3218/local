param(
  [Parameter(Mandatory = $true)]
  [string]$GoogleCredentialsJsonPath,

  [string]$CalcomEnvironmentName = "handycall-calcom-lb",

  [string]$CalcomDbHost = "handycall-calcom-postgres.cbm8w6au6nfw.us-east-1.rds.amazonaws.com",

  [string]$CalcomDbName = "calcom",

  [string]$CalcomDbUsernameParam = "/handycall/prod/calcom/db_username",
  [string]$CalcomDbPasswordParam = "/handycall/prod/calcom/db_password",

  [string]$InstanceId
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $GoogleCredentialsJsonPath)) {
  throw "File not found: $GoogleCredentialsJsonPath"
}

$raw = Get-Content -Path $GoogleCredentialsJsonPath -Raw
$parsed = $raw | ConvertFrom-Json

if (-not $parsed.web) {
  throw "Expected Google OAuth credentials JSON with top-level 'web' object (downloaded OAuth client JSON)."
}

$clientId = $parsed.web.client_id
$clientSecret = $parsed.web.client_secret
$redirectUris = @($parsed.web.redirect_uris)

if (-not $clientId -or -not $clientSecret -or $redirectUris.Count -lt 1) {
  throw "Missing client_id/client_secret/redirect_uris in credentials JSON."
}

$requiredRedirect = "https://cal.handycall.org/api/integrations/googlecalendar/callback"
if ($redirectUris -notcontains $requiredRedirect) {
  throw "Missing required redirect URI: $requiredRedirect"
}

Write-Host "Setting EB environment variable GOOGLE_API_CREDENTIALS on $CalcomEnvironmentName..."
aws elasticbeanstalk update-environment `
  --environment-name $CalcomEnvironmentName `
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=GOOGLE_API_CREDENTIALS,Value=$raw `
  | Out-Null

if (-not $InstanceId) {
  $InstanceId = (aws elasticbeanstalk describe-environment-resources --environment-name $CalcomEnvironmentName | ConvertFrom-Json).EnvironmentResources.Instances[0].Id
}

Write-Host "Updating Cal.com App keys in Postgres via SSM on instance $InstanceId..."

$tmp = Join-Path $env:TEMP ("ssm-tmp-set-google-keys-" + [Guid]::NewGuid().ToString("N") + ".json")
$ssmPayload = @"
{
  "DocumentName": "AWS-RunShellScript",
  "InstanceIds": ["$InstanceId"],
  "Parameters": {
    "commands": [
      "set -euo pipefail",
      "DBHOST=$CalcomDbHost",
      "DBUSER=\$(aws ssm get-parameter --name $CalcomDbUsernameParam --query Parameter.Value --output text)",
      "DBPASS=\$(aws ssm get-parameter --name $CalcomDbPasswordParam --with-decryption --query Parameter.Value --output text)",
      "SQL=\"update \\\"App\\\" set keys=jsonb_build_object('client_id', '$clientId', 'client_secret', '$clientSecret', 'redirect_uris', '$(($redirectUris | ConvertTo-Json -Compress))'::jsonb), \\\"updatedAt\\\"=now() where slug='google-calendar';\"",
      "docker run --rm -e PGPASSWORD=\"$DBPASS\" postgres:15 psql \"host=$DBHOST port=5432 user=$DBUSER dbname=$CalcomDbName\" -c \"$SQL\"",
      "docker run --rm -e PGPASSWORD=\"$DBPASS\" postgres:15 psql \"host=$DBHOST port=5432 user=$DBUSER dbname=$CalcomDbName\" -tAc \"select (keys ? 'client_id')::text || ',' || (keys ? 'client_secret')::text || ',' || (keys ? 'redirect_uris')::text from \\\"App\\\" where slug='google-calendar';\""
    ]
  }
}
"@

$ssmPayload | Set-Content -Path $tmp -Encoding ascii

$commandId = (aws ssm send-command --cli-input-json ("file://$tmp") | ConvertFrom-Json).Command.CommandId
Start-Sleep -Seconds 2
$invocation = (aws ssm get-command-invocation --command-id $commandId --instance-id $InstanceId | ConvertFrom-Json)
Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue

if ($invocation.Status -ne "Success") {
  throw "SSM command failed: $($invocation.Status)`n$($invocation.StandardErrorContent)"
}

Write-Host "Google Calendar OAuth configured (GOOGLE_API_CREDENTIALS + App keys)."
