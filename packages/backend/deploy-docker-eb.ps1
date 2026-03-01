# Docker-based Elastic Beanstalk Deployment Script for HandyCall Backend
# This script builds a Docker image and deploys it to AWS Elastic Beanstalk

$ErrorActionPreference = "Stop"

# Configuration
$APP_NAME = "handycall-api"
$ENV_NAME = "handycall-api-lb"
$REGION = "us-east-1"
$IMAGE_NAME = "handycall-backend"
$PLATFORM = "64bit Amazon Linux 2023 v4.3.0 running Docker"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HandyCall Docker EB Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get AWS Account ID
Write-Host "Step 1: Getting AWS account info..." -ForegroundColor Cyan
$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text --no-cli-pager)
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to get AWS account ID. Check your AWS credentials." -ForegroundColor Red
    exit 1
}
Write-Host "Account ID: $ACCOUNT_ID" -ForegroundColor Green

# Step 2: Create/Verify ECR Repository
Write-Host ""
Write-Host "Step 2: Setting up ECR repository..." -ForegroundColor Cyan
$ECR_REPO = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$IMAGE_NAME"

$ErrorActionPreference = "Continue"
$repoCheck = aws ecr describe-repositories --repository-names $IMAGE_NAME --region $REGION --no-cli-pager 2>&1
$repoExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"

if (-not $repoExists) {
    Write-Host "Creating ECR repository..." -ForegroundColor Yellow
    aws ecr create-repository --repository-name $IMAGE_NAME --region $REGION --no-cli-pager
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create ECR repository" -ForegroundColor Red
        exit 1
    }
    Write-Host "ECR repository created" -ForegroundColor Green
} else {
    Write-Host "ECR repository exists" -ForegroundColor Green
}

# Step 3: Login to ECR
Write-Host ""
Write-Host "Step 3: Logging into ECR..." -ForegroundColor Cyan
$ecrPassword = aws ecr get-login-password --region $REGION --no-cli-pager
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to get ECR login password" -ForegroundColor Red
    exit 1
}
$ecrPassword | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker login to ECR failed" -ForegroundColor Red
    exit 1
}
Write-Host "ECR login successful" -ForegroundColor Green

# Step 4: Build Docker image
Write-Host ""
Write-Host "Step 4: Building Docker image..." -ForegroundColor Cyan
Write-Host "This may take a few minutes..." -ForegroundColor Yellow

# Build from project root to include both packages/shared and packages/backend
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
$originalLocation = Get-Location

try {
    Set-Location $projectRoot
    Write-Host "Building from: $(Get-Location)" -ForegroundColor Gray
    Write-Host "Dockerfile: packages/backend/Dockerfile" -ForegroundColor Gray
    
    # Build Docker image - use regular docker build (Docker Desktop handles buildx automatically)
    # Build the command as a string and execute via cmd to avoid PowerShell parsing issues
    $buildCmd = "docker build -f packages/backend/Dockerfile -t $IMAGE_NAME`:latest ."
    Write-Host "Executing: $buildCmd" -ForegroundColor Gray
    cmd /c $buildCmd
    $buildResult = $LASTEXITCODE
} finally {
    Set-Location $originalLocation
}

if ($buildResult -ne 0) {
    Write-Host "ERROR: Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host "Docker image built successfully" -ForegroundColor Green

# Step 5: Tag and Push to ECR
Write-Host ""
Write-Host "Step 5: Pushing to ECR..." -ForegroundColor Cyan
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_TAG = "${ECR_REPO}:${TIMESTAMP}"
$IMAGE_LATEST = "${ECR_REPO}:latest"

docker tag "${IMAGE_NAME}:latest" $IMAGE_TAG
docker tag "${IMAGE_NAME}:latest" $IMAGE_LATEST

Write-Host "Pushing tagged image: $IMAGE_TAG" -ForegroundColor Yellow
docker push $IMAGE_TAG
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Failed to push tagged image" -ForegroundColor Red
  exit 1
}

Write-Host "Pushing latest image: $IMAGE_LATEST" -ForegroundColor Yellow
docker push $IMAGE_LATEST
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Failed to push latest image" -ForegroundColor Red
  exit 1
}
Write-Host "Images pushed to ECR" -ForegroundColor Green
Write-Host "Using image tag: $IMAGE_TAG" -ForegroundColor Green

# Step 6: Create Dockerrun.aws.json with ECR image
Write-Host ""
Write-Host "Step 6: Creating deployment bundle..." -ForegroundColor Cyan

$dockerrunContent = @"
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "$IMAGE_TAG",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 8080,
      "HostPort": 8080
    }
  ],
  "Logging": "/var/log/nginx"
}
"@

# Use UTF8NoBOM encoding to avoid BOM issues
$utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\Dockerrun.aws.json", $dockerrunContent, $utf8NoBomEncoding)

# Create deployment zip
if (Test-Path "deploy.zip") { Remove-Item "deploy.zip" -Force }
Compress-Archive -Path "Dockerrun.aws.json" -DestinationPath "deploy.zip" -Force

$size = (Get-Item deploy.zip).Length / 1KB
Write-Host "Deployment bundle created: $([math]::Round($size, 2)) KB" -ForegroundColor Green

# Step 7: Upload to S3
Write-Host ""
Write-Host "Step 7: Uploading to S3..." -ForegroundColor Cyan
$S3_BUCKET = "elasticbeanstalk-$REGION-$ACCOUNT_ID"
$S3_KEY = "$APP_NAME/deploy-docker-$TIMESTAMP.zip"

# Create S3 bucket if it doesn't exist
aws s3 ls "s3://$S3_BUCKET" --no-cli-pager 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating S3 bucket..." -ForegroundColor Yellow
    aws s3 mb "s3://$S3_BUCKET" --region $REGION --no-cli-pager
}

aws s3 cp deploy.zip "s3://$S3_BUCKET/$S3_KEY" --region $REGION --only-show-errors --no-cli-pager
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload to S3" -ForegroundColor Red
    exit 1
}
Write-Host "Upload complete" -ForegroundColor Green

# Step 8: Create Application Version
Write-Host ""
Write-Host "Step 8: Creating application version..." -ForegroundColor Cyan
$VERSION_LABEL = "docker-v-$TIMESTAMP"

aws elasticbeanstalk create-application-version `
    --application-name $APP_NAME `
    --version-label $VERSION_LABEL `
    --source-bundle "S3Bucket=$S3_BUCKET,S3Key=$S3_KEY" `
    --region $REGION `
    --no-cli-pager `
    --output json | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create application version" -ForegroundColor Red
    exit 1
}
Write-Host "Version created: $VERSION_LABEL" -ForegroundColor Green

# Step 9: Check if we need to update environment to Docker platform
Write-Host ""
Write-Host "Step 9: Checking environment platform..." -ForegroundColor Cyan
$currentPlatform = aws elasticbeanstalk describe-environments `
    --application-name $APP_NAME `
    --environment-names $ENV_NAME `
    --region $REGION `
    --query "Environments[0].PlatformArn" `
    --no-cli-pager `
    --output text

if ($currentPlatform -notlike "*Docker*") {
    Write-Host "WARNING: Environment is not on Docker platform!" -ForegroundColor Yellow
    Write-Host "Current platform: $currentPlatform" -ForegroundColor Yellow
    Write-Host "You may need to recreate the environment with Docker platform" -ForegroundColor Yellow
    Write-Host "Run create-docker-eb-env.ps1 to create a new Docker-based environment" -ForegroundColor Yellow
} else {
    Write-Host "Environment is on Docker platform" -ForegroundColor Green
}

# Step 10: Deploy
Write-Host ""
Write-Host "Step 10: Deploying to environment..." -ForegroundColor Cyan

# Simply update the version label - environment variables are already set correctly
# This avoids any issues with comma-separated values in CORS_ORIGINS
Write-Host "Updating environment with version $VERSION_LABEL (environment variables unchanged)..." -ForegroundColor Yellow

aws elasticbeanstalk update-environment `
    --application-name $APP_NAME `
    --environment-name $ENV_NAME `
    --version-label $VERSION_LABEL `
    --region $REGION `
    --no-cli-pager `
    --output json | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update environment" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Initiated Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Image pushed to: $IMAGE_TAG" -ForegroundColor White
Write-Host ""
Write-Host "Monitor deployment with:" -ForegroundColor Yellow
Write-Host "  aws elasticbeanstalk describe-environments --application-name $APP_NAME --environment-names $ENV_NAME --region $REGION" -ForegroundColor White
Write-Host ""
Write-Host "Get environment URL:" -ForegroundColor Yellow
Write-Host "  aws elasticbeanstalk describe-environments --application-name $APP_NAME --environment-names $ENV_NAME --query ""Environments[0].CNAME"" --output text --region $REGION" -ForegroundColor White
Write-Host ""
Write-Host "View logs:" -ForegroundColor Yellow
Write-Host "  eb logs -a $APP_NAME -e $ENV_NAME" -ForegroundColor White
Write-Host ""
