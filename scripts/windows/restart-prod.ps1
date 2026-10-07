[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [string]$TaskName = 'LOGISTICA - Server'
)

# Run this script from an elevated PowerShell for a controlled local restart.
# It builds before stopping the live server and uses deploy-prod's guarded
# fallback when Task Scheduler does not create a healthy replacement.
& (Join-Path $PSScriptRoot 'deploy-prod.ps1') -ConfigPath $ConfigPath -TaskName $TaskName
exit $LASTEXITCODE
