# Backend Deployment Guide - Elastic Beanstalk with Docker

This guide covers deploying the HandyCall backend to AWS Elastic Beanstalk using Docker.

## Prerequisites

1. **AWS CLI** installed and configured
2. **Docker Desktop** running
3. **AWS credentials** with permissions for:
   - ECR (Elastic Container Registry)
   - Elastic Beanstalk
   - S3

## Quick Deployment

### Option 1: Automated Deployment (PowerShell - Windows)

```powershell
cd packages/backend

# First, find your Elastic Beanstalk environment name
aws elasticbeanstalk describe-environments --query 'Environments[?ApplicationName==`handycall-backend`].[EnvironmentName,Status,Health]' --output table

# Update the $EB_ENV_NAME variable in deploy.ps1 with your environment name
# Then run:
.\deploy.ps1
```

### Option 2: Automated Deployment (Bash - Linux/Mac/Git Bash)

```bash
cd packages/backend

# Make script executable
chmod +x deploy.sh

# Update the EB_ENV_NAME variable in deploy.sh with your environment name
./deploy.sh
```

## Manual Deployment Steps

If you prefer to run commands manually or need to troubleshoot:

### Step 1: Find Your Environment Name

```powershell
aws elasticbeanstalk describe-environments --output table
```

Look for your backend environment name (e.g., `handycall-backend-env`, `HandyCall-backend-prod`, etc.)

### Step 2: Build Docker Image

```powershell
# From the monorepo root (HandyCall/)
docker build -f packages/backend/Dockerfile -t handycall-backend:latest .
```

### Step 3: Tag Image for ECR

```powershell
$VERSION_TAG = (Get-Date -Format "yyyyMMdd-HHmmss") + "-admin-role-fix"
docker tag handycall-backend:latest 982081079378.dkr.ecr.us-east-1.amazonaws.com/handycall-backend:$VERSION_TAG
docker tag handycall-backend:latest 982081079378.dkr.ecr.us-east-1.amazonaws.com/handycall-backend:latest
```

### Step 4: Login to ECR

```powershell
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 982081079378.dkr.ecr.us-east-1.amazonaws.com
```

### Step 5: Push to ECR

```powershell
docker push 982081079378.dkr.ecr.us-east-1.amazonaws.com/handycall-backend:$VERSION_TAG
docker push 982081079378.dkr.ecr.us-east-1.amazonaws.com/handycall-backend:latest
```

### Step 6: Update Dockerrun.aws.json

```powershell
cd packages/backend

# Update the image tag in Dockerrun.aws.json
# Change line 4 to: "Name": "982081079378.dkr.ecr.us-east-1.amazonaws.com/handycall-backend:YOUR_VERSION_TAG"
```

### Step 7: Create Deployment Package

```powershell
Compress-Archive -Path Dockerrun.aws.json -DestinationPath backend-deploy.zip -Force
```

### Step 8: Deploy to Elastic Beanstalk

**Option A: Using AWS Console**
1. Go to [Elastic Beanstalk Console](https://console.aws.amazon.com/elasticbeanstalk)
2. Select your backend application
3. Click "Upload and deploy"
4. Upload `backend-deploy.zip`
5. Click "Deploy"

**Option B: Using AWS CLI**
```powershell
# Replace YOUR_ENV_NAME with your actual environment name
$EB_ENV_NAME = "handycall-backend-env"

# Upload to S3
aws s3 cp backend-deploy.zip s3://elasticbeanstalk-us-east-1-982081079378/backend-deploy.zip

# Create application version
aws elasticbeanstalk create-application-version `
  --application-name handycall-backend `
  --version-label $VERSION_TAG `
  --source-bundle S3Bucket=elasticbeanstalk-us-east-1-982081079378,S3Key=backend-deploy.zip `
  --region us-east-1

# Deploy to environment
aws elasticbeanstalk update-environment `
  --application-name handycall-backend `
  --environment-name $EB_ENV_NAME `
  --version-label $VERSION_TAG `
  --region us-east-1
```

## Monitor Deployment

### Check Deployment Status

```powershell
aws elasticbeanstalk describe-environments `
  --application-name handycall-backend `
  --environment-names YOUR_ENV_NAME `
  --query 'Environments[0].[EnvironmentName,Status,Health]' `
  --output table
```

### View Logs

```powershell
# Request logs
aws elasticbeanstalk request-environment-info `
  --environment-name YOUR_ENV_NAME `
  --info-type tail `
  --region us-east-1

# Wait a minute, then retrieve logs
aws elasticbeanstalk retrieve-environment-info `
  --environment-name YOUR_ENV_NAME `
  --info-type tail `
  --region us-east-1
```

## Troubleshooting

### Issue: Docker build fails

**Solution:** Make sure you're building from the monorepo root (HandyCall/), not from packages/backend/

```powershell
# Correct (from HandyCall/)
docker build -f packages/backend/Dockerfile -t handycall-backend:latest .

# Incorrect (from packages/backend/)
docker build -f Dockerfile -t handycall-backend:latest .  # ❌ This won't work
```

### Issue: ECR login fails

**Solution:** Check your AWS credentials and region

```powershell
aws sts get-caller-identity  # Verify credentials
aws configure get region      # Verify region is us-east-1
```

### Issue: Deployment stuck or fails

**Solution:** Check the health status and logs

```powershell
# Check environment health
aws elasticbeanstalk describe-environment-health `
  --environment-name YOUR_ENV_NAME `
  --attribute-names All `
  --region us-east-1

# Check recent events
aws elasticbeanstalk describe-events `
  --environment-name YOUR_ENV_NAME `
  --max-items 20 `
  --region us-east-1
```

## Environment Variables

Environment variables are configured in the Elastic Beanstalk environment. To update them:

### Using AWS Console
1. Go to Elastic Beanstalk > Your Environment > Configuration
2. Click "Edit" on Software section
3. Add/modify environment properties
4. Click "Apply"

### Using AWS CLI
```powershell
aws elasticbeanstalk update-environment `
  --environment-name YOUR_ENV_NAME `
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production `
  --region us-east-1
```

## What This Deployment Fixes

This deployment includes the fix for the admin/customer portal routing issue:
- ✅ Admin users (from admin Cognito pool) → Redirected to `/admin`
- ✅ Customer users (from users Cognito pool) → Redirected to `/dashboard`
- ✅ Proper `UserRole.ADMIN` and `UserRole.OWNER` enum values returned

## Post-Deployment Testing

1. **Test admin login:**
   ```
   Email: toushe3219@gmail.com
   Expected: Redirect to /admin portal
   ```

2. **Test customer login:**
   ```
   Email: mohammadh3218@gmail.com
   Expected: Redirect to /dashboard
   ```

3. **Verify API health:**
   ```
   curl https://api.handycall.org/api/v1/health
   ```

## Rollback

If the deployment has issues, rollback to previous version:

```powershell
# List previous versions
aws elasticbeanstalk describe-application-versions `
  --application-name handycall-backend `
  --max-records 5 `
  --region us-east-1

# Deploy previous version
aws elasticbeanstalk update-environment `
  --environment-name YOUR_ENV_NAME `
  --version-label PREVIOUS_VERSION_LABEL `
  --region us-east-1
```
