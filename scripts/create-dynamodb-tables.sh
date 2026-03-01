#!/bin/bash

# =============================================================================
# DynamoDB Table Creation Script for HandyCall Platform
# =============================================================================
# Usage: ./create-dynamodb-tables.sh [environment]
# Example: ./create-dynamodb-tables.sh dev
#
# Environment values: dev, staging, prod
# Default: dev
# =============================================================================

set -e

# Configuration
ENV=${1:-dev}
TABLE_PREFIX="handycall_${ENV}_"
REGION=${AWS_REGION:-us-east-1}
BILLING_MODE="PAY_PER_REQUEST"  # Use On-Demand for MVP

echo "=================================================="
echo "Creating DynamoDB Tables for HandyCall"
echo "=================================================="
echo "Environment: $ENV"
echo "Table Prefix: $TABLE_PREFIX"
echo "Region: $REGION"
echo "Billing Mode: $BILLING_MODE"
echo "=================================================="

# Function to check if table exists
table_exists() {
  TABLE_NAME=$1
  aws dynamodb describe-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --output text \
    --query 'Table.TableName' 2>/dev/null || echo ""
}

# Function to wait for table to be active
wait_for_table() {
  TABLE_NAME=$1
  echo "⏳ Waiting for table $TABLE_NAME to become ACTIVE..."
  aws dynamodb wait table-exists \
    --table-name "$TABLE_NAME" \
    --region "$REGION"
  echo "✅ Table $TABLE_NAME is ACTIVE"
}

# =============================================================================
# 1. COMPANIES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}companies"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=email,AttributeType=S \
      AttributeName=phone_number,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"email-index\",
          \"KeySchema\": [{\"AttributeName\":\"email\",\"KeyType\":\"HASH\"}],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"phone-index\",
          \"KeySchema\": [{\"AttributeName\":\"phone_number\",\"KeyType\":\"HASH\"}],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 2. USERS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}users"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=user_id,AttributeType=S \
      AttributeName=email,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=user_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"email-index\",
          \"KeySchema\": [{\"AttributeName\":\"email\",\"KeyType\":\"HASH\"}],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 3. CONTACTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}contacts"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=contact_id,AttributeType=S \
      AttributeName=phone_number,AttributeType=S \
      AttributeName=lead_status_created,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=contact_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"phone-lookup\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"phone_number\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"status-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"lead_status_created\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 4. CALLS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}calls"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=call_id,AttributeType=S \
      AttributeName=started_at,AttributeType=N \
      AttributeName=company_contact,AttributeType=S \
      AttributeName=ai_handled_started,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=call_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"date-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"started_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"contact-calls\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_contact\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"started_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"ai-handled-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"ai_handled_started\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 5. CALL HIGHLIGHTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}call_highlights"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_call,AttributeType=S \
      AttributeName=timestamp_seconds,AttributeType=N \
    --key-schema \
      AttributeName=company_call,KeyType=HASH \
      AttributeName=timestamp_seconds,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 6. APPOINTMENTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}appointments"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=appointment_id,AttributeType=S \
      AttributeName=scheduled_start,AttributeType=N \
      AttributeName=company_contact,AttributeType=S \
      AttributeName=status_scheduled,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=appointment_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"date-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"scheduled_start\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"contact-appointments\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_contact\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"scheduled_start\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"status-date\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"status_scheduled\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 7. KNOWLEDGE ITEMS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}knowledge_items"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=knowledge_id,AttributeType=S \
      AttributeName=type_created,AttributeType=S \
      AttributeName=status_updated,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=knowledge_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"type-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"type_created\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"status-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"status_updated\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 8. KNOWLEDGE CHUNKS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}knowledge_chunks"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_knowledge,AttributeType=S \
      AttributeName=chunk_index,AttributeType=N \
      AttributeName=company_id,AttributeType=S \
      AttributeName=chunk_id,AttributeType=S \
    --key-schema \
      AttributeName=company_knowledge,KeyType=HASH \
      AttributeName=chunk_index,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"company-chunks\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"chunk_id\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 9. FLAGGED QUESTIONS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}flagged_questions"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=flagged_id,AttributeType=S \
      AttributeName=status_created,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=flagged_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"status-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"status_created\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 10. AGENT CONFIGS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}agent_configs"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 11. PRICING RULES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}pricing_rules"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=pricing_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=pricing_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 12. SMS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}sms"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=sms_id,AttributeType=S \
      AttributeName=created_at,AttributeType=N \
      AttributeName=company_contact,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=sms_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"date-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"contact-sms\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_contact\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 13. WEBHOOK CONFIGS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}webhook_configs"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 14. SERVICE TEMPLATES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}service_templates"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=template_id,AttributeType=S \
    --key-schema \
      AttributeName=template_id,KeyType=HASH \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 15. NOTIFICATIONS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}notifications"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=notification_id,AttributeType=S \
      AttributeName=company_user,AttributeType=S \
      AttributeName=created_at,AttributeType=N \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=notification_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"recipient-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_user\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 16. NOTIFICATION PREFERENCES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}notification_preferences"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=user_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=user_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 17. NOTIFICATION DEVICES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}notification_devices"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=device_id,AttributeType=S \
      AttributeName=company_user,AttributeType=S \
      AttributeName=updated_at,AttributeType=N \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=device_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"user-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_user\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"updated_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 18. NOTIFICATION USAGE ALERTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}notification_usage_alerts"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=alert_key,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=alert_key,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 19. CONNECTED ACCOUNTS TABLE (Stripe Connect)
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}connected_accounts"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 20. CUSTOMER PAYMENTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}customer_payments"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=payment_id,AttributeType=S \
      AttributeName=created_at,AttributeType=N \
      AttributeName=company_contact,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=payment_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"date-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
          \"IndexName\": \"contact-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_contact\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 21. FOLLOW UP SEQUENCES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}follow_up_sequences"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=sequence_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=sequence_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 22. SCHEDULED MESSAGES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}scheduled_messages"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=message_id,AttributeType=S \
      AttributeName=status,AttributeType=S \
      AttributeName=send_at,AttributeType=N \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=message_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"send-at-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"status\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"send_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 23. CHAT SESSIONS TABLE (Website widget)
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}chat_sessions"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=session_id,AttributeType=S \
      AttributeName=created_at,AttributeType=N \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=session_id,KeyType=RANGE \
    --global-secondary-indexes \
      "[
        {
          \"IndexName\": \"date-index\",
          \"KeySchema\": [
            {\"AttributeName\":\"company_id\",\"KeyType\":\"HASH\"},
            {\"AttributeName\":\"created_at\",\"KeyType\":\"RANGE\"}
          ],
          \"Projection\": {\"ProjectionType\":\"ALL\"}
        }
      ]" \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 24. CUSTOMER PROFILES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}customer_profiles"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=user_id,AttributeType=S \
      AttributeName=profile_id,AttributeType=S \
    --key-schema \
      AttributeName=user_id,KeyType=HASH \
      AttributeName=profile_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 25. INVOICES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}invoices"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=invoice_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=invoice_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 26. OUTBOUND CALLS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}outbound_calls"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=call_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=call_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 27. PORTAL MESSAGES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}portal_messages"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=message_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=message_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 28. QUOTE REQUESTS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}quote_requests"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=quote_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=quote_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 29. REVIEWS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}reviews"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=provider_company_id,AttributeType=S \
      AttributeName=review_id,AttributeType=S \
    --key-schema \
      AttributeName=provider_company_id,KeyType=HASH \
      AttributeName=review_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 30. SMS TEMPLATES TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}sms_templates"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=template_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=template_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

# =============================================================================
# 31. TEAM MEMBERS TABLE
# =============================================================================
TABLE_NAME="${TABLE_PREFIX}team_members"
if [ -n "$(table_exists $TABLE_NAME)" ]; then
  echo "⚠️  Table $TABLE_NAME already exists, skipping..."
else
  echo "📦 Creating table: $TABLE_NAME"
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --region "$REGION" \
    --billing-mode "$BILLING_MODE" \
    --attribute-definitions \
      AttributeName=company_id,AttributeType=S \
      AttributeName=member_id,AttributeType=S \
    --key-schema \
      AttributeName=company_id,KeyType=HASH \
      AttributeName=member_id,KeyType=RANGE \
    --tags Key=Environment,Value="$ENV" Key=Project,Value=HandyCall
  wait_for_table "$TABLE_NAME"
fi

echo ""
echo "=================================================="
echo "✅ All DynamoDB tables created successfully!"
echo "=================================================="
echo "Environment: $ENV"
echo "Region: $REGION"
echo ""
echo "Next steps:"
echo "1. Run './scripts/seed-dynamodb.sh $ENV' to add test data"
echo "2. Update your backend .env file with:"
echo "   DYNAMODB_TABLE_PREFIX=${TABLE_PREFIX}"
echo "   STRIPE_CONNECT_CLIENT_ID=<your_connect_client_id>"
echo "   STRIPE_CONNECT_WEBHOOK_SECRET=<your_connect_webhook_secret>"
echo "=================================================="
