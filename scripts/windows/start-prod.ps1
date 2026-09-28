[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [string]$RuntimeRoot = 'C:\AleBet',
    [int]$StartupTimeoutSeconds = 20
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')

$repoRoot = Get-AleBetRepoRoot
$resolvedConfig = Assert-AleBetExternalConfig -ConfigPath $ConfigPath -RepoRoot $repoRoot
Import-AleBetEnv -Path $resolvedConfig
Assert-AleBetRequiredEnvironment -Names @(
    'NODE_ENV', 'HOST', 'PORT', 'FRONTEND_URL', 'PLATFORM_DATABASE_URL', 'PLATFORM_JWT_SECRET',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_SHEETS_ENABLED'
)
Assert-AleBetNoPlaceholderEnvironment -Names @(
    'FRONTEND_URL', 'PLATFORM_DATABASE_URL', 'PLATFORM_JWT_SECRET', 'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE'
)

if ($env:NODE_ENV -ne 'production') { throw 'NODE_ENV debe ser production.' }
if ($env:HOST -ne '0.0.0.0') { throw 'HOST debe ser 0.0.0.0 para el servidor LAN.' }
$databaseTarget = Get-AleBetDatabaseTarget -DatabaseUrl $env:PLATFORM_DATABASE_URL
Assert-AleBetLoopbackDatabaseHost -HostName $databaseTarget.Host
Assert-AleBetProductionBackupTarget -DatabaseName $databaseTarget.Database
if ($env:PLATFORM_JWT_SECRET.Length -lt 32 -or $env:PLATFORM_JWT_SECRET.StartsWith('REPLACE_')) {
    throw 'PLATFORM_JWT_SECRET debe ser un secreto real de al menos 32 caracteres.'
}
$listenPort = 0
if (-not [int]::TryParse($env:PORT, [ref]$listenPort) -or $listenPort -ne 3000) {
    throw 'PORT debe ser 3000 para PROD-01.'
}
if ($StartupTimeoutSeconds -lt 1) { throw 'StartupTimeoutSeconds debe ser al menos 1.' }
if ($env:GOOGLE_SHEETS_ENABLED -ne 'true') { throw 'GOOGLE_SHEETS_ENABLED debe ser true para la operación ALE-BET.' }
Assert-AleBetRequiredEnvironment -Names @('GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_SHEET_NAME', 'GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE')
if ($env:GOOGLE_SHEETS_SHEET_NAME -ne 'STOCK APP') { throw 'GOOGLE_SHEETS_SHEET_NAME debe ser STOCK APP.' }
$env:GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE = Assert-AleBetExternalFile -Path $env:GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE -RepoRoot $repoRoot -Description 'el archivo de credenciales de Google Sheets'

$entryPath = Join-Path $repoRoot 'apps\platform\server\dist\index.js'
$clientIndexPath = Join-Path $repoRoot 'apps\platform\client\dist\index.html'
if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) { throw "Falta el build del servidor: $entryPath" }
if (-not (Test-Path -LiteralPath $clientIndexPath -PathType Leaf)) { throw "Falta el build del cliente: $clientIndexPath" }

$logDirectory = if ($env:ALEBET_LOG_DIR) { $env:ALEBET_LOG_DIR } else { Join-Path $RuntimeRoot 'logs' }
$pidFile = if ($env:ALEBET_PID_FILE) { $env:ALEBET_PID_FILE } else { Join-Path $RuntimeRoot 'platform.pid' }
$ownerFile = "$pidFile.owner.json"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pidFile) | Out-Null

if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
    [int]$recordedProcessId = 0
    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if (-not [int]::TryParse($pidText, [ref]$recordedProcessId)) {
        throw "El PID file es inválido; revisarlo manualmente: $pidFile"
    }
    $recordedProcess = Get-Process -Id $recordedProcessId -ErrorAction SilentlyContinue
    if ($recordedProcess) {
        if (Test-AleBetOwnedNodeProcess -ProcessId $recordedProcessId -EntryPath $entryPath -OwnerFile $ownerFile) {
            throw "ALE-BET ya está ejecutándose con PID $recordedProcessId."
        }
        throw "El PID file apunta a un proceso ajeno ($recordedProcessId); no se modificó ni terminó."
    }
    Remove-Item -LiteralPath $pidFile
}

Assert-AleBetPortAvailable -Port $listenPort
if (Test-Path -LiteralPath $ownerFile -PathType Leaf) { Remove-Item -LiteralPath $ownerFile -Force }

$nodeCommand = Get-Command node -ErrorAction Stop
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$stdoutPath = Join-Path $logDirectory "platform_$timestamp.out.log"
$stderrPath = Join-Path $logDirectory "platform_$timestamp.err.log"
$startedProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList ('"{0}"' -f $entryPath) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
Set-Content -LiteralPath $pidFile -Value $startedProcess.Id -Encoding ascii
Write-AleBetProcessOwnerProof -Process $startedProcess -ExecutablePath $nodeCommand.Source -EntryPath $entryPath -OwnerFile $ownerFile

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    if ($startedProcess.HasExited) { break }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$listenPort/api/health" -TimeoutSec 2
        $health = $response.Content | ConvertFrom-Json
        if ($response.StatusCode -eq 200 -and $health.status -eq 'ok' -and $health.app -eq 'platform' -and $health.db -eq 'connected') { $healthy = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
}

if (-not $healthy) {
    if (Get-Process -Id $startedProcess.Id -ErrorAction SilentlyContinue) {
        Stop-AleBetOwnedNodeProcess -ProcessId $startedProcess.Id -EntryPath $entryPath -OwnerFile $ownerFile -GracefulTimeoutSeconds 30 -ForcedTimeoutSeconds 10
    }
    if (-not (Get-Process -Id $startedProcess.Id -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $ownerFile -Force -ErrorAction SilentlyContinue
    }
    throw "El servidor no alcanzó health 200. Revisar logs: $stdoutPath y $stderrPath"
}

Write-Host "ALE-BET iniciado. PID $($startedProcess.Id), puerto $listenPort."
Write-Host "Logs: $stdoutPath | $stderrPath"
