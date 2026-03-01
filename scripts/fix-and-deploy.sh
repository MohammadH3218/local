#!/usr/bin/env bash
# =============================================================================
# HandyCall — Fix Customer Auth + Docker Deploy + GitHub Push
# =============================================================================
# What this script does:
#   1. Enables ALLOW_ADMIN_USER_PASSWORD_AUTH on the customer Cognito app client
#      (the missing auth flow that caused "Authentication failed" on customer login)
#   2. Commits the code fixes (cognito.service.ts, auth.service.ts, docker-compose.yml)
#      and pushes to GitHub
#   3. Builds the Docker image, pushes to ECR, and deploys to Elastic Beanstalk
# =============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Configuration ────────────────────────────────────────────────────────────
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="982081079378"
ECR_REPOSITORY="handycall-backend"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_NAME="${ECR_REGISTRY}/${ECR_REPOSITORY}"
EB_APP_NAME="handycall-api"
EB_ENV_NAME="handycall-api-lb"
S3_BUCKET="elasticbeanstalk-${AWS_REGION}-${AWS_ACCOUNT_ID}"
BUILD_PLATFORM="linux/amd64"

CUSTOMER_POOL_ID="us-east-1_v08KHH5np"
CUSTOMER_CLIENT_ID="3u3ktbcsqlb31uosk4cirvl678"

# Resolve repo root regardless of where the script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/packages/backend"

echo ""
echo "========================================================"
echo "  HandyCall Fix-and-Deploy"
echo "========================================================"
echo "  Repo:    ${REPO_ROOT}"
echo "  EB env:  ${EB_ENV_NAME}"
echo "  Region:  ${AWS_REGION}"
echo "========================================================"
echo ""

# ── Preflight checks ─────────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v aws    >/dev/null 2>&1 || error "aws CLI not found. Install it first."
command -v docker >/dev/null 2>&1 || error "docker not found. Install it first."
command -v git    >/dev/null 2>&1 || error "git not found."

aws sts get-caller-identity --region "${AWS_REGION}" >/dev/null 2>&1 \
  || error "AWS credentials not configured or expired. Run 'aws configure' or refresh your session."

docker info >/dev/null 2>&1 \
  || error "Docker daemon is not running. Start Docker Desktop or the Docker service."

success "All prerequisites met."
echo ""

# =============================================================================
# STEP 1 — Fix Cognito: enable ALLOW_ADMIN_USER_PASSWORD_AUTH
# =============================================================================
echo "========================================================"
echo "  STEP 1: Cognito customer pool — enable admin auth flow"
echo "========================================================"

info "Checking current auth flows on customer app client ${CUSTOMER_CLIENT_ID}..."
CURRENT_FLOWS=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "${CUSTOMER_POOL_ID}" \
  --client-id "${CUSTOMER_CLIENT_ID}" \
  --region "${AWS_REGION}" \
  --query 'UserPoolClient.ExplicitAuthFlows' \
  --output json)

info "Current flows: ${CURRENT_FLOWS}"

if echo "${CURRENT_FLOWS}" | grep -q "ALLOW_ADMIN_USER_PASSWORD_AUTH"; then
  success "ALLOW_ADMIN_USER_PASSWORD_AUTH is already enabled — no Cognito change needed."
else
  info "Adding ALLOW_ADMIN_USER_PASSWORD_AUTH to the customer app client..."

  aws cognito-idp update-user-pool-client \
    --user-pool-id  "${CUSTOMER_POOL_ID}" \
    --client-id     "${CUSTOMER_CLIENT_ID}" \
    --region        "${AWS_REGION}" \
    --explicit-auth-flows \
        ALLOW_ADMIN_USER_PASSWORD_AUTH \
        ALLOW_REFRESH_TOKEN_AUTH \
        ALLOW_USER_PASSWORD_AUTH \
        ALLOW_USER_SRP_AUTH \
    >/dev/null

  # Verify
  UPDATED_FLOWS=$(aws cognito-idp describe-user-pool-client \
    --user-pool-id "${CUSTOMER_POOL_ID}" \
    --client-id    "${CUSTOMER_CLIENT_ID}" \
    --region       "${AWS_REGION}" \
    --query 'UserPoolClient.ExplicitAuthFlows' \
    --output json)

  echo "${UPDATED_FLOWS}" | grep -q "ALLOW_ADMIN_USER_PASSWORD_AUTH" \
    || error "Update appeared to succeed but ALLOW_ADMIN_USER_PASSWORD_AUTH is still missing."

  success "Auth flows updated: ${UPDATED_FLOWS}"
fi
echo ""

# =============================================================================
# STEP 2 — Git: commit code fixes and push to GitHub
# =============================================================================
echo "========================================================"
echo "  STEP 2: Commit code fixes and push to GitHub"
echo "========================================================"

cd "${REPO_ROOT}"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Current branch: ${BRANCH}"

# Check for a configured remote
REMOTE=$(git remote | head -1)
if [ -z "${REMOTE}" ]; then
  error "No git remote configured. Add one with: git remote add origin <url>"
fi
REMOTE_URL=$(git remote get-url "${REMOTE}")
info "Remote: ${REMOTE} → ${REMOTE_URL}"

# Stage the specific files changed by the fix
FILES_TO_COMMIT=(
  "packages/backend/src/modules/auth/cognito.service.ts"
  "packages/backend/src/modules/auth/auth.service.ts"
  "packages/backend/docker-compose.yml"
)

STAGED=0
for f in "${FILES_TO_COMMIT[@]}"; do
  if git diff --name-only HEAD -- "${f}" | grep -q . \
  || git diff --name-only -- "${f}" | grep -q .; then
    git add "${f}"
    info "Staged: ${f}"
    STAGED=1
  else
    warn "No changes detected in: ${f} (already committed or unmodified)"
  fi
done

# Also stage Dockerrun.aws.json if it has been regenerated
if git diff --name-only HEAD -- "packages/backend/Dockerrun.aws.json" | grep -q . \
|| git diff --name-only -- "packages/backend/Dockerrun.aws.json" | grep -q .; then
  git add "packages/backend/Dockerrun.aws.json"
  info "Staged: packages/backend/Dockerrun.aws.json"
  STAGED=1
fi

if [ "${STAGED}" -eq 1 ]; then
  git commit -m "$(cat <<'EOF'
fix(auth): enable ADMIN_USER_PASSWORD_AUTH for customer Cognito pool

- cognito.service.ts: handle InvalidParameterException and
  ResourceNotFoundException with descriptive errors instead of the
  generic catch-all; convert all unrecognised AWS SDK errors into
  NestJS UnauthorizedException so they propagate cleanly
- auth.service.ts: broaden re-throw check from two specific subclasses
  to instanceof HttpException so every NestJS HTTP exception passes through
- docker-compose.yml: add missing customer pool env vars that were absent
  from the production reference template

Root cause: customer Cognito app client lacked ALLOW_ADMIN_USER_PASSWORD_AUTH
which caused every customer login attempt to throw InvalidParameterException,
silently swallowed into "Authentication failed. Please try again later."

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
  success "Committed code fixes."
else
  success "Nothing new to commit — all fixes already in git history."
fi

info "Pushing branch '${BRANCH}' to ${REMOTE}..."
git push "${REMOTE}" "${BRANCH}"
success "Pushed to GitHub."
echo ""

# =============================================================================
# STEP 3 — Docker: build image, push to ECR, deploy to Elastic Beanstalk
# =============================================================================
echo "========================================================"
echo "  STEP 3: Build Docker image and deploy to Elastic Beanstalk"
echo "========================================================"

VERSION_TAG="$(date +%Y%m%d-%H%M%S)-amd64"
info "Version tag: ${VERSION_TAG}"

# ── 3a. Build ──────────────────────────────────────────────────────────────
info "Building Docker image (platform: ${BUILD_PLATFORM})..."
cd "${REPO_ROOT}"
docker build \
  --platform "${BUILD_PLATFORM}" \
  -f packages/backend/Dockerfile \
  -t "${ECR_REPOSITORY}:${VERSION_TAG}" \
  .
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${ECR_REPOSITORY}:latest"
success "Docker image built: ${ECR_REPOSITORY}:${VERSION_TAG}"

# ── 3b. Login to ECR ───────────────────────────────────────────────────────
info "Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── 3c. Ensure ECR repository exists ──────────────────────────────────────
aws ecr describe-repositories \
  --repository-names "${ECR_REPOSITORY}" \
  --region "${AWS_REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository \
       --repository-name "${ECR_REPOSITORY}" \
       --region "${AWS_REGION}" >/dev/null

# ── 3d. Tag and push ───────────────────────────────────────────────────────
info "Pushing image to ECR..."
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${IMAGE_NAME}:${VERSION_TAG}"
docker tag "${ECR_REPOSITORY}:${VERSION_TAG}" "${IMAGE_NAME}:latest"
docker push "${IMAGE_NAME}:${VERSION_TAG}"
docker push "${IMAGE_NAME}:latest"
success "Pushed: ${IMAGE_NAME}:${VERSION_TAG}"

# ── 3e. Update Dockerrun.aws.json ─────────────────────────────────────────
info "Updating Dockerrun.aws.json..."
cat > "${BACKEND_DIR}/Dockerrun.aws.json" <<EOF
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
EOF

# Commit the updated Dockerrun.aws.json
cd "${REPO_ROOT}"
git add "packages/backend/Dockerrun.aws.json"
git commit -m "chore(deploy): update backend image to ${VERSION_TAG}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push "${REMOTE}" "${BRANCH}"
success "Dockerrun.aws.json committed and pushed."

# ── 3f. Package and upload to S3 ──────────────────────────────────────────
info "Creating deployment package and uploading to S3..."
cd "${BACKEND_DIR}"
zip -q "backend-${VERSION_TAG}.zip" Dockerrun.aws.json
aws s3 cp "backend-${VERSION_TAG}.zip" "s3://${S3_BUCKET}/backend-${VERSION_TAG}.zip"
rm -f "backend-${VERSION_TAG}.zip"

# ── 3g. Create EB application version ─────────────────────────────────────
info "Creating EB application version ${VERSION_TAG}..."
aws elasticbeanstalk create-application-version \
  --application-name "${EB_APP_NAME}" \
  --version-label    "${VERSION_TAG}" \
  --source-bundle    "S3Bucket=${S3_BUCKET},S3Key=backend-${VERSION_TAG}.zip" \
  --region           "${AWS_REGION}"

# Wait for the version to be visible in EB
info "Waiting for version to register..."
for i in {1..15}; do
  if aws elasticbeanstalk describe-application-versions \
    --application-name "${EB_APP_NAME}" \
    --version-labels   "${VERSION_TAG}" \
    --region           "${AWS_REGION}" \
    --query "ApplicationVersions[0].VersionLabel" \
    --output text 2>/dev/null | grep -q "${VERSION_TAG}"; then
    break
  fi
  sleep 2
done

# ── 3h. Deploy to environment ──────────────────────────────────────────────
info "Deploying version ${VERSION_TAG} to environment ${EB_ENV_NAME}..."
aws elasticbeanstalk update-environment \
  --application-name "${EB_APP_NAME}" \
  --environment-name "${EB_ENV_NAME}" \
  --version-label    "${VERSION_TAG}" \
  --region           "${AWS_REGION}"

success "Deployment initiated: ${VERSION_TAG}"
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "========================================================"
echo -e "  ${GREEN}All steps completed successfully!${NC}"
echo "========================================================"
echo ""
echo "  Cognito fix:  ALLOW_ADMIN_USER_PASSWORD_AUTH enabled"
echo "  GitHub:       pushed to ${REMOTE}/${BRANCH}"
echo "  Docker image: ${IMAGE_NAME}:${VERSION_TAG}"
echo "  EB version:   ${VERSION_TAG} → ${EB_ENV_NAME}"
echo ""
echo "  Monitor deployment:"
echo "  aws elasticbeanstalk describe-environments \\"
echo "    --application-name ${EB_APP_NAME} \\"
echo "    --environment-names ${EB_ENV_NAME} \\"
echo "    --query 'Environments[0].{Status:Status,Health:Health}' \\"
echo "    --output table"
echo ""
echo "  Or in the AWS console:"
echo "  https://console.aws.amazon.com/elasticbeanstalk/home?region=${AWS_REGION}#/environment/dashboard?applicationName=${EB_APP_NAME}&environmentId=${EB_ENV_NAME}"
echo ""
