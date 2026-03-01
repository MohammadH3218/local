param(
  [string]$LogGroup = '/aws/amplify/d3rf5jbk1jklag',
  [int]$StreamCount = 10,
  [int]$EventLimit = 500
)

$streams = aws logs describe-log-streams --region us-east-1 --log-group-name $LogGroup --order-by LastEventTime --descending --max-items $StreamCount --query "logStreams[].logStreamName" --output text

if (-not $streams) {
  Write-Output 'No log streams found.'
  exit 0
}

$records = @()

$streams -split '\s+' | ForEach-Object {
  $s = $_
  try {
    $messages = aws logs get-log-events --region us-east-1 --log-group-name $LogGroup --log-stream-name $s --limit $EventLimit --query "events[].message" --output json 2>$null | ConvertFrom-Json
  } catch {
    return
  }
  foreach ($line in $messages) {
    if ($line -notmatch '\[Demo Google\]') { continue }
    $idx = $line.IndexOf('{')
    if ($idx -lt 0) { continue }
    $json = $line.Substring($idx)
    try {
      $obj = $json | ConvertFrom-Json
      $records += $obj
    } catch {
      continue
    }
  }
}

if (-not $records) {
  Write-Output 'No parsable demo google entries found.'
  exit 0
}

$latestOverall = $records | Sort-Object timestamp | Select-Object -Last 1
$latestSignin = $records | Where-Object { $_.step -eq 'signin' } | Sort-Object timestamp | Select-Object -Last 1
$latestPassword = $records | Where-Object { $_.step -eq 'password' } | Sort-Object timestamp | Select-Object -Last 1
$latestCode = $records | Where-Object { $_.step -eq 'code' } | Sort-Object timestamp | Select-Object -Last 1

Write-Output 'Latest overall:'
$latestOverall | ConvertTo-Json -Compress
Write-Output ''
Write-Output 'Latest signin:'
if ($latestSignin) { $latestSignin | ConvertTo-Json -Compress } else { 'None' }
Write-Output ''
Write-Output 'Latest password:'
if ($latestPassword) { $latestPassword | ConvertTo-Json -Compress } else { 'None' }
Write-Output ''
Write-Output 'Latest code:'
if ($latestCode) { $latestCode | ConvertTo-Json -Compress } else { 'None' }
