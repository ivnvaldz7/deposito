[CmdletBinding()]
param(
    [string]$RuntimeRoot = 'C:\AleBet',
    [string]$PidFile = ''
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')
$repoRoot = Get-AleBetRepoRoot
$entryPath = Join-Path $repoRoot 'apps\platform\server\dist\index.js'
if (-not $PidFile) { $PidFile = Join-Path $RuntimeRoot 'platform.pid' }
$ownerFile = "$PidFile.owner.json"
$recordedProcessId = $null

if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    [int]$parsedProcessId = 0
    $pidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if (-not [int]::TryParse($pidText, [ref]$parsedProcessId) -or $parsedProcessId -le 0) {
        throw "PID file inválido: $PidFile"
    }
    $recordedProcessId = $parsedProcessId
    if (Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue) {
        Stop-AleBetOwnedNodeProcess -ProcessId $recordedProcessId -EntryPath $entryPath -OwnerFile $ownerFile -GracefulTimeoutSeconds 30 -ForcedTimeoutSeconds 10
    }

    # El PID file se elimina únicamente cuando se confirmó que su proceso murió.
    if (Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue) {
        throw "El proceso $recordedProcessId continúa vivo; se conservó el PID file $PidFile."
    }
    Remove-Item -LiteralPath $PidFile -Force
    if (Test-Path -LiteralPath $ownerFile -PathType Leaf) { Remove-Item -LiteralPath $ownerFile -Force }
}

$listeners = @(Get-AleBetListeningConnections -Port 3000)
if ($listeners.Count -gt 0) {
    $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    throw "El puerto 3000 continúa ocupado por PID(s) $($owners -join ', '); no se terminó ningún proceso desconocido."
}

if ($null -eq $recordedProcessId) {
    Write-Host 'ALE-BET ya estaba detenido; puerto 3000 libre.'
} else {
    Write-Host "ALE-BET detenido (PID $recordedProcessId); puerto 3000 libre."
}
