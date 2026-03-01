# Update CloudFront origin to new EB environment

$configFile = "cloudfront-config.json"
$outputFile = "cloudfront-config-updated.json"

# Read the config
$config = Get-Content $configFile | ConvertFrom-Json

# Store the ETag for the update
$etag = $config.ETag

# Update the origin domain name
$config.DistributionConfig.Origins.Items[0].DomainName = "handycall-api-docker.eba-pmfyttgp.us-east-1.elasticbeanstalk.com"

# Save just the DistributionConfig part
$config.DistributionConfig | ConvertTo-Json -Depth 20 | Set-Content $outputFile

Write-Output "✅ Updated origin to: handycall-api-docker.eba-pmfyttgp.us-east-1.elasticbeanstalk.com"
Write-Output "✅ Config saved to: $outputFile"
Write-Output "ETag: $etag"
