# Stop Cloud SQL when registrations are done (saves most of the daily bill).
$ErrorActionPreference = 'Stop'
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'
$Project = 'force-pulse-fa138'
$Instance = 'force-pulse-fa138-instance'

Write-Host "Stopping Cloud SQL ($Instance)..."
gcloud sql instances patch $Instance --project=$Project --activation-policy=NEVER --quiet
gcloud sql instances list --project=$Project --format="table(name,settings.activationPolicy,state)"
Write-Host "Instance STOPPED. Site DB will be down until you run cloud-sql-start.ps1"
