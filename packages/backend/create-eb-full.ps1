# Complete Elastic Beanstalk Setup Script
# This script creates the EB application, environment, and sets all environment variables

$ErrorActionPreference = "Stop"

# Configuration
$APP_NAME = "handycall-api"
$ENV_NAME = "handycall-api-prod"
$REGION = "us-east-1"
$SOLUTION_STACK = "64bit Amazon Linux 2023 v6.1.2 running Node.js 20"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HandyCall Elastic Beanstalk Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env file
Write-Host "📋 Loading environment variables from .env..." -ForegroundColor Yellow
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Variable -Name $name -Value $value
        }
    }
    Write-Host "✅ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    exit 1
}

# Generate secure secrets if not already set
if ($JWT_SECRET -eq "your-super-secret-jwt-key-change-in-production") {
    Write-Host "⚠️  WARNING: Using default JWT_SECRET! Generate a secure one for production!" -ForegroundColor Red
}

# Step 1: Create EB Application
Write-Host ""
Write-Host "Step 1: Creating Elastic Beanstalk Application" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

$appExists = aws elasticbeanstalk describe-applications --application-names $APP_NAME --region $REGION 2>&1 | Out-String

if ($appExists -like "*$APP_NAME*") {
    Write-Host "✅ Application '$APP_NAME' already exists" -ForegroundColor Green
} else {
    Write-Host "📝 Creating application '$APP_NAME'..." -ForegroundColor Yellow
    aws elasticbeanstalk create-application `
        --application-name $APP_NAME `
        --description "HandyCall API - Multi-tenant AI Receptionist Platform" `
        --region $REGION

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Application created successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to create application" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Build the application
Write-Host ""
Write-Host "Step 2: Building Application" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

Write-Host "  📦 Building shared package..." -ForegroundColor Gray
Push-Location ../shared
npm install --silent
npm run build
Pop-Location

Write-Host "  📦 Installing backend dependencies..." -ForegroundColor Gray
npm install --silent

Write-Host "  🔨 Building backend..." -ForegroundColor Gray
npm run build

Write-Host "✅ Build completed" -ForegroundColor Green

# Step 3: Create deployment package
Write-Host ""
Write-Host "Step 3: Creating Deployment Package" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

if (Test-Path deploy.zip) {
    Remove-Item deploy.zip -Force
    Write-Host "  🗑️  Removed old deploy.zip" -ForegroundColor Gray
}

Write-Host "  📦 Packaging application..." -ForegroundColor Gray
$itemsToZip = @(
    "dist",
    "node_modules",
    "package.json",
    "package-lock.json",
    ".ebextensions",
    ".npmrc"
)

Compress-Archive -Path $itemsToZip -DestinationPath deploy.zip -Force
Write-Host "✅ Deployment package created: deploy.zip" -ForegroundColor Green

# Get package size
$size = (Get-Item deploy.zip).Length / 1MB
Write-Host "   Package size: $([math]::Round($size, 2)) MB" -ForegroundColor Gray

# Step 4: Upload to S3
Write-Host ""
Write-Host "Step 4: Uploading to S3" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$S3_BUCKET = "elasticbeanstalk-$REGION-$ACCOUNT_ID"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$S3_KEY = "$APP_NAME/deploy-$TIMESTAMP.zip"

# Check if S3 bucket exists, create if not
$bucketExists = aws s3 ls "s3://$S3_BUCKET" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  📦 Creating S3 bucket: $S3_BUCKET..." -ForegroundColor Yellow
    aws s3 mb "s3://$S3_BUCKET" --region $REGION
}

Write-Host "  ☁️  Uploading to s3://$S3_BUCKET/$S3_KEY..." -ForegroundColor Gray
aws s3 cp deploy.zip "s3://$S3_BUCKET/$S3_KEY" --region $REGION --only-show-errors

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Upload completed" -ForegroundColor Green
} else {
    Write-Host "❌ Upload failed" -ForegroundColor Red
    exit 1
}

# Step 5: Create application version
Write-Host ""
Write-Host "Step 5: Creating Application Version" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

$VERSION_LABEL = "v-$TIMESTAMP"
Write-Host "  Version: $VERSION_LABEL" -ForegroundColor Gray

aws elasticbeanstalk create-application-version `
    --application-name $APP_NAME `
    --version-label $VERSION_LABEL `
    --description "Deploy at $TIMESTAMP" `
    --source-bundle "S3Bucket=$S3_BUCKET,S3Key=$S3_KEY" `
    --region $REGION `
    --no-cli-pager

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Application version created" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to create application version" -ForegroundColor Red
    exit 1
}

# Step 6: Check if environment exists
Write-Host ""
Write-Host "Step 6: Checking Environment Status" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray

$envInfo = aws elasticbeanstalk describe-environments `
    --application-name $APP_NAME `
    --environment-names $ENV_NAME `
    --region $REGION `
    --no-cli-pager 2>&1 | Out-String

$envExists = $envInfo -match '"EnvironmentName":\s*"' + $ENV_NAME + '"'

if ($envExists) {
    Write-Host "✅ Environment '$ENV_NAME' exists" -ForegroundColor Green
    Write-Host ""
    Write-Host "Step 7: Updating Environment" -ForegroundColor Cyan
    Write-Host "-----------------------------------------------" -ForegroundColor Gray

    Write-Host "  🔄 Updating environment with new version..." -ForegroundColor Yellow
    aws elasticbeanstalk update-environment `
        --application-name $APP_NAME `
        --environment-name $ENV_NAME `
        --version-label $VERSION_LABEL `
        --region $REGION `
        --no-cli-pager

    Write-Host "✅ Environment update initiated" -ForegroundColor Green
} else {
    Write-Host "📝 Environment does not exist. Creating new environment..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Step 7: Creating Environment" -ForegroundColor Cyan
    Write-Host "-----------------------------------------------" -ForegroundColor Gray
    Write-Host "   ⏱️  This may take 5-10 minutes..." -ForegroundColor Yellow

    # Prepare environment variables for EB
    $envVars = @(
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=8080",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=API_PREFIX,Value=api/v1",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=JWT_SECRET,Value=$JWT_SECRET",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=JWT_EXPIRES_IN,Value=$JWT_EXPIRES_IN",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=REFRESH_TOKEN_SECRET,Value=$REFRESH_TOKEN_SECRET",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=REFRESH_TOKEN_EXPIRES_IN,Value=$REFRESH_TOKEN_EXPIRES_IN",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value=$AWS_REGION",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_POOL_ID,Value=$AWS_COGNITO_USERS_POOL_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_CLIENT_ID,Value=$AWS_COGNITO_USERS_CLIENT_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_CLIENT_SECRET,Value=$AWS_COGNITO_USERS_CLIENT_SECRET",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_POOL_ID,Value=$AWS_COGNITO_ADMIN_POOL_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_CLIENT_ID,Value=$AWS_COGNITO_ADMIN_CLIENT_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_CLIENT_SECRET,Value=$AWS_COGNITO_ADMIN_CLIENT_SECRET",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=DYNAMODB_TABLE_PREFIX,Value=handycall_prod_",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=USE_PARAMETER_STORE,Value=true",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_KEY_ID_PARAM,Value=/handycall/apns/key-id",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_TEAM_ID_PARAM,Value=/handycall/apns/team-id",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_BUNDLE_ID_PARAM,Value=/handycall/apns/bundle-id",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_PRIVATE_KEY_PARAM,Value=/handycall/apns/private-key",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_PRIVATE_KEY_BASE64_PARAM,Value=/handycall/apns/private-key-base64",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=S3_BUCKET_RECORDINGS,Value=handycall-recordings-prod",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=S3_BUCKET_TRANSCRIPTS,Value=handycall-transcripts-prod",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=BEDROCK_MODEL_ID,Value=$BEDROCK_MODEL_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=BEDROCK_EMBEDDING_MODEL_ID,Value=$BEDROCK_EMBEDDING_MODEL_ID",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TELEPHONY_PROVIDER,Value=mock",
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=CORS_ORIGINS,Value=https://master.dwonwh39izoea.amplifyapp.com",
        "Namespace=aws:elasticbeanstalk:container:nodejs,OptionName=NodeCommand,Value=npm run start:prod",
        "Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role",
        "Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=SingleInstance"
    )

    aws elasticbeanstalk create-environment `
        --application-name $APP_NAME `
        --environment-name $ENV_NAME `
        --solution-stack-name $SOLUTION_STACK `
        --version-label $VERSION_LABEL `
        --option-settings $envVars `
        --region $REGION `
        --no-cli-pager

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Environment creation initiated" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to create environment" -ForegroundColor Red
        exit 1
    }
}

# Step 8: Monitor deployment
Write-Host ""
Write-Host "Step 8: Monitoring Deployment" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor Gray
Write-Host "  Waiting for environment to become ready..." -ForegroundColor Yellow

$maxAttempts = 30
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts -and -not $ready) {
    Start-Sleep -Seconds 10
    $attempt++

    $status = aws elasticbeanstalk describe-environments `
        --application-name $APP_NAME `
        --environment-names $ENV_NAME `
        --region $REGION `
        --query "Environments[0].[Status,Health]" `
        --output text

    $statusParts = $status -split "\s+"
    $envStatus = $statusParts[0]
    $envHealth = $statusParts[1]

    Write-Host "  [$attempt/$maxAttempts] Status: $envStatus, Health: $envHealth" -ForegroundColor Gray

    if ($envStatus -eq "Ready") {
        $ready = $true
        Write-Host ""
        Write-Host "✅ Environment is ready!" -ForegroundColor Green

        # Get environment URL
        $url = aws elasticbeanstalk describe-environments `
            --application-name $APP_NAME `
            --environment-names $ENV_NAME `
            --region $REGION `
            --query "Environments[0].CNAME" `
            --output text

        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Backend URL: http://$url" -ForegroundColor Cyan
        Write-Host "API Endpoint: http://$url/api/v1" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Yellow
        Write-Host "1. Update your Amplify frontend with NEXT_PUBLIC_API_URL=http://$url/api/v1" -ForegroundColor White
        Write-Host "2. Test the API: curl http://$url/api/v1/health" -ForegroundColor White
        Write-Host "3. Create DynamoDB tables if not already created" -ForegroundColor White
        Write-Host ""
        Write-Host "Useful Commands:" -ForegroundColor Yellow
        Write-Host "  Check logs: aws elasticbeanstalk retrieve-environment-info --environment-name $ENV_NAME --info-type tail" -ForegroundColor White
        Write-Host "  View events: aws elasticbeanstalk describe-events --environment-name $ENV_NAME --max-records 20" -ForegroundColor White
        Write-Host ""
    }
}

if (-not $ready) {
    Write-Host ""
    Write-Host "⏱️  Deployment is taking longer than expected" -ForegroundColor Yellow
    Write-Host "   Check the AWS Console for detailed status" -ForegroundColor Gray
    Write-Host "   Or run: aws elasticbeanstalk describe-environments --environment-name $ENV_NAME" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Script completed at $(Get-Date)" -ForegroundColor Gray
