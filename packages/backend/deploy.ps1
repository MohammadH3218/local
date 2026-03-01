# HandyCall Backend Deployment Script (PowerShell)
# Builds Docker image, pushes to ECR, and deploys to Elastic Beanstalk

$ErrorActionPreference = "Stop"

# Configuration
$AWS_REGION = "us-east-1"
$AWS_ACCOUNT_ID = "982081079378"
$ECR_REPOSITORY = "handycall-backend"
$ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
$IMAGE_NAME = "${ECR_REGISTRY}/${ECR_REPOSITORY}"
$EB_APP_NAME = "handycall-backend"
$EB_ENV_NAME = "handycall-backend-env"  # Update this to your actual EB environment name

# Generate version tag with timestamp
$VERSION_TAG = (Get-Date -Format "yyyyMMdd-HHmmss") + "-admin-role-fix"
Write-Host "Building version: ${VERSION_TAG}" -ForegroundColor Green

# Step 1: Build Docker image from monorepo root
Write-Host "`n===== Building Docker image =====" -ForegroundColor Cyan
Set-Location ..\..  # Go to monorepo root
docker build -f packages/backend/Dockerfile -t "${ECR_REPOSITORY}:${VERSION_TAG}" .
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${ECR_REPOSITORY}:latest"
Set-Location packages\backend

# Step 2: Login to ECR
Write-Host "`n===== Logging into ECR =====" -ForegroundColor Cyan
$ecrPassword = aws ecr get-login-password --region $AWS_REGION
$ecrPassword | docker login --username AWS --password-stdin $ECR_REGISTRY

# Step 3: Tag and push to ECR
Write-Host "`n===== Pushing to ECR =====" -ForegroundColor Cyan
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${IMAGE_NAME}:${VERSION_TAG}"
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${IMAGE_NAME}:latest"
docker push "${IMAGE_NAME}:${VERSION_TAG}"
docker push "${IMAGE_NAME}:latest"

# Step 4: Update Dockerrun.aws.json with new image tag
Write-Host "`n===== Updating Dockerrun.aws.json =====" -ForegroundColor Cyan
$dockerrunContent = @"
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "${IMAGE_NAME}:${VERSION_TAG}",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 8080,
      "HostPort": 80
    }
  ],
  "Logging": "/var/log/nginx"
}
"@
$dockerrunContent | Out-File -FilePath Dockerrun.aws.json -Encoding UTF8

# Step 5: Create deployment package
Write-Host "`n===== Creating deployment package =====" -ForegroundColor Cyan
$zipFile = "backend-${VERSION_TAG}.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile }
Compress-Archive -Path Dockerrun.aws.json -DestinationPath $zipFile

# Step 6: Upload to S3
Write-Host "`n===== Uploading to S3 =====" -ForegroundColor Cyan
aws s3 cp $zipFile "s3://elasticbeanstalk-${AWS_REGION}-${AWS_ACCOUNT_ID}/${zipFile}"

# Step 7: Create application version
Write-Host "`n===== Creating Elastic Beanstalk application version =====" -ForegroundColor Cyan
aws elasticbeanstalk create-application-version `
  --application-name $EB_APP_NAME `
  --version-label $VERSION_TAG `
  --source-bundle "S3Bucket=elasticbeanstalk-${AWS_REGION}-${AWS_ACCOUNT_ID},S3Key=${zipFile}" `
  --region $AWS_REGION

# Step 8: Update environment
Write-Host "`n===== Updating environment ${EB_ENV_NAME} =====" -ForegroundColor Cyan
aws elasticbeanstalk update-environment `
  --application-name $EB_APP_NAME `
  --environment-name $EB_ENV_NAME `
  --version-label $VERSION_TAG `
  --region $AWS_REGION

Write-Host "`n===== Deployment initiated successfully! =====" -ForegroundColor Green
Write-Host "Version: ${VERSION_TAG}" -ForegroundColor Yellow
Write-Host "Image: ${IMAGE_NAME}:${VERSION_TAG}" -ForegroundColor Yellow
Write-Host ""
Write-Host "Monitor deployment status:" -ForegroundColor Cyan
Write-Host "  aws elasticbeanstalk describe-environments --application-name $EB_APP_NAME --environment-names $EB_ENV_NAME --query 'Environments[0].Status'" -ForegroundColor White
Write-Host ""
Write-Host "Or check in AWS Console:" -ForegroundColor Cyan
Write-Host "  https://console.aws.amazon.com/elasticbeanstalk/home?region=${AWS_REGION}#/application/overview?applicationName=${EB_APP_NAME}" -ForegroundColor White
