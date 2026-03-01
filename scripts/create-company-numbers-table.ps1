param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("dev", "staging", "prod")]
  [string]$EnvName = "dev",

  [Parameter(Mandatory = $false)]
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

$tableName = "handycall_{0}_company_numbers" -f $EnvName

Write-Host "Creating DynamoDB table: $tableName (region: $Region)" -ForegroundColor Cyan

$exists = $false
try {
  aws dynamodb describe-table --table-name $tableName --region $Region 2>$null | Out-Null
  $exists = $true
} catch {
  $exists = $false
}

if ($exists) {
  Write-Host "Table already exists: $tableName" -ForegroundColor Green
  exit 0
}

$gsiJson = '[{"IndexName":"company-index","KeySchema":[{"AttributeName":"company_id","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'
$gsiFile = Join-Path $env:TEMP "company-numbers-gsi.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($gsiFile, $gsiJson, $utf8NoBom)

aws dynamodb create-table `
  --table-name $tableName `
  --region $Region `
  --billing-mode PAY_PER_REQUEST `
  --attribute-definitions `
    AttributeName=did_e164,AttributeType=S `
    AttributeName=company_id,AttributeType=S `
  --key-schema `
    AttributeName=did_e164,KeyType=HASH `
  --global-secondary-indexes file://$gsiFile

aws dynamodb wait table-exists --table-name $tableName --region $Region
Write-Host "Table ACTIVE: $tableName" -ForegroundColor Green
