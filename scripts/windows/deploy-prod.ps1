[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [string]$TaskName = 'LOGISTICA - Server'
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')

$script:DeployStage = 'PRECHECK'
$repoRoot = Get-AleBetRepoRoot
$RuntimeRoot = 'C:\AleBet'
$entryPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'apps\platform\server\dist\index.js'))
$pidFile = Join-Path $RuntimeRoot 'platform.pid'
$ownerFile = "$pidFile.owner.json"
$logDirectory = Join-Path $RuntimeRoot 'logs'
$stdoutPath = 'no creado'
$stderrPath = 'no creado'
$currentPid = 'no disponible'
$startedByFallback = $false

function Get-CurrentAleBetLogPaths {
    param([string]$Directory)
    $stdout = Get-ChildItem -LiteralPath $Directory -Filter 'platform_*.out.log' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $stderr = Get-ChildItem -LiteralPath $Directory -Filter 'platform_*.err.log' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    return [pscustomobject]@{
        Stdout = if ($stdout) { $stdout.FullName } else { 'no creado' }
        Stderr = if ($stderr) { $stderr.FullName } else { 'no creado' }
    }
}

function Assert-AleBetRuntimeProcessAndListener {
    param([Parameter(Mandatory = $true)][int]$ExpectedProcessId)

    $process = Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue
    if (-not $process) { throw "PID $ExpectedProcessId ya no está vivo." }
    $identity = Get-AleBetNodeProcessIdentity -ProcessId $ExpectedProcessId -EntryPath $entryPath
    if (-not $identity -or $identity.Name -ine 'node.exe') {
        throw "PID $ExpectedProcessId no se pudo validar como node.exe; no se asumirá propiedad."
    }
    if (-not (Test-AleBetOwnedNodeProcess -ProcessId $ExpectedProcessId -EntryPath $entryPath -OwnerFile $ownerFile)) {
        throw "PID $ExpectedProcessId no valida contra la línea de comandos o la evidencia de lanzamiento exacta."
    }
    $connections = @(Get-AleBetListeningConnections -Port 3000)
    Assert-AleBetSingleListener -Connections $connections -ExpectedProcessId $ExpectedProcessId -ExpectedAddress '0.0.0.0' -Port 3000
    return [bool]$identity.EntryPathMatches
}

function Ensure-AleBetCurrentS4UOwnershipProof {
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) { return }
    [int]$existingPid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$existingPid) -or $existingPid -le 0) {
        throw "PID file inválido: $pidFile"
    }
    $process = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if (-not $process) { return }
    $identity = Get-AleBetNodeProcessIdentity -ProcessId $existingPid -EntryPath $entryPath
    if (-not $identity -or $identity.Name -ine 'node.exe') { throw "PID $existingPid no es un node.exe verificable." }
    if ($identity.CommandLineVisible) {
        if (-not $identity.EntryPathMatches) { throw "La línea de comandos del PID $existingPid no contiene el entryPath exacto." }
        return
    }
    if (Test-AleBetOwnedNodeProcess -ProcessId $existingPid -EntryPath $entryPath -OwnerFile $ownerFile) { return }
    if (-not $identity.CreationTimeUtc) { throw 'S4U oculta CommandLine y no se pudo leer CreationDate del PID.' }

    $task = Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
    Assert-AleBetServerTaskConfiguration -Task $task -StartScriptPath (Join-Path $PSScriptRoot 'start-prod.ps1') -ConfigPath $resolvedConfig
    $taskInfo = Get-ScheduledTaskInfo -InputObject $task -ErrorAction Stop
    if ([string]$task.State -notin @('Ready', 'Running')) { throw "La tarea '$TaskName' no tiene un estado confiable para acreditar el PID registrado." }
    if ([string]$task.State -eq 'Ready' -and [long]$taskInfo.LastTaskResult -ne 0) { throw "La última ejecución de '$TaskName' no terminó con código 0." }

    $taskRunUtc = $taskInfo.LastRunTime.ToUniversalTime()
    $processStartUtc = [DateTime]::Parse([string]$identity.CreationTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    if (($processStartUtc - $taskRunUtc).TotalSeconds -lt -2 -or ($processStartUtc - $taskRunUtc).TotalSeconds -gt 90) {
        throw 'CreationDate del PID no corresponde al último arranque de la tarea productiva.'
    }
    $pidWrittenUtc = (Get-Item -LiteralPath $pidFile).LastWriteTimeUtc
    if ($pidWrittenUtc -lt $taskRunUtc.AddSeconds(-2) -or $pidWrittenUtc -gt $taskRunUtc.AddSeconds(120)) {
        throw 'La fecha del PID file no corresponde al último arranque de la tarea productiva.'
    }

    $connections = @(Get-AleBetListeningConnections -Port 3000)
    Assert-AleBetSingleListener -Connections $connections -ExpectedProcessId $existingPid -ExpectedAddress '0.0.0.0' -Port 3000
    $health = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 3 -RequestTimeoutSeconds 2 -PollIntervalMilliseconds 250
    if ($null -eq $health) { throw 'El proceso existente no superó health status=ok/app=platform/db=connected.' }

    $nodeCommand = Get-Command node -ErrorAction Stop
    $processStart = [DateTime]::Parse([string]$identity.CreationTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    Write-AleBetProcessOwnerProof -Process $process -ExecutablePath $nodeCommand.Source -EntryPath $entryPath -OwnerFile $ownerFile -ProcessStartTime $processStart
}

try {
    $resolvedConfig = Assert-AleBetExternalConfig -ConfigPath $ConfigPath -RepoRoot $repoRoot
    Import-AleBetEnv -Path $resolvedConfig
    if ($env:ALEBET_PID_FILE) {
        $pidFile = if ([System.IO.Path]::IsPathRooted($env:ALEBET_PID_FILE)) { [System.IO.Path]::GetFullPath($env:ALEBET_PID_FILE) } else { [System.IO.Path]::GetFullPath((Join-Path $repoRoot $env:ALEBET_PID_FILE)) }
    }
    $logDirectory = if ($env:ALEBET_LOG_DIR) {
        if ([System.IO.Path]::IsPathRooted($env:ALEBET_LOG_DIR)) { [System.IO.Path]::GetFullPath($env:ALEBET_LOG_DIR) } else { [System.IO.Path]::GetFullPath((Join-Path $repoRoot $env:ALEBET_LOG_DIR)) }
    } else { Join-Path $RuntimeRoot 'logs' }
    Assert-AleBetRequiredEnvironment -Names @(
        'NODE_ENV', 'HOST', 'PORT', 'FRONTEND_URL', 'PLATFORM_DATABASE_URL', 'PLATFORM_JWT_SECRET',
        'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_SHEETS_ENABLED',
        'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_SHEET_NAME', 'GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE'
    )
    Assert-AleBetNoPlaceholderEnvironment -Names @(
        'FRONTEND_URL', 'PLATFORM_DATABASE_URL', 'PLATFORM_JWT_SECRET', 'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_SHEETS_SPREADSHEET_ID',
        'GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE'
    )
    if ($env:NODE_ENV -ne 'production') { throw 'NODE_ENV debe ser production.' }
    if ($env:HOST -ne '0.0.0.0') { throw 'HOST debe ser 0.0.0.0.' }
    if ($env:GOOGLE_SHEETS_ENABLED -ne 'true') { throw 'GOOGLE_SHEETS_ENABLED debe ser true.' }
    if ($env:GOOGLE_SHEETS_SHEET_NAME -ne 'STOCK APP') { throw 'GOOGLE_SHEETS_SHEET_NAME debe ser STOCK APP.' }
    if ($env:PLATFORM_JWT_SECRET.Length -lt 32) { throw 'PLATFORM_JWT_SECRET no supera la longitud mínima productiva.' }
    [int]$configuredPort = 0
    if (-not [int]::TryParse($env:PORT, [ref]$configuredPort) -or $configuredPort -ne 3000) { throw 'PORT debe ser 3000.' }
    $databaseTarget = Get-AleBetDatabaseTarget -DatabaseUrl $env:PLATFORM_DATABASE_URL
    Assert-AleBetLoopbackDatabaseHost -HostName $databaseTarget.Host
    Assert-AleBetProductionBackupTarget -DatabaseName $databaseTarget.Database
    $env:GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE = Assert-AleBetExternalFile -Path $env:GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE -RepoRoot $repoRoot -Description 'el archivo de credenciales de Google Sheets'
    $task = Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
    Assert-AleBetServerTaskConfiguration -Task $task -StartScriptPath (Join-Path $PSScriptRoot 'start-prod.ps1') -ConfigPath $resolvedConfig

    # Las migraciones se aplican antes de compilar o detener el servicio. Si la
    # estructura de datos no puede actualizarse, se corta el despliegue y la
    # instancia actual permanece intacta.
    $script:DeployStage = 'DATABASE MIGRATION'
    Push-Location $repoRoot
    try {
        & npm.cmd --workspace @platform/server run db:migrate
        if ($LASTEXITCODE -ne 0) { throw "La migración de base terminó con código $LASTEXITCODE." }
    } finally { Pop-Location }

    $script:DeployStage = 'BUILD'
    Push-Location $repoRoot
    try {
        & npm.cmd run build:prod
        if ($LASTEXITCODE -ne 0) { throw "npm run build:prod terminó con código $LASTEXITCODE." }
    } finally { Pop-Location }

    $script:DeployStage = 'CAPTURE EXISTING OWNERSHIP'
    Ensure-AleBetCurrentS4UOwnershipProof

    $script:DeployStage = 'STOP SCHEDULED TASK'
    Stop-AleBetScheduledTaskIfRunning -TaskName $TaskName -TimeoutSeconds 30

    $script:DeployStage = 'STOP SERVER'
    & (Join-Path $PSScriptRoot 'stop-prod.ps1') -RuntimeRoot $RuntimeRoot -PidFile $pidFile
    $remainingListeners = @(Get-AleBetListeningConnections -Port 3000)
    if ($remainingListeners.Count -gt 0) {
        $owners = @($remainingListeners | Select-Object -ExpandProperty OwningProcess -Unique)
        throw "Puerto 3000 ocupado por PID(s) $($owners -join ', '); no se iniciará otro proceso."
    }

    $script:DeployStage = 'START SCHEDULED TASK'
    $taskRunStartedAt = [DateTime]::UtcNow
    & schtasks.exe /Run /TN $TaskName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks /Run falló para la tarea '$TaskName'." }

    $script:DeployStage = 'WAIT FOR HEALTH'
    $health = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 30 -RequestTimeoutSeconds 2 -PollIntervalMilliseconds 500
    if ($null -eq $health) {
        $script:DeployStage = 'FALLBACK DIRECT START'
        # A task can fail before it creates a PID/log (for example, an S4U
        # launch problem). The deploy caller already owns this controlled
        # restart, so retry through the same guarded start script only when
        # it left neither a listener nor a live PID behind.
        $fallbackListeners = @(Get-AleBetListeningConnections -Port 3000)
        if ($fallbackListeners.Count -gt 0) {
            $owners = @($fallbackListeners | Select-Object -ExpandProperty OwningProcess -Unique)
            throw "La tarea dejó listener(s) en 3000 (PID(s): $($owners -join ', ')) sin health; no se iniciará un segundo servidor."
        }
        if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
            [int]$fallbackPid = 0
            $fallbackPidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
            if ([int]::TryParse($fallbackPidText, [ref]$fallbackPid) -and (Get-Process -Id $fallbackPid -ErrorAction SilentlyContinue)) {
                throw "La tarea dejó el PID $fallbackPid sin health; no se iniciará un segundo servidor."
            }
        }
        & (Join-Path $PSScriptRoot 'start-prod.ps1') -ConfigPath $resolvedConfig -RuntimeRoot $RuntimeRoot -StartupTimeoutSeconds 30
        $startedByFallback = $true
        $health = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 5 -RequestTimeoutSeconds 2 -PollIntervalMilliseconds 250
        if ($null -eq $health) { throw 'El arranque por tarea y el arranque directo no lograron health 200 con base conectada.' }
    }
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) { throw "Health respondió pero falta el PID file $pidFile." }
    [int]$expectedPid = 0
    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    if (-not [int]::TryParse($pidText, [ref]$expectedPid) -or $expectedPid -le 0) { throw "PID file inválido: $pidFile" }
    if ((Get-Item -LiteralPath $pidFile).LastWriteTimeUtc -lt $taskRunStartedAt) { throw 'El PID file no fue actualizado por el arranque de esta ejecución.' }
    if (-not (Test-Path -LiteralPath $ownerFile -PathType Leaf) -or (Get-Item -LiteralPath $ownerFile).LastWriteTimeUtc -lt $taskRunStartedAt) {
        throw 'Falta una evidencia de lanzamiento reciente del proceso (owner proof).'
    }
    $currentPid = $expectedPid

    $script:DeployStage = 'VALIDATE PROCESS AND PORT'
    $commandLineValidated = Assert-AleBetRuntimeProcessAndListener -ExpectedProcessId $expectedPid

    $script:DeployStage = 'STABILITY'
    Start-Sleep -Seconds 3
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) { throw 'El PID file desapareció durante la ventana de estabilidad.' }
    [int]$stablePid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$stablePid) -or $stablePid -ne $expectedPid) {
        throw "El PID file cambió durante la ventana de estabilidad (esperado $expectedPid, actual $stablePid)."
    }
    $stableCommandLineValidated = Assert-AleBetRuntimeProcessAndListener -ExpectedProcessId $expectedPid
    if ($commandLineValidated -and -not $stableCommandLineValidated) { throw 'La visibilidad de la línea de comandos cambió durante la ventana de estabilidad.' }
    $stableHealth = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 2 -RequestTimeoutSeconds 2 -PollIntervalMilliseconds 250
    if ($null -eq $stableHealth) { throw 'El health dejó de validar después de la ventana de estabilidad.' }

    $script:DeployStage = 'TASK RESULT'
    if (-not $startedByFallback) {
        $taskDeadline = [DateTime]::UtcNow.AddSeconds(15)
        do {
            $task = Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
            if ([string]$task.State -ne 'Running') { break }
            Start-Sleep -Milliseconds 250
        } while ([DateTime]::UtcNow -lt $taskDeadline)
        if ([string]$task.State -eq 'Running') { throw "La tarea '$TaskName' sigue ejecutándose después del arranque." }
        $taskInfo = Get-ScheduledTaskInfo -InputObject $task -ErrorAction Stop
        if ([long]$taskInfo.LastTaskResult -ne 0) { throw "LastTaskResult de '$TaskName' es $($taskInfo.LastTaskResult), se esperaba 0." }
        if ($taskInfo.LastRunTime.ToUniversalTime() -lt $taskRunStartedAt.AddSeconds(-2)) { throw "LastRunTime de '$TaskName' no corresponde a este arranque." }
    }
    if (-not $startedByFallback -and -not $stableCommandLineValidated) {
        # S4U puede ocultar Win32_Process.CommandLine fuera del proceso de tarea.
        # El owner proof lo escribió start-prod.exe al lanzar el PID con el
        # ejecutable y entryPath exactos; PID, ejecutable y hora de inicio se
        # vuelven a comparar con el proceso vivo. El task de esta ejecución,
        # su acción/config exactas y LastTaskResult=0 completan la procedencia.
        $freshTask = Get-ScheduledTask -TaskPath '\' -TaskName $TaskName -ErrorAction Stop
        Assert-AleBetServerTaskConfiguration -Task $freshTask -StartScriptPath (Join-Path $PSScriptRoot 'start-prod.ps1') -ConfigPath $resolvedConfig
    }

    $connections = @(Get-AleBetListeningConnections -Port 3000)
    $script:DeployStage = 'COMPLETE'
    Write-Host 'ALE-BET PROD DEPLOY OK'
    Write-Host 'Build: OK'
    Write-Host "PID: $expectedPid"
    Write-Host 'Port: 3000'
    Write-Host 'Health: 200 / db connected'
    if ($startedByFallback) { Write-Host 'Recovery: la tarea no inició; se recuperó con start-prod.ps1.' }
    Write-Host "Instances: $($connections.Count)"
    $logs = Get-CurrentAleBetLogPaths -Directory $logDirectory
    $stdoutPath = $logs.Stdout
    $stderrPath = $logs.Stderr
} catch {
    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        $candidatePid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($candidatePid -match '^\d+$') { $currentPid = $candidatePid }
    }
    $logs = Get-CurrentAleBetLogPaths -Directory $logDirectory
    $stdoutPath = $logs.Stdout
    $stderrPath = $logs.Stderr
    Write-Host 'ALE-BET PROD DEPLOY FAILED' -ForegroundColor Red
    Write-Host "Stage: $script:DeployStage"
    Write-Host "PID: $currentPid"
    Write-Host "stdout: $stdoutPath"
    Write-Host "stderr: $stderrPath"
    Write-Host "Detail: $($_.Exception.Message)"
    exit 1
}
