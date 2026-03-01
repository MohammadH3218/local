#!/bin/bash

# =============================================================================
# Add User to Cognito User Pool
# =============================================================================
# Usage: ./add-user.sh [pool_type] [email] [company_id] [company_name]
# Example: ./add-user.sh users joe@handyman.com uuid-123 "Joe's Handyman"
# =============================================================================

set -e

POOL_TYPE=${1:-users}  # admin or users
EMAIL=$2
COMPANY_ID=$3
COMPANY_NAME=$4
ENV=${5:-dev}
REGION=${AWS_REGION:-us-east-1}

if [ -z "$EMAIL" ]; then
  echo "Error: Email is required"
  echo "Usage: ./add-user.sh [pool_type] [email] [company_id] [company_name]"
  echo "Example: ./add-user.sh users joe@handyman.com uuid-123 \"Joe's Handyman\""
  exit 1
fi

# Load config
CONFIG_FILE="cognito-config-${ENV}.txt"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: Config file not found: $CONFIG_FILE"
  echo "Run ./create-cognito-pools.sh first"
  exit 1
fi

source "$CONFIG_FILE"

# Select pool based on type
if [ "$POOL_TYPE" == "admin" ]; then
  POOL_ID=$AWS_COGNITO_ADMIN_POOL_ID
  POOL_NAME="Admin"
else
  POOL_ID=$AWS_COGNITO_USERS_POOL_ID
  POOL_NAME="Users"
fi

echo "=================================================="
echo "Adding User to $POOL_NAME Pool"
echo "=================================================="
echo "Email: $EMAIL"
echo "Pool ID: $POOL_ID"

# Generate temporary password
TEMP_PASSWORD="TempPass$(date +%s)!"

# Build user attributes
USER_ATTRIBUTES="Name=email,Value=$EMAIL Name=email_verified,Value=true"

if [ "$POOL_TYPE" == "users" ] && [ -n "$COMPANY_ID" ]; then
  USER_ATTRIBUTES="$USER_ATTRIBUTES Name=custom:company_id,Value=$COMPANY_ID"
fi

if [ "$POOL_TYPE" == "users" ] && [ -n "$COMPANY_NAME" ]; then
  USER_ATTRIBUTES="$USER_ATTRIBUTES Name=custom:company_name,Value=$COMPANY_NAME"
fi

if [ "$POOL_TYPE" == "users" ]; then
  USER_ATTRIBUTES="$USER_ATTRIBUTES Name=custom:role,Value=OWNER"
fi

# Create user
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --temporary-password "$TEMP_PASSWORD" \
  --user-attributes $USER_ATTRIBUTES \
  --message-action SUPPRESS \
  --region "$REGION"

echo ""
echo "=================================================="
echo "✅ User Created Successfully!"
echo "=================================================="
echo ""
echo "📧 Email: $EMAIL"
echo "🔑 Temporary Password: $TEMP_PASSWORD"
echo ""
echo "⚠️  IMPORTANT: User must change password on first login"
echo "=================================================="
