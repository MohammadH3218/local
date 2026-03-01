# Docker-based Elastic Beanstalk Deployment Script for HandyCall Voice Bridge

param(
  [string]$EnvName = $env:VOICE_BRIDGE_EB_ENV_NAME,
  [string]$AppName = $env:VOICE_BRIDGE_EB_APP_NAME,
  [string]$Region = $env:VOICE_BRIDGE_AWS_REGION
)

$ErrorActionPreference = "Stop"

$APP_NAME = if ($AppName) { $AppName } else { "handycall-voice-bridge" }
$ENV_NAME = if ($EnvName) { $EnvName } else { "handycall-voice-bridge-alb" }
$REGION = if ($Region) { $Region } else { "us-east-1" }
$IMAGE_NAME = "handycall-voice-bridge"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "HandyCall Voice Bridge Docker EB Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text --no-cli-pager)
if ($LASTEXITCODE -ne 0) { throw "Failed to get AWS account ID" }

$ECR_REPO = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$IMAGE_NAME"

Write-Host "Ensuring ECR repo exists..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
$repoCheck = aws ecr describe-repositories --repository-names $IMAGE_NAME --region $REGION --no-cli-pager 2>&1
$repoExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"
if (-not $repoExists) {
  aws ecr create-repository --repository-name $IMAGE_NAME --region $REGION --no-cli-pager | Out-Null
}

Write-Host "Logging into ECR..." -ForegroundColor Cyan
$ecrPassword = aws ecr get-login-password --region $REGION --no-cli-pager
$ecrPassword | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com" 2>&1 | Out-Null

Write-Host "Building Docker image..." -ForegroundColor Cyan
$projectRoot = (Resolve-Path ".").Path
$buildCmd = "docker build -f packages/voice-bridge/Dockerfile -t $IMAGE_NAME`:latest ."
cmd /c $buildCmd
if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }

$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_TAG = "${ECR_REPO}:${TIMESTAMP}"
$IMAGE_LATEST = "${ECR_REPO}:latest"

docker tag "${IMAGE_NAME}:latest" $IMAGE_TAG
docker tag "${IMAGE_NAME}:latest" $IMAGE_LATEST
docker push $IMAGE_TAG
if ($LASTEXITCODE -ne 0) { throw "Failed to push image tag" }
docker push $IMAGE_LATEST
if ($LASTEXITCODE -ne 0) { throw "Failed to push latest image" }

Write-Host "Creating Dockerrun bundle..." -ForegroundColor Cyan
$dockerrunContent = @"
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "$IMAGE_TAG",
    "Update": "true"
  },
  "Ports": [
    { "ContainerPort": 8080, "HostPort": 8080 }
  ]
}
"@

if (Test-Path "voice-bridge-deploy.zip") { Remove-Item "voice-bridge-deploy.zip" -Force }

$deployDir = Join-Path (Resolve-Path ".").Path ".deploy\\voice-bridge"
if (Test-Path $deployDir) { Remove-Item $deployDir -Recurse -Force }
New-Item -ItemType Directory -Path $deployDir | Out-Null

$dockerrunPath = Join-Path $deployDir "Dockerrun.aws.json"
$utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($dockerrunPath, $dockerrunContent, $utf8NoBomEncoding)

$platformDir = "packages\\voice-bridge\\.platform"
# Note: PowerShell's Compress-Archive writes backslashes into Zip entry names on Windows.
# Linux `unzip` treats that as an error and EB fails the deployment. We build the zip with Python
# and force POSIX-style (forward-slash) paths inside the archive.
$zipPath = "voice-bridge-deploy.zip"

$py = @"
import os
import sys
import zipfile

zip_path = sys.argv[1]
platform_dir = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "" else None
deploy_dir = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "" else "."

def to_posix(path: str) -> str:
  return path.replace(os.sep, "/")

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
  z.write(os.path.join(deploy_dir, "Dockerrun.aws.json"), arcname="Dockerrun.aws.json")

  if platform_dir and os.path.isdir(platform_dir):
    for root, _, files in os.walk(platform_dir):
      for name in files:
        src = os.path.join(root, name)
        rel = os.path.relpath(src, platform_dir)
        arc = ".platform/" + to_posix(rel)
        z.write(src, arcname=arc)
"@

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $platformDir) {
  $py | python - $zipPath $platformDir $deployDir
} else {
  $py | python - $zipPath "" $deployDir
}

$S3_BUCKET = "elasticbeanstalk-$REGION-$ACCOUNT_ID"
$S3_KEY = "$APP_NAME/deploy-docker-$TIMESTAMP.zip"

aws s3 ls "s3://$S3_BUCKET" --no-cli-pager 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { aws s3 mb "s3://$S3_BUCKET" --region $REGION --no-cli-pager | Out-Null }

aws s3 cp voice-bridge-deploy.zip "s3://$S3_BUCKET/$S3_KEY" --region $REGION --only-show-errors --no-cli-pager
if ($LASTEXITCODE -ne 0) { throw "Failed to upload bundle" }

$VERSION_LABEL = "docker-v-$TIMESTAMP"
aws elasticbeanstalk create-application-version `
  --application-name $APP_NAME `
  --version-label $VERSION_LABEL `
  --source-bundle "S3Bucket=$S3_BUCKET,S3Key=$S3_KEY" `
  --region $REGION `
  --no-cli-pager | Out-Null

aws elasticbeanstalk update-environment `
  --application-name $APP_NAME `
  --environment-name $ENV_NAME `
  --version-label $VERSION_LABEL `
  --region $REGION `
  --no-cli-pager | Out-Null

Write-Host "Deployment started for $ENV_NAME with version $VERSION_LABEL" -ForegroundColor Green

if (Test-Path $deployDir) { Remove-Item $deployDir -Recurse -Force }
