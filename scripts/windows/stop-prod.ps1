[CmdletBinding()]
param(
    [string]$RuntimeRoot = 'C:\AleBet',
    [string]$PidFile = ''
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')
$repoRoot = Get-AleBetRepoRoot
$entryPath = Join-Path $repoRoot 'apps\platform\server\dist\index.js'
if (-not $PidFile) { $PidFile = Join-Path $RuntimeRoot 'platform.pid' }
if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) { Write-Host 'ALE-BET ya está detenido.'; exit 0 }

[int]$recordedProcessId = 0
$pidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
if (-not [int]::TryParse($pidText, [ref]$recordedProcessId)) { throw "PID file inválido: $PidFile" }
$recordedProcess = Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue
if (-not $recordedProcess) { Remove-Item -LiteralPath $PidFile; Write-Host 'Se eliminó un PID file stale.'; exit 0 }
if (-not (Test-AleBetOwnedNodeProcess -ProcessId $recordedProcessId -EntryPath $entryPath)) {
    throw "PID $recordedProcessId no pertenece a este servidor; no se terminó ni modificó."
}

Stop-Process -Id $recordedProcessId
Wait-Process -Id $recordedProcessId -Timeout 10 -ErrorAction SilentlyContinue
if (Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue) { throw "El proceso $recordedProcessId no terminó; revisar manualmente." }
Remove-Item -LiteralPath $PidFile
Write-Host "ALE-BET detenido (PID $recordedProcessId)."

