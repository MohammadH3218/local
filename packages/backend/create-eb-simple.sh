#!/bin/bash
# Simple EB environment creation script

APP_NAME="handycall-api"
ENV_NAME="handycall-api-prod"
REGION="us-east-1"

# Load env vars
source .env

echo "Creating Elastic Beanstalk environment..."

# Create environment
aws elasticbeanstalk create-environment \
  --application-name $APP_NAME \
  --environment-name $ENV_NAME \
  --solution-stack-name "64bit Amazon Linux 2023 v6.1.2 running Node.js 20" \
  --option-settings \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=8080" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=API_PREFIX,Value=api/v1" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=JWT_SECRET,Value=$JWT_SECRET" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=JWT_EXPIRES_IN,Value=$JWT_EXPIRES_IN" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=REFRESH_TOKEN_SECRET,Value=$REFRESH_TOKEN_SECRET" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=REFRESH_TOKEN_EXPIRES_IN,Value=$REFRESH_TOKEN_EXPIRES_IN" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value=$AWS_REGION" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_POOL_ID,Value=$AWS_COGNITO_USERS_POOL_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_CLIENT_ID,Value=$AWS_COGNITO_USERS_CLIENT_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_USERS_CLIENT_SECRET,Value=$AWS_COGNITO_USERS_CLIENT_SECRET" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_POOL_ID,Value=$AWS_COGNITO_ADMIN_POOL_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_CLIENT_ID,Value=$AWS_COGNITO_ADMIN_CLIENT_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_COGNITO_ADMIN_CLIENT_SECRET,Value=$AWS_COGNITO_ADMIN_CLIENT_SECRET" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=DYNAMODB_TABLE_PREFIX,Value=handycall_prod_" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=USE_PARAMETER_STORE,Value=true" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_KEY_ID_PARAM,Value=/handycall/apns/key-id" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_TEAM_ID_PARAM,Value=/handycall/apns/team-id" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_BUNDLE_ID_PARAM,Value=/handycall/apns/bundle-id" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_PRIVATE_KEY_PARAM,Value=/handycall/apns/private-key" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APNS_PRIVATE_KEY_BASE64_PARAM,Value=/handycall/apns/private-key-base64" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=S3_BUCKET_RECORDINGS,Value=handycall-recordings-prod" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=S3_BUCKET_TRANSCRIPTS,Value=handycall-transcripts-prod" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=BEDROCK_MODEL_ID,Value=$BEDROCK_MODEL_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=BEDROCK_EMBEDDING_MODEL_ID,Value=$BEDROCK_EMBEDDING_MODEL_ID" \
    "Namespace=aws:elasticbeanstalk:application:environment,OptionName=CORS_ORIGINS,Value=https://master.dwonwh39izoea.amplifyapp.com,https://handycall.org,https://www.handycall.org" \
    "Namespace=aws:elasticbeanstalk:container:nodejs,OptionName=NodeCommand,Value=npm run start:prod" \
    "Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role" \
    "Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=SingleInstance" \
  --region $REGION

echo "Environment creation initiated!"
echo "This will take 5-10 minutes..."
echo ""
echo "Check status:"
echo "  aws elasticbeanstalk describe-environments --application-name $APP_NAME --environment-names $ENV_NAME --region $REGION"
