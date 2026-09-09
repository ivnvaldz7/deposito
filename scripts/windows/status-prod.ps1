[CmdletBinding()]
param(
    [string]$RuntimeRoot = 'C:\AleBet',
    [string]$PidFile = ''
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')
$repoRoot = Get-AleBetRepoRoot
$entryPath = Join-Path $repoRoot 'apps\platform\server\dist\index.js'
if (-not $PidFile) { $PidFile = Join-Path $RuntimeRoot 'platform.pid' }
if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) { Write-Host 'ALE-BET detenido (sin PID file).'; exit 1 }

[int]$recordedProcessId = 0
$pidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
if (-not [int]::TryParse($pidText, [ref]$recordedProcessId)) { throw "PID file inválido: $PidFile" }
if (-not (Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue)) { Write-Host "ALE-BET detenido (PID stale $recordedProcessId)."; exit 1 }
if (-not (Test-AleBetOwnedNodeProcess -ProcessId $recordedProcessId -EntryPath $entryPath)) { throw "PID $recordedProcessId no pertenece a este servidor; no se modificó." }
Write-Host "ALE-BET activo. PID $recordedProcessId."

