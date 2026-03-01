# HandyCall Voice AI Infrastructure

This directory contains CloudFormation templates and deployment scripts for the HandyCall AI voice receptionist infrastructure, based on the [AWS Contact Center GenAI Agent](https://github.com/aws-samples/contact-center-genai-agent) reference implementation.

## Overview

This infrastructure deploys:
- **Amazon Bedrock Knowledge Base** - RAG-based knowledge retrieval
- **Amazon Lex Bot** - Conversational AI bot with voice support
- **AWS Lambda Functions** - Intent handlers and fulfillment logic
- **Amazon Connect Integration** - Contact flow for phone calls (optional)
- **Conversation Analytics** - CloudWatch logs and QuickSight dashboards (optional)

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Python 3.x** with pip (for building Lambda functions)
3. **Git Bash** or **bash** (for running build scripts on Windows)
4. **AWS Account** with permissions to create:
   - CloudFormation stacks
   - S3 buckets
   - Lambda functions
   - Lex bots
   - Bedrock knowledge bases
   - IAM roles and policies
   - (Optional) Connect instances

5. **Bedrock Model Access** - Request access to the following models:
   - Amazon Titan Embed Text v2 (or v1)
   - Anthropic Claude 3 Haiku and Claude 3 Sonnet
   - Cohere Embed English v3 (optional)

## Quick Start

### 1. Deploy Infrastructure

Run the main deployment script:

```powershell
# Windows PowerShell
.\infrastructure\scripts\deploy-handycall-voice-ai.ps1 -Environment dev

# With Connect integration
.\infrastructure\scripts\deploy-handycall-voice-ai.ps1 -Environment dev -ConnectInstanceArn "arn:aws:connect:us-east-1:ACCOUNT:instance/INSTANCE_ID"

# Clean deployment (deletes existing stacks first)
.\infrastructure\scripts\deploy-handycall-voice-ai.ps1 -Environment dev -CleanFirst
```

**Parameters:**
- `-Environment` - Environment name (default: "dev")
- `-Region` - AWS region (default: "us-east-1")
- `-ConnectInstanceArn` - Amazon Connect instance ARN (optional)
- `-SkipBuild` - Skip Lambda function build step
- `-SkipKnowledgeBase` - Skip Knowledge Base stack deployment
- `-CleanFirst` - Delete existing stacks before deploying

### 2. Upload Knowledge Base Content

After deploying the Knowledge Base stack, upload your content:

```powershell
# Upload from reference implementation (for testing)
.\infrastructure\scripts\upload-knowledge-base-content.ps1 -Environment dev

# Upload from custom path
.\infrastructure\scripts\upload-knowledge-base-content.ps1 -Environment dev -ContentPath "C:\path\to\your\content"
```

Then sync the knowledge base in the Bedrock console:
1. Go to **Bedrock Console > Knowledge Bases**
2. Select your knowledge base
3. Click on the data source and select **"Sync"**

### 3. Test the Lex Bot

Test the bot using the test script:

```powershell
# Simple test
.\infrastructure\scripts\test-lex-bot.ps1 -Environment dev -InputText "Hello"

# Continue conversation
.\infrastructure\scripts\test-lex-bot.ps1 -Environment dev -SessionId "test-session-20250101000000" -InputText "What are your services?"
```

Or test directly in the Lex console:
1. Go to **Lex Console**
2. Select your bot: `handycall-receptionist-{env}`
3. Click **"Test"** tab
4. Type or speak messages to test

### 4. Test with Amazon Connect (if configured)

1. Go to **Amazon Connect Console**
2. Navigate to your instance
3. Go to **Contact flows**
4. Find and edit: `handycall-ai-receptionist-{env}`
5. Assign a phone number to the flow
6. Call the number to test

## Manual Deployment Steps

If you prefer to deploy manually or customize the deployment:

### Step 1: Create S3 Buckets

```bash
# Artifacts bucket (for CloudFormation artifacts)
aws s3api create-bucket --bucket handycall-voice-ai-artifacts-ACCOUNT-ENV --region us-east-1

# Knowledge base bucket
aws s3api create-bucket --bucket handycall-knowledge-base-ACCOUNT-ENV --region us-east-1
```

### Step 2: Build Lambda Functions

```bash
cd temp-reference/src
bash publish-all.sh

# Upload artifacts to S3
aws s3 sync dist/ s3://handycall-voice-ai-artifacts-ACCOUNT-ENV/lambda/ --region us-east-1
```

### Step 3: Deploy Knowledge Base Stack

```bash
aws cloudformation create-stack \
  --stack-name handycall-voice-ai-dev-kb \
  --template-body file://infrastructure/cloudformation/bedrock-KB.yaml \
  --parameters \
    ParameterKey=pKnowledgeBaseBucketName,ParameterValue=handycall-knowledge-base-ACCOUNT-ENV \
    ParameterKey=pEmbedModel,ParameterValue=amazon.titan-embed-text-v2:0 \
    ParameterKey=pChunkingStrategy,ParameterValue=Fixed-size chunking \
    ParameterKey=pMaxTokens,ParameterValue=600 \
    ParameterKey=pOverlapPercentage,ParameterValue=10 \
    ParameterKey=pArtifactsBucket,ParameterValue=handycall-voice-ai-artifacts-ACCOUNT-ENV \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Step 4: Deploy RAG Solution Stack

```bash
# Get Knowledge Base ID from previous stack
KB_ID=$(aws cloudformation describe-stacks \
  --stack-name handycall-voice-ai-dev-kb \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseId'].OutputValue" \
  --output text)

aws cloudformation create-stack \
  --stack-name handycall-voice-ai-dev-rag \
  --template-body file://infrastructure/cloudformation/contact-center-RAG-solution.yaml \
  --parameters \
    ParameterKey=pBotName,ParameterValue=handycall-receptionist-dev \
    ParameterKey=pKBID,ParameterValue=$KB_ID \
    ParameterKey=pKBS3Bucket,ParameterValue=handycall-knowledge-base-ACCOUNT-ENV \
    ParameterKey=pArtifactsBucket,ParameterValue=handycall-voice-ai-artifacts-ACCOUNT-ENV \
    ParameterKey=pConnectInstanceARN,ParameterValue=arn:aws:connect:us-east-1:ACCOUNT:instance/INSTANCE_ID \
    ParameterKey=pContactFlowName,ParameterValue=handycall-ai-receptionist-dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

## Stack Outputs

After deployment, retrieve important values from stack outputs:

```bash
# Knowledge Base ID
aws cloudformation describe-stacks \
  --stack-name handycall-voice-ai-dev-kb \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseId'].OutputValue" \
  --output text

# Bot ID and Alias ID
aws cloudformation describe-stacks \
  --stack-name handycall-voice-ai-dev-rag \
  --region us-east-1 \
  --query "Stacks[0].Outputs" \
  --output table
```

## Integration with HandyCall

The deployed infrastructure integrates with HandyCall's existing architecture:

- **Multi-tenancy**: Lambda handlers will be adapted to filter by `company_id`
- **DynamoDB**: Knowledge items are stored in DynamoDB (in addition to Bedrock KB)
- **Call Records**: Call metadata stored in HandyCall's `calls` table
- **RAG Service**: Bedrock Knowledge Bases used for retrieval, DynamoDB for company-scoped knowledge

## Customization

### Adapt for Multi-Tenant Architecture

The reference implementation is single-tenant (hotel chain example). To adapt for HandyCall:

1. **Lambda Handler** - Modify `handler.py` to extract `company_id` from session attributes
2. **Knowledge Base Filtering** - Use metadata filtering in KB queries to filter by `company_id`
3. **DynamoDB Integration** - Store/retrieve company-specific knowledge from DynamoDB

### Modify Intents

Edit the CloudFormation template or Lex console to:
- Add HandyCall-specific intents (e.g., "BookAppointment", "CheckAvailability")
- Modify sample utterances for your use case
- Update slot configurations

### Custom Prompts

Modify the Lambda handler intent modules to customize:
- Agent personality and tone
- Response format
- Guardrail messages

## Troubleshooting

### Lambda Build Fails

**Issue**: Python or pip not found

**Solution**:
- Install Python 3.x from python.org
- Ensure `python` and `pip` are in PATH
- On Windows, may need Git Bash for build scripts

### Stack Deployment Fails

**Issue**: IAM permissions error

**Solution**:
- Ensure your AWS credentials have permissions to create IAM roles
- Use `--capabilities CAPABILITY_NAMED_IAM` flag

### Bot Doesn't Respond

**Issue**: Lambda function not invoked

**Solution**:
- Check CloudWatch logs for Lambda function
- Verify Lex bot fulfillment Lambda is configured correctly
- Check IAM permissions for Lex to invoke Lambda

### Knowledge Base Sync Fails

**Issue**: Documents not indexed

**Solution**:
- Check S3 bucket permissions
- Verify document format (PDF, Word, text supported)
- Check Bedrock service quotas
- Review CloudWatch logs for sync errors

## Clean Up

To delete all deployed resources:

```powershell
# Delete stacks in reverse order
aws cloudformation delete-stack --stack-name handycall-voice-ai-dev-rag --region us-east-1
aws cloudformation delete-stack --stack-name handycall-voice-ai-dev-kb --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name handycall-voice-ai-dev-rag --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name handycall-voice-ai-dev-kb --region us-east-1

# Empty and delete S3 buckets (optional)
aws s3 rm s3://handycall-knowledge-base-ACCOUNT-ENV --recursive
aws s3api delete-bucket --bucket handycall-knowledge-base-ACCOUNT-ENV --region us-east-1

aws s3 rm s3://handycall-voice-ai-artifacts-ACCOUNT-ENV --recursive
aws s3api delete-bucket --bucket handycall-voice-ai-artifacts-ACCOUNT-ENV --region us-east-1
```

## Additional Resources

- [AWS Contact Center GenAI Agent](https://github.com/aws-samples/contact-center-genai-agent)
- [Amazon Lex Developer Guide](https://docs.aws.amazon.com/lex/)
- [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [Amazon Connect Documentation](https://docs.aws.amazon.com/connect/)

## Support

For issues related to:
- **Reference Implementation**: See the [original repository](https://github.com/aws-samples/contact-center-genai-agent)
- **HandyCall Integration**: Check HandyCall documentation or create an issue


