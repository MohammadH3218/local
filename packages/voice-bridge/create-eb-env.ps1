# Create Elastic Beanstalk app/env for HandyCall Voice Bridge (Docker) with HTTPS listener.
# Run once, then use deploy-docker-eb.ps1 for updates.

param(
  [string]$EnvName = $env:VOICE_BRIDGE_EB_ENV_NAME,
  [string]$AppName = $env:VOICE_BRIDGE_EB_APP_NAME,
  [string]$Region = $env:VOICE_BRIDGE_AWS_REGION
)

$ErrorActionPreference = "Stop"

$APP_NAME = if ($AppName) { $AppName } else { "handycall-voice-bridge" }
$ENV_NAME = if ($EnvName) { $EnvName } else { "handycall-voice-bridge-lb" }
$REGION = if ($Region) { $Region } else { "us-east-1" }
$PLATFORM_ARN = "arn:aws:elasticbeanstalk:us-east-1::platform/Docker running on 64bit Amazon Linux 2023/4.9.0"
$HOSTED_ZONE_ID = "Z002814819T09BLDX47MG" # handycall.org
$VOICE_SUBDOMAIN = "voice.handycall.org"
$INSTANCE_PROFILE = "aws-elasticbeanstalk-ec2-role"

function Ensure-App {
  $apps = aws elasticbeanstalk describe-applications --query "Applications[].ApplicationName" --output text --region $REGION
  if ($apps -notmatch $APP_NAME) {
    aws elasticbeanstalk create-application --application-name $APP_NAME --region $REGION | Out-Null
  }
}

function Ensure-Certificate {
  $existingArn = aws acm list-certificates --region $REGION --query "CertificateSummaryList[?DomainName=='$VOICE_SUBDOMAIN'].CertificateArn | [0]" --output text
  if ($existingArn -and $existingArn -ne "None") { return $existingArn }

  $arn = aws acm request-certificate --domain-name $VOICE_SUBDOMAIN --validation-method DNS --region $REGION --query CertificateArn --output text
  if (-not $arn) { throw "Failed to request ACM certificate" }

  # Create validation record in Route53
  Start-Sleep -Seconds 2
  $validation = aws acm describe-certificate --certificate-arn $arn --region $REGION --query "Certificate.DomainValidationOptions[0].ResourceRecord" --output json | ConvertFrom-Json
  if (-not $validation) { throw "Missing validation record" }

  $change = @{
    Comment = "ACM validation for $VOICE_SUBDOMAIN"
    Changes = @(
      @{
        Action = "UPSERT"
        ResourceRecordSet = @{
          Name = $validation.Name
          Type = $validation.Type
          TTL  = 300
          ResourceRecords = @(@{ Value = $validation.Value })
        }
      }
    )
  } | ConvertTo-Json -Depth 10

  $tmp = New-TemporaryFile
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($tmp, $change, $utf8NoBom)
  aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch file://$tmp | Out-Null

  Write-Host "Waiting for ACM certificate to be ISSUED..." -ForegroundColor Cyan
  aws acm wait certificate-validated --certificate-arn $arn --region $REGION

  return $arn
}

function Ensure-Environment([string]$certArn) {
  $envStatus = aws elasticbeanstalk describe-environments --application-name $APP_NAME --environment-names $ENV_NAME --include-deleted --region $REGION --query "Environments[0].Status" --output text
  if ($envStatus -and $envStatus -ne "None" -and $envStatus -ne "Terminated") { return }

  $toolsKey = [Guid]::NewGuid().ToString("N")
  $mediaToken = [Guid]::NewGuid().ToString("N")

  aws elasticbeanstalk create-environment `
    --application-name $APP_NAME `
    --environment-name $ENV_NAME `
    --platform-arn $PLATFORM_ARN `
    --option-settings `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=8080" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=PUBLIC_BASE_URL,Value=https://$VOICE_SUBDOMAIN" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOOLS_API_BASE_URL,Value=https://api.handycall.org/api/v1" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOOLS_API_KEY,Value=$toolsKey" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWILIO_VALIDATE_SIGNATURE,Value=true" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWILIO_MEDIA_STREAM_TOKEN,Value=$mediaToken" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=OPENAI_REALTIME_MODEL,Value=gpt-realtime-mini" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=OPENAI_REALTIME_VOICE,Value=alloy" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=OPENAI_API_KEY,Value=CHANGEME" `
      "Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWILIO_AUTH_TOKEN,Value=CHANGEME" `
      "Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=$INSTANCE_PROFILE" `
      "Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=LoadBalanced" `
      "Namespace=aws:elasticbeanstalk:environment,OptionName=LoadBalancerType,Value=application" `
      "Namespace=aws:elbv2:listener:443,OptionName=ListenerEnabled,Value=true" `
      "Namespace=aws:elbv2:listener:443,OptionName=Protocol,Value=HTTPS" `
      "Namespace=aws:elbv2:listener:443,OptionName=SSLCertificateArns,Value=$certArn" `
      "Namespace=aws:elbv2:listener:443,OptionName=SSLPolicy,Value=ELBSecurityPolicy-TLS13-1-2-2021-06" `
    --region $REGION | Out-Null

  Write-Host "Environment creation started. Generated TOOLS_API_KEY=$toolsKey and TWILIO_MEDIA_STREAM_TOKEN=$mediaToken" -ForegroundColor Yellow
  Write-Host "You must set backend env var HANDYCALL_TOOLS_API_KEY=$toolsKey as well." -ForegroundColor Yellow
}

Ensure-App
$certArn = Ensure-Certificate
Write-Host "ACM cert ARN: $certArn" -ForegroundColor Green
Ensure-Environment $certArn

Write-Host "Next: run packages/voice-bridge/deploy-docker-eb.ps1 to deploy the container." -ForegroundColor Cyan
