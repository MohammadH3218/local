# Docker-based Elastic Beanstalk Deployment

## Overview

This is a **complete rework** of the deployment system using Docker to solve the monorepo dependency issues. The previous approach failed because:

1. ❌ The deployment zip didn't include `node_modules`
2. ❌ EB couldn't install `@handycall/shared` (private workspace package)
3. ❌ Platform hooks failed to resolve dependencies

## New Docker Approach ✅

The Docker solution solves all these issues by:

1. ✅ Building `@handycall/shared` first in an isolated stage
2. ✅ Installing all dependencies in a controlled environment
3. ✅ Bundling everything needed into a single Docker image
4. ✅ Deploying the complete, self-contained image to EB

## Architecture

### Multi-stage Dockerfile

```
Stage 1: shared-builder
  ├─ Build @handycall/shared package
  └─ Output: compiled TypeScript → JavaScript

Stage 2: backend-builder
  ├─ Install all dependencies (including dev)
  ├─ Copy built shared package
  └─ Build backend (TypeScript → JavaScript)

Stage 3: production
  ├─ Copy built shared package
  ├─ Install ONLY production dependencies
  ├─ Copy built backend code
  └─ Run as non-root user
```

## Files Created

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build definition |
| `.dockerignore` | Excludes unnecessary files from build context |
| `Dockerrun.aws.json` | EB Docker configuration (updated by deploy script) |
| `deploy-docker-eb.ps1` | Main deployment script |
| `create-docker-eb-env.ps1` | Create new Docker-based environment |

## Prerequisites

1. **Docker Desktop** - Must be installed and running
2. **AWS CLI** - Configured with credentials
3. **Existing EB Application** - `handycall-api` (created automatically if missing)
4. **Environment file** - `.env` with all required variables

## Deployment Steps

### Option A: Update Existing Environment (if on Node.js platform)

If your existing `handycall-api-prod` environment is on a Node.js platform, you'll need to create a new Docker-based environment:

```powershell
# 1. Navigate to backend directory
cd packages/backend

# 2. Create new Docker environment (takes 5-10 min)
.\create-docker-eb-env.ps1

# 3. Wait for environment to be ready
aws elasticbeanstalk describe-environments `
  --application-name handycall-api `
  --environment-names handycall-api-prod-docker `
  --region us-east-1

# 4. Update ENV_NAME in deploy-docker-eb.ps1
# Change: $ENV_NAME = "handycall-api-prod"
# To:     $ENV_NAME = "handycall-api-prod-docker"

# 5. Deploy
.\deploy-docker-eb.ps1
```

### Option B: Deploy to Existing Docker Environment

If you already have a Docker-based environment:

```powershell
# Navigate to backend directory
cd packages/backend

# Run deployment script
.\deploy-docker-eb.ps1
```

## What the Deployment Script Does

1. **ECR Setup**
   - Creates ECR repository if it doesn't exist
   - Authenticates Docker with ECR

2. **Docker Build**
   - Builds multi-stage Docker image from project root
   - Tags with timestamp and `latest`

3. **Push to ECR**
   - Pushes both tagged and latest images
   - ECR URL: `{account-id}.dkr.ecr.us-east-1.amazonaws.com/handycall-backend`

4. **Create Deployment Bundle**
   - Generates `Dockerrun.aws.json` with ECR image reference
   - Creates minimal zip (just the Dockerrun file)
   - Uploads to S3

5. **Deploy to EB**
   - Creates application version
   - Updates environment with new version
   - Injects environment variables from `.env`

## Environment Variables

The deployment script reads `.env` and automatically configures EB with all variables. Make sure your `.env` includes:

```env
# Required
JWT_SECRET=
JWT_EXPIRES_IN=
REFRESH_TOKEN_SECRET=
REFRESH_TOKEN_EXPIRES_IN=
AWS_REGION=us-east-1
AWS_COGNITO_USERS_POOL_ID=
AWS_COGNITO_USERS_CLIENT_ID=
AWS_COGNITO_USERS_CLIENT_SECRET=
AWS_COGNITO_ADMIN_POOL_ID=
AWS_COGNITO_ADMIN_CLIENT_ID=
AWS_COGNITO_ADMIN_CLIENT_SECRET=
BEDROCK_MODEL_ID=
BEDROCK_EMBEDDING_MODEL_ID=

# Optional (have defaults)
PORT=8080
NODE_ENV=production
API_PREFIX=api/v1
CORS_ORIGINS=https://master.dwonwh39izoea.amplifyapp.com
```

## Monitoring Deployment

```powershell
# Check environment status
aws elasticbeanstalk describe-environments `
  --application-name handycall-api `
  --environment-names handycall-api-prod-docker `
  --region us-east-1

# Get environment URL
aws elasticbeanstalk describe-environments `
  --application-name handycall-api `
  --environment-names handycall-api-prod-docker `
  --query "Environments[0].CNAME" `
  --output text `
  --region us-east-1

# View logs
aws elasticbeanstalk retrieve-environment-info `
  --environment-name handycall-api-prod-docker `
  --info-type tail `
  --region us-east-1
```

## Testing the Deployed API

```powershell
# Get the environment URL
$url = aws elasticbeanstalk describe-environments `
  --application-name handycall-api `
  --environment-names handycall-api-prod-docker `
  --query "Environments[0].CNAME" `
  --output text `
  --region us-east-1

# Test health endpoint
Invoke-RestMethod -Uri "http://$url/api/v1/health"

# Test info endpoint
Invoke-RestMethod -Uri "http://$url/api/v1"

# Test login (dual-pool support)
$body = @{
    email = "mohammadh3218@gmail.com"
    password = "YourPassword123!"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://$url/api/v1/auth/login" -Method POST -Body $body -ContentType "application/json"
```

## Troubleshooting

### Build Fails

```powershell
# Check Docker is running
docker info

# Clean Docker cache and rebuild
docker system prune -a
.\deploy-docker-eb.ps1
```

### Push to ECR Fails

```powershell
# Re-authenticate
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin {account-id}.dkr.ecr.us-east-1.amazonaws.com
```

### Environment Unhealthy

```powershell
# Check logs
aws logs tail /aws/elasticbeanstalk/handycall-api-prod-docker/var/log/eb-docker/containers/eb-current-app/stdouterr.log --follow

# SSH into instance (if configured)
eb ssh handycall-api-prod-docker
docker logs $(docker ps -q)
```

### Module Not Found Errors

This shouldn't happen with Docker, but if it does:
- Verify Dockerfile builds all stages correctly
- Check that `@handycall/shared` is copied in production stage
- Ensure `npm install --omit=dev` includes all runtime deps

## Comparison: Old vs New

| Aspect | Old (Zip-based) | New (Docker) |
|--------|----------------|--------------|
| Dependency handling | ❌ Failed to install @handycall/shared | ✅ Bundled in image |
| Build consistency | ❌ Different on dev vs EB | ✅ Same everywhere |
| Deployment size | ~2 MB (without node_modules) | ~300 MB (complete image) |
| Deploy time | Fast upload, slow install | Slow upload, fast start |
| Debugging | ❌ Hard (platform hooks) | ✅ Easy (test image locally) |
| Rollback | Version-based | Image tag-based |

## Next Steps

1. ✅ Deploy using Docker approach
2. Test all endpoints (auth, companies, users, etc.)
3. Update frontend to use new API URL
4. Set up CI/CD to automate Docker builds
5. Consider migrating to ECS Fargate for better scaling

## Additional Resources

- [EB Docker Documentation](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/single-container-docker.html)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [ECR User Guide](https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html)
