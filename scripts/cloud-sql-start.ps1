# Start Cloud SQL when you need the live site / registrations.
$ErrorActionPreference = 'Stop'
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'
$Project = 'force-pulse-fa138'
$Instance = 'force-pulse-fa138-instance'

Write-Host "Starting Cloud SQL ($Instance)..."
gcloud sql instances patch $Instance --project=$Project --activation-policy=ALWAYS --quiet
gcloud sql instances list --project=$Project --format="table(name,settings.activationPolicy,state)"
Write-Host "Wait 1-2 min, then open https://forcepulsev1.vercel.app"
