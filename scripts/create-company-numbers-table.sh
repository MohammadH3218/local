#!/bin/bash

# =============================================================================
# Create (or ensure) the company_numbers table for inbound DID → tenant routing
# =============================================================================
# Usage: ./scripts/create-company-numbers-table.sh [environment]
# Example: ./scripts/create-company-numbers-table.sh prod

set -e

ENV=${1:-dev}
TABLE_PREFIX="handycall_${ENV}_"
REGION=${AWS_REGION:-us-east-1}
BILLING_MODE="PAY_PER_REQUEST"

TABLE_NAME="${TABLE_PREFIX}company_numbers"

echo "=================================================="
echo "Creating DynamoDB Table: $TABLE_NAME"
echo "Environment: $ENV"
echo "Region: $REGION"
echo "Billing Mode: $BILLING_MODE"
echo "=================================================="

if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "✓ Table $TABLE_NAME already exists"
  exit 0
fi

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --billing-mode "$BILLING_MODE" \
  --attribute-definitions \
    AttributeName=did_e164,AttributeType=S \
    AttributeName=company_id,AttributeType=S \
  --key-schema \
    AttributeName=did_e164,KeyType=HASH \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"company-index\",
        \"KeySchema\": [{\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"}],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      }
    ]" \
  --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall

aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
echo "✓ Table $TABLE_NAME is ACTIVE"
