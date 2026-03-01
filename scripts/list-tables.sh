#!/bin/bash

# =============================================================================
# List DynamoDB Tables for HandyCall Platform
# =============================================================================
# Usage: ./list-tables.sh [environment]
# Example: ./list-tables.sh dev
# =============================================================================

ENV=${1:-dev}
TABLE_PREFIX="handycall_${ENV}_"
REGION=${AWS_REGION:-us-east-1}

echo "=================================================="
echo "Listing HandyCall DynamoDB Tables"
echo "=================================================="
echo "Environment: $ENV"
echo "Prefix: $TABLE_PREFIX"
echo "Region: $REGION"
echo "=================================================="
echo ""

aws dynamodb list-tables \
  --region "$REGION" \
  --output table \
  --query "TableNames[?starts_with(@, '${TABLE_PREFIX}')]"

echo ""
echo "=================================================="
echo "Checking caller identity:"
echo "=================================================="
aws sts get-caller-identity --output table
