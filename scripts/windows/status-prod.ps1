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
if (Test-AleBetOwnedNodeProcess -ProcessId $recordedProcessId -EntryPath $entryPath) {
    Write-Host "ALE-BET activo. PID $recordedProcessId (propiedad verificada)."
    exit 0
}

# Task Scheduler puede iniciar Node mediante S4U y ocultar CommandLine a una
# sesión interactiva sin elevar. Para status (read-only), aceptar ese caso sólo
# si el PID registrado es quien escucha en 3000 y el health identifica Platform
# con PostgreSQL conectado. Los scripts de inicio/detención conservan el guard
# estricto de propiedad y nunca usan este fallback para modificar procesos.
$portOwners = @(Get-AleBetListeningProcessIds -Port 3000)
if ($recordedProcessId -in $portOwners) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 5
        if ($health.status -eq 'ok' -and $health.app -eq 'platform' -and $health.db -eq 'connected') {
            Write-Host "ALE-BET activo. PID $recordedProcessId (verificado por PID, puerto y health; CommandLine no visible)."
            exit 0
        }
    } catch {
        # El error detallado del probe no se expone: el mensaje final mantiene
        # la semántica segura del guard de propiedad.
    }
}

throw "PID $recordedProcessId no pertenece a este servidor o no superó health; no se modificó."
