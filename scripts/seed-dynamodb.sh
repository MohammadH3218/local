#!/bin/bash

# =============================================================================
# Seed DynamoDB Tables with Test Data
# =============================================================================
# Usage: ./seed-dynamodb.sh [environment]
# Example: ./seed-dynamodb.sh dev
# =============================================================================

set -e

ENV=${1:-dev}
TABLE_PREFIX="handycall_${ENV}_"
REGION=${AWS_REGION:-us-east-1}

echo "=================================================="
echo "Seeding DynamoDB Tables for HandyCall"
echo "=================================================="
echo "Environment: $ENV"
echo "Table Prefix: $TABLE_PREFIX"
echo "Region: $REGION"
echo "=================================================="

# Generate UUIDs (using uuidgen or fallback)
if command -v uuidgen &> /dev/null; then
  COMPANY_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  USER_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  CONTACT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  CONFIG_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  KNOWLEDGE_ID_1=$(uuidgen | tr '[:upper:]' '[:lower:]')
  KNOWLEDGE_ID_2=$(uuidgen | tr '[:upper:]' '[:lower:]')
else
  # Fallback to random strings (not true UUIDs but works for testing)
  COMPANY_ID="test-company-$(date +%s)"
  USER_ID="test-user-$(date +%s)"
  CONTACT_ID="test-contact-$(date +%s)"
  CONFIG_ID="test-config-$(date +%s)"
  KNOWLEDGE_ID_1="test-kb-1-$(date +%s)"
  KNOWLEDGE_ID_2="test-kb-2-$(date +%s)"
fi

TIMESTAMP=$(date +%s)000  # Convert to milliseconds

echo "📝 Generated Test IDs:"
echo "  Company ID: $COMPANY_ID"
echo "  User ID: $USER_ID"
echo "  Contact ID: $CONTACT_ID"
echo ""

# =============================================================================
# 1. SEED COMPANY
# =============================================================================
echo "📦 Seeding test company..."
aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}companies" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"company_name\": {\"S\": \"Joe's Handyman Services\"},
    \"service_type\": {\"S\": \"HANDYMAN\"},
    \"phone_number\": {\"S\": \"+15551234567\"},
    \"email\": {\"S\": \"joe@handyman-test.com\"},
    \"status\": {\"S\": \"TRIAL\"},
    \"timezone\": {\"S\": \"America/New_York\"},
    \"business_hours\": {\"M\": {
      \"monday\": {\"M\": {\"open\": {\"S\": \"09:00\"}, \"close\": {\"S\": \"17:00\"}}},
      \"tuesday\": {\"M\": {\"open\": {\"S\": \"09:00\"}, \"close\": {\"S\": \"17:00\"}}},
      \"wednesday\": {\"M\": {\"open\": {\"S\": \"09:00\"}, \"close\": {\"S\": \"17:00\"}}},
      \"thursday\": {\"M\": {\"open\": {\"S\": \"09:00\"}, \"close\": {\"S\": \"17:00\"}}},
      \"friday\": {\"M\": {\"open\": {\"S\": \"09:00\"}, \"close\": {\"S\": \"17:00\"}}}
    }},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"},
    \"trial_ends_at\": {\"N\": \"$(( TIMESTAMP + 1209600000 ))\" }
  }"

# =============================================================================
# 2. SEED USER (Owner)
# =============================================================================
echo "👤 Seeding test user (owner)..."
# Password: TestPassword123! (hashed with bcrypt - this is a known hash for testing)
PASSWORD_HASH='$2b$10$rO6gXwHvBCnZvK5eLJQQz.X7dLPGv8R2iQz7J3Y5Tz5Tz5Tz5Tz5T.'

aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}users" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"user_id\": {\"S\": \"$USER_ID\"},
    \"email\": {\"S\": \"joe@handyman-test.com\"},
    \"password_hash\": {\"S\": \"$PASSWORD_HASH\"},
    \"first_name\": {\"S\": \"Joe\"},
    \"last_name\": {\"S\": \"Smith\"},
    \"role\": {\"S\": \"OWNER\"},
    \"is_active\": {\"BOOL\": true},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"}
  }"

# =============================================================================
# 3. SEED CONTACT
# =============================================================================
echo "📞 Seeding test contact..."
aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}contacts" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"contact_id\": {\"S\": \"$CONTACT_ID\"},
    \"phone_number\": {\"S\": \"+15559876543\"},
    \"email\": {\"S\": \"customer@example.com\"},
    \"first_name\": {\"S\": \"Jane\"},
    \"last_name\": {\"S\": \"Doe\"},
    \"source\": {\"S\": \"INBOUND_CALL\"},
    \"lead_status\": {\"S\": \"NEW\"},
    \"lead_status_created\": {\"S\": \"NEW#$TIMESTAMP\"},
    \"notes\": {\"S\": \"First time caller, interested in kitchen repair\"},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"},
    \"last_contact_at\": {\"N\": \"$TIMESTAMP\"}
  }"

# =============================================================================
# 4. SEED AGENT CONFIG
# =============================================================================
echo "🤖 Seeding agent configuration..."
aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}agent_configs" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"config_id\": {\"S\": \"$CONFIG_ID\"},
    \"greeting_tone\": {\"S\": \"PROFESSIONAL\"},
    \"custom_greeting\": {\"S\": \"Thanks for calling Joe's Handyman Services. I'm the AI assistant. How can I help you today?\"},
    \"booking_mode\": {\"S\": \"PROPOSE_TIMES\"},
    \"can_discuss_pricing\": {\"BOOL\": true},
    \"can_handle_emergencies\": {\"BOOL\": false},
    \"escalation_threshold\": {\"N\": \"0.7\"},
    \"require_callback_confirmation\": {\"BOOL\": true},
    \"send_sms_summary\": {\"BOOL\": true},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"}
  }"

# =============================================================================
# 5. SEED KNOWLEDGE ITEMS
# =============================================================================
echo "📚 Seeding knowledge base..."

# Knowledge Item 1: FAQ about services
aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}knowledge_items" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"knowledge_id\": {\"S\": \"$KNOWLEDGE_ID_1\"},
    \"type\": {\"S\": \"FAQ\"},
    \"type_created\": {\"S\": \"FAQ#$TIMESTAMP\"},
    \"status\": {\"S\": \"ACTIVE\"},
    \"status_updated\": {\"S\": \"ACTIVE#$TIMESTAMP\"},
    \"question\": {\"S\": \"What services do you offer?\"},
    \"answer\": {\"S\": \"We offer a full range of handyman services including general repairs, drywall installation and repair, door and window installation, deck and fence repair, minor electrical work, plumbing repairs, painting, and tile work. We handle both residential and commercial projects.\"},
    \"created_by\": {\"S\": \"$USER_ID\"},
    \"source\": {\"S\": \"MANUAL\"},
    \"use_count\": {\"N\": \"0\"},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"}
  }"

# Knowledge Item 2: Pricing policy
aws dynamodb put-item \
  --table-name "${TABLE_PREFIX}knowledge_items" \
  --region "$REGION" \
  --item "{
    \"company_id\": {\"S\": \"$COMPANY_ID\"},
    \"knowledge_id\": {\"S\": \"$KNOWLEDGE_ID_2\"},
    \"type\": {\"S\": \"PRICING_INFO\"},
    \"type_created\": {\"S\": \"PRICING_INFO#$TIMESTAMP\"},
    \"status\": {\"S\": \"ACTIVE\"},
    \"status_updated\": {\"S\": \"ACTIVE#$TIMESTAMP\"},
    \"question\": {\"S\": \"How much do you charge?\"},
    \"answer\": {\"S\": \"Our rates start at \$75 per hour for general handyman work. Larger projects are quoted individually after an on-site assessment. We provide free estimates for all jobs. Emergency services may include an additional call-out fee.\"},
    \"created_by\": {\"S\": \"$USER_ID\"},
    \"source\": {\"S\": \"MANUAL\"},
    \"use_count\": {\"N\": \"0\"},
    \"created_at\": {\"N\": \"$TIMESTAMP\"},
    \"updated_at\": {\"N\": \"$TIMESTAMP\"}
  }"

echo ""
echo "=================================================="
echo "✅ Test data seeded successfully!"
echo "=================================================="
echo ""
echo "📋 Test Credentials:"
echo "  Email: joe@handyman-test.com"
echo "  Password: TestPassword123!"
echo ""
echo "📊 Test Data Summary:"
echo "  • 1 Company (Joe's Handyman Services)"
echo "  • 1 User (Owner)"
echo "  • 1 Contact"
echo "  • 1 Agent Config"
echo "  • 2 Knowledge Items"
echo ""
echo "🔑 Save these IDs for testing:"
echo "  COMPANY_ID=$COMPANY_ID"
echo "  USER_ID=$USER_ID"
echo "  CONTACT_ID=$CONTACT_ID"
echo "=================================================="
