#!/bin/bash

# =============================================================================
# Delete DynamoDB Tables for HandyCall Platform
# =============================================================================
# ⚠️  WARNING: This will DELETE all tables for the specified environment!
# Usage: ./delete-tables.sh [environment]
# Example: ./delete-tables.sh dev
# =============================================================================

set -e

ENV=${1:-dev}
TABLE_PREFIX="handycall_${ENV}_"
REGION=${AWS_REGION:-us-east-1}

echo "=================================================="
echo "⚠️  WARNING: TABLE DELETION"
echo "=================================================="
echo "Environment: $ENV"
echo "Prefix: $TABLE_PREFIX"
echo "Region: $REGION"
echo "=================================================="
echo ""
echo "This will DELETE the following tables:"
echo ""

# List tables that will be deleted
aws dynamodb list-tables \
  --region "$REGION" \
  --output text \
  --query "TableNames[?starts_with(@, '${TABLE_PREFIX}')]" | tr '\t' '\n'

echo ""
read -p "Are you sure you want to DELETE these tables? Type 'DELETE' to confirm: " CONFIRM

if [ "$CONFIRM" != "DELETE" ]; then
  echo "❌ Deletion cancelled."
  exit 1
fi

echo ""
echo "🗑️  Deleting tables..."

# Get list of tables
TABLES=$(aws dynamodb list-tables \
  --region "$REGION" \
  --output text \
  --query "TableNames[?starts_with(@, '${TABLE_PREFIX}')]")

# Delete each table
for TABLE in $TABLES; do
  echo "Deleting: $TABLE"
  aws dynamodb delete-table \
    --table-name "$TABLE" \
    --region "$REGION" || echo "Failed to delete $TABLE"
done

echo ""
echo "=================================================="
echo "✅ Tables deleted successfully!"
echo "=================================================="
