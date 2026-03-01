# Create Docker-based Elastic Beanstalk Environment
# Use this if you need to create a new environment from scratch with Docker support

$ErrorActionPreference = "Stop"

# Configuration
$APP_NAME = "handycall-api"
$ENV_NAME = "handycall-api-prod-docker"  # New environment name
$REGION = "us-east-1"
$PLATFORM = "64bit Amazon Linux 2023 v4.3.0 running Docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Create Docker EB Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if app exists
Write-Host "Step 1: Checking application..." -ForegroundColor Cyan
$appCheck = aws elasticbeanstalk describe-applications --application-names $APP_NAME --region $REGION 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating application $APP_NAME..." -ForegroundColor Yellow
    aws elasticbeanstalk create-application --application-name $APP_NAME --description "HandyCall API Backend" --region $REGION
    Write-Host "Application created" -ForegroundColor Green
} else {
    Write-Host "Application exists" -ForegroundColor Green
}

# Read .env file for environment variables
Write-Host ""
Write-Host "Step 2: Reading environment configuration..." -ForegroundColor Cyan
$envVars = @{}
if (Test-Path ".env") {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.+)$') {
            $envVars[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    Write-Host "Loaded $($envVars.Count) environment variables" -ForegroundColor Green
} else {
    Write-Host "WARNING: No .env file found" -ForegroundColor Yellow
}

# Build option settings
$optionSettings = @(
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production",
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=8080",
    "Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role",
    "Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=SingleInstance",
    "Namespace=aws:elasticbeanstalk:environment,OptionName=ServiceRole,Value=aws-elasticbeanstalk-service-role"
)

# Add environment variables
foreach ($key in $envVars.Keys) {
    $optionSettings += "Namespace=aws:elasticbeanstalk:application:environment,OptionName=$key,Value=$($envVars[$key])"
}

# Create environment
Write-Host ""
Write-Host "Step 3: Creating Docker environment..." -ForegroundColor Cyan
Write-Host "This will take 5-10 minutes..." -ForegroundColor Yellow
Write-Host ""

aws elasticbeanstalk create-environment `
    --application-name $APP_NAME `
    --environment-name $ENV_NAME `
    --platform-arn "arn:aws:elasticbeanstalk:${REGION}::platform/Docker running on 64bit Amazon Linux 2023/4.3.0" `
    --option-settings $optionSettings `
    --region $REGION `
    --no-cli-pager

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Failed to create environment" -ForegroundColor Red
    Write-Host "You may need to check:" -ForegroundColor Yellow
    Write-Host "  1. IAM roles exist (aws-elasticbeanstalk-ec2-role, aws-elasticbeanstalk-service-role)" -ForegroundColor Yellow
    Write-Host "  2. Platform ARN is correct for your region" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Environment Creation Initiated!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Environment name: $ENV_NAME" -ForegroundColor White
Write-Host ""
Write-Host "Monitor creation with:" -ForegroundColor Yellow
Write-Host "  aws elasticbeanstalk describe-environments --application-name $APP_NAME --environment-names $ENV_NAME --region $REGION" -ForegroundColor White
Write-Host ""
Write-Host "After the environment is ready (Green status), deploy with:" -ForegroundColor Yellow
Write-Host "  .\deploy-docker-eb.ps1" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: Update the ENV_NAME variable in deploy-docker-eb.ps1 to '$ENV_NAME'" -ForegroundColor Yellow
Write-Host ""
