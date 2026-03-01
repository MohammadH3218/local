#!/bin/bash

# =============================================================================
# Create Cognito User Pools for HandyCall Platform
# =============================================================================
# Creates two separate User Pools:
# 1. Admin Pool - For platform administrators
# 2. Users Pool - For company owners/staff
# =============================================================================

set -e

ENV=${1:-dev}
REGION=${AWS_REGION:-us-east-1}

echo "=================================================="
echo "Creating Cognito User Pools for HandyCall"
echo "=================================================="
echo "Environment: $ENV"
echo "Region: $REGION"
echo "=================================================="

# =============================================================================
# 1. CREATE ADMIN USER POOL
# =============================================================================
echo ""
echo "📦 Creating Admin User Pool..."

ADMIN_POOL_NAME="handycall-${ENV}-admin-pool"

# Check if pool already exists
EXISTING_ADMIN_POOL=$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" \
  --query "UserPools[?Name=='${ADMIN_POOL_NAME}'].Id" --output text)

if [ -n "$EXISTING_ADMIN_POOL" ]; then
  echo "⚠️  Admin User Pool already exists: $EXISTING_ADMIN_POOL"
  ADMIN_POOL_ID=$EXISTING_ADMIN_POOL
else
  ADMIN_POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "$ADMIN_POOL_NAME" \
    --region "$REGION" \
    --policies '{
      "PasswordPolicy": {
        "MinimumLength": 8,
        "RequireUppercase": true,
        "RequireLowercase": true,
        "RequireNumbers": true,
        "RequireSymbols": false
      }
    }' \
    --auto-verified-attributes email \
    --username-attributes email \
    --mfa-configuration OFF \
    --account-recovery-setting '{
      "RecoveryMechanisms": [
        {
          "Name": "verified_email",
          "Priority": 1
        }
      ]
    }' \
    --admin-create-user-config '{
      "AllowAdminCreateUserOnly": true,
      "InviteMessageTemplate": {
        "EmailSubject": "Your HandyCall Admin Account",
        "EmailMessage": "Your username is {username} and temporary password is {####}. Please login and change your password."
      }
    }' \
    --user-attribute-update-settings '{
      "AttributesRequireVerificationBeforeUpdate": ["email"]
    }' \
    --tags "Environment=$ENV,Project=HandyCall,Type=Admin" \
    --query 'UserPool.Id' \
    --output text)

  echo "✅ Admin User Pool created: $ADMIN_POOL_ID"
fi

# Create Admin App Client
echo "Creating Admin App Client..."
ADMIN_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id "$ADMIN_POOL_ID" \
  --client-name "handycall-${ENV}-admin-client" \
  --region "$REGION" \
  --generate-secret \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --access-token-validity 60 \
  --id-token-validity 60 \
  --refresh-token-validity 30 \
  --token-validity-units '{
    "AccessToken": "minutes",
    "IdToken": "minutes",
    "RefreshToken": "days"
  }' \
  --query 'UserPoolClient.ClientId' \
  --output text)

echo "✅ Admin App Client created: $ADMIN_CLIENT_ID"

# Get client secret
ADMIN_CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$ADMIN_POOL_ID" \
  --client-id "$ADMIN_CLIENT_ID" \
  --region "$REGION" \
  --query 'UserPoolClient.ClientSecret' \
  --output text)

# =============================================================================
# 2. CREATE USERS USER POOL
# =============================================================================
echo ""
echo "📦 Creating Users User Pool..."

USERS_POOL_NAME="handycall-${ENV}-users-pool"

# Check if pool already exists
EXISTING_USERS_POOL=$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" \
  --query "UserPools[?Name=='${USERS_POOL_NAME}'].Id" --output text)

if [ -n "$EXISTING_USERS_POOL" ]; then
  echo "⚠️  Users User Pool already exists: $EXISTING_USERS_POOL"
  USERS_POOL_ID=$EXISTING_USERS_POOL
else
  USERS_POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name "$USERS_POOL_NAME" \
    --region "$REGION" \
    --policies '{
      "PasswordPolicy": {
        "MinimumLength": 8,
        "RequireUppercase": true,
        "RequireLowercase": true,
        "RequireNumbers": true,
        "RequireSymbols": false
      }
    }' \
    --auto-verified-attributes email \
    --username-attributes email \
    --mfa-configuration OFF \
    --account-recovery-setting '{
      "RecoveryMechanisms": [
        {
          "Name": "verified_email",
          "Priority": 1
        }
      ]
    }' \
    --admin-create-user-config '{
      "AllowAdminCreateUserOnly": true,
      "InviteMessageTemplate": {
        "EmailSubject": "Welcome to HandyCall",
        "EmailMessage": "Your username is {username} and temporary password is {####}. Please login at https://app.handycall.com and change your password."
      }
    }' \
    --schema '[
      {
        "Name": "email",
        "AttributeDataType": "String",
        "Required": true,
        "Mutable": true
      },
      {
        "Name": "company_id",
        "AttributeDataType": "String",
        "Mutable": true
      },
      {
        "Name": "company_name",
        "AttributeDataType": "String",
        "Mutable": true
      },
      {
        "Name": "role",
        "AttributeDataType": "String",
        "Mutable": true
      }
    ]' \
    --user-attribute-update-settings '{
      "AttributesRequireVerificationBeforeUpdate": ["email"]
    }' \
    --tags "Environment=$ENV,Project=HandyCall,Type=Users" \
    --query 'UserPool.Id' \
    --output text)

  echo "✅ Users User Pool created: $USERS_POOL_ID"
fi

# Create Users App Client
echo "Creating Users App Client..."
USERS_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id "$USERS_POOL_ID" \
  --client-name "handycall-${ENV}-users-client" \
  --region "$REGION" \
  --generate-secret \
  --explicit-auth-flows ALLOW_ADMIN_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --prevent-user-existence-errors ENABLED \
  --enable-token-revocation \
  --access-token-validity 60 \
  --id-token-validity 60 \
  --refresh-token-validity 30 \
  --token-validity-units '{
    "AccessToken": "minutes",
    "IdToken": "minutes",
    "RefreshToken": "days"
  }' \
  --query 'UserPoolClient.ClientId' \
  --output text)

echo "✅ Users App Client created: $USERS_CLIENT_ID"

# Get client secret
USERS_CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$USERS_POOL_ID" \
  --client-id "$USERS_CLIENT_ID" \
  --region "$REGION" \
  --query 'UserPoolClient.ClientSecret' \
  --output text)

# =============================================================================
# SAVE CONFIGURATION
# =============================================================================
echo ""
echo "=================================================="
echo "✅ Cognito User Pools Created Successfully!"
echo "=================================================="
echo ""
echo "📋 ADMIN POOL:"
echo "  Pool ID: $ADMIN_POOL_ID"
echo "  Client ID: $ADMIN_CLIENT_ID"
echo "  Client Secret: $ADMIN_CLIENT_SECRET"
echo ""
echo "📋 USERS POOL:"
echo "  Pool ID: $USERS_POOL_ID"
echo "  Client ID: $USERS_CLIENT_ID"
echo "  Client Secret: $USERS_CLIENT_SECRET"
echo ""
echo "=================================================="
echo "💾 SAVE THESE TO YOUR .env FILES:"
echo "=================================================="
echo ""
echo "Backend (.env):"
echo "---"
echo "AWS_COGNITO_ADMIN_POOL_ID=$ADMIN_POOL_ID"
echo "AWS_COGNITO_ADMIN_CLIENT_ID=$ADMIN_CLIENT_ID"
echo "AWS_COGNITO_ADMIN_CLIENT_SECRET=$ADMIN_CLIENT_SECRET"
echo ""
echo "AWS_COGNITO_USERS_POOL_ID=$USERS_POOL_ID"
echo "AWS_COGNITO_USERS_CLIENT_ID=$USERS_CLIENT_ID"
echo "AWS_COGNITO_USERS_CLIENT_SECRET=$USERS_CLIENT_SECRET"
echo ""
echo "Frontend (.env.local):"
echo "---"
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$USERS_POOL_ID"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=$USERS_CLIENT_ID"
echo "NEXT_PUBLIC_COGNITO_REGION=$REGION"
echo "=================================================="

# Save to file for easy access
cat > "cognito-config-${ENV}.txt" <<EOF
# HandyCall Cognito Configuration - $ENV
# Generated: $(date)

# Admin Pool
AWS_COGNITO_ADMIN_POOL_ID=$ADMIN_POOL_ID
AWS_COGNITO_ADMIN_CLIENT_ID=$ADMIN_CLIENT_ID
AWS_COGNITO_ADMIN_CLIENT_SECRET=$ADMIN_CLIENT_SECRET

# Users Pool
AWS_COGNITO_USERS_POOL_ID=$USERS_POOL_ID
AWS_COGNITO_USERS_CLIENT_ID=$USERS_CLIENT_ID
AWS_COGNITO_USERS_CLIENT_SECRET=$USERS_CLIENT_SECRET

# Region
AWS_REGION=$REGION
EOF

echo ""
echo "✅ Configuration saved to: cognito-config-${ENV}.txt"
echo "=================================================="
