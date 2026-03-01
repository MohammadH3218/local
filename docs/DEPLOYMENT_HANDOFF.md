# Deployment Handoff

Last updated: 2026-02-26

## GitHub
- Remote: `origin`
- URL: `https://github.com/MohammadH3218/HandyCall.ai.git`
- Default branch currently used locally: `master`

## Backend AWS Docker Deploy
Primary script:
- `packages/backend/deploy.sh`

What it does:
1. Builds Docker image from monorepo root using `packages/backend/Dockerfile`
2. Logs into ECR
3. Pushes versioned + `latest` image tags
4. Creates `Dockerrun.aws.json`
5. Creates zip bundle and uploads to S3
6. Creates EB app version and updates EB environment

Configured in script (verify before production deploy):
- Region: `us-east-1`
- AWS account: `982081079378`
- ECR repo: `handycall-backend`
- EB app: `handycall-api`
- EB environment: `handycall-api-lb`

## Required Local State Before Deploy
- Docker engine running
- AWS CLI installed and authenticated
- IAM permissions for ECR, S3, Elastic Beanstalk

## Minimal Deploy Run
```bash
cd packages/backend
bash ./deploy.sh
```

## Post-Deploy Checks
```bash
aws elasticbeanstalk describe-environments \
  --application-name handycall-api \
  --environment-names handycall-api-lb \
  --region us-east-1
```

```bash
# Replace with deployed URL if needed
curl -sS http://<eb-cname>/api/v1/health
```
