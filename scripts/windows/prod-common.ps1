Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AleBetRepoRoot {
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Assert-AleBetExternalConfig {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigPath,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    $resolvedConfig = [System.IO.Path]::GetFullPath($ConfigPath)
    $resolvedRepo = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\') + '\'
    if ($resolvedConfig.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "La configuración productiva debe estar fuera del repositorio: $resolvedConfig"
    }
    if (-not (Test-Path -LiteralPath $resolvedConfig -PathType Leaf)) {
        throw "No existe el archivo de configuración productiva: $resolvedConfig"
    }
    return $resolvedConfig
}

function Assert-AleBetExternalFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    $resolvedRepo = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\') + '\'
    if ($resolvedPath.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description debe estar fuera del repositorio."
    }
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        throw "No existe $Description."
    }
    return $resolvedPath
}

function Import-AleBetEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            throw "Línea inválida en el archivo de configuración (no se muestra su contenido)."
        }

        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Assert-AleBetRequiredEnvironment {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    $missing = @()
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ([string]::IsNullOrWhiteSpace($value)) { $missing += $name }
    }
    if ($missing.Count -gt 0) {
        throw "Faltan variables obligatorias: $($missing -join ', ')"
    }
}

function Assert-AleBetNoPlaceholderEnvironment {
    param([Parameter(Mandatory = $true)][string[]]$Names)

    $placeholders = @()
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($value -match 'REPLACE_|NOMBRE_O_IP_LAN_DEL_SERVIDOR') { $placeholders += $name }
    }
    if ($placeholders.Count -gt 0) {
        throw "Persisten placeholders en variables obligatorias: $($placeholders -join ', ')"
    }
}

function Get-AleBetDatabaseTarget {
    param([Parameter(Mandatory = $true)][string]$DatabaseUrl)

    try { $uri = [System.Uri]$DatabaseUrl } catch { throw 'PLATFORM_DATABASE_URL no es una URL válida.' }
    if ($uri.Scheme -notin @('postgresql', 'postgres')) {
        throw 'PLATFORM_DATABASE_URL debe usar postgresql:// o postgres://.'
    }

    $database = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    $userInfo = $uri.UserInfo -split ':', 2
    $username = if ($userInfo.Count -gt 0) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { '' }
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    if (-not $database -or -not $username -or -not $uri.Host) {
        throw 'PLATFORM_DATABASE_URL debe incluir host, usuario y base.'
    }

    return [pscustomobject]@{ Host = $uri.Host; Port = $port; Username = $username; Database = $database }
}

function Assert-AleBetLoopbackDatabaseHost {
    param([Parameter(Mandatory = $true)][string]$HostName)
    if ($HostName -notin @('localhost', '127.0.0.1', '::1', '[::1]')) {
        throw 'Producción local requiere PostgreSQL en localhost; se rechazó un host no loopback.'
    }
}

function Assert-AleBetProductionBackupTarget {
    param([Parameter(Mandatory = $true)][string]$DatabaseName)

    $denied = @('platform', 'platform_test', 'platform_test_automation', 'deposito')
    if ($DatabaseName -in $denied) { throw "Backup rechazado para la base protegida '$DatabaseName'." }
    if ($DatabaseName -ne 'platform_prod') {
        throw "Backup rechazado: la configuración debe apuntar exclusivamente a 'platform_prod'."
    }
}

function Assert-AleBetTemporaryRestoreTarget {
    param([Parameter(Mandatory = $true)][string]$DatabaseName)

    $denied = @('platform_prod', 'platform', 'platform_test', 'platform_test_automation', 'deposito')
    if ($DatabaseName -in $denied) { throw "Restore rechazado para la base protegida '$DatabaseName'." }
    if ($DatabaseName -ne 'platform_prod_restore_test') {
        throw "Restore rechazado: el único destino permitido es 'platform_prod_restore_test'."
    }
}

function Get-AleBetNodeProcessIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$EntryPath
    )

    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $info) { return $null }
    $expected = [System.IO.Path]::GetFullPath($EntryPath)
    $expectedArgument = '(?i)(?:^|\s)"?' + [regex]::Escape($expected) + '"?(?=\s|$)'
    $creationTimeUtc = $null
    $creationDateProperty = $info.PSObject.Properties['CreationDate']
    if ($creationDateProperty -and $creationDateProperty.Value) {
        try { $creationTimeUtc = ([DateTime]$creationDateProperty.Value).ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture) } catch { }
    }
    return [pscustomobject]@{
        Name = [string]$info.Name
        CommandLineVisible = -not [string]::IsNullOrWhiteSpace([string]$info.CommandLine)
        EntryPathMatches = if ([string]::IsNullOrWhiteSpace([string]$info.CommandLine)) { $false } else { [bool]($info.CommandLine -match $expectedArgument) }
        CreationTimeUtc = $creationTimeUtc
    }
}

function Test-AleBetOwnedNodeProcess {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$EntryPath,
        [string]$OwnerFile = ''
    )

    $identity = Get-AleBetNodeProcessIdentity -ProcessId $ProcessId -EntryPath $EntryPath
    if (-not $identity -or $identity.Name -ine 'node.exe') { return $false }
    if ($identity.CommandLineVisible) { return [bool]$identity.EntryPathMatches }
    if (-not $OwnerFile -or -not (Test-Path -LiteralPath $OwnerFile -PathType Leaf)) { return $false }

    try {
        $proof = Get-Content -LiteralPath $OwnerFile -Raw | ConvertFrom-Json
        if ([int]$proof.ProcessId -ne $ProcessId) { return $false }
        if ([System.IO.Path]::GetFullPath([string]$proof.EntryPath) -ine [System.IO.Path]::GetFullPath($EntryPath)) { return $false }
        if (-not $identity.CreationTimeUtc) { return $false }
        if ([System.IO.Path]::GetFileName([string]$proof.ExecutablePath) -ine 'node.exe') { return $false }
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCommand -or [System.IO.Path]::GetFullPath([string]$nodeCommand.Source) -ine [System.IO.Path]::GetFullPath([string]$proof.ExecutablePath)) { return $false }
        $actualStart = [DateTime]::Parse([string]$identity.CreationTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        $proofStart = [DateTime]::Parse([string]$proof.ProcessStartTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        return [Math]::Abs(($actualStart - $proofStart).TotalSeconds) -le 2
    } catch { return $false }
}

function Get-AleBetListeningConnections {
    param([Parameter(Mandatory = $true)][int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    } catch {
        # Get-NetTCPConnection represents an empty query as this stable, non-localized
        # cmdletization error. Do not mistake permission/CIM/other failures for a free port.
        if ($_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound -and
            $_.FullyQualifiedErrorId -eq 'CmdletizationQuery_NotFound,Get-NetTCPConnection') {
            return @()
        }
        throw
    }
}

function Get-AleBetListeningProcessIds {
    param([Parameter(Mandatory = $true)][int]$Port)
    $connections = @(Get-AleBetListeningConnections -Port $Port)
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Assert-AleBetPortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)
    $owners = @(Get-AleBetListeningProcessIds -Port $Port)
    if ($owners.Count -gt 0) {
        throw "El puerto $Port está ocupado por PID(s) $($owners -join ', '). No se terminó ningún proceso."
    }
}

function Wait-AleBetProcessExit {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [int]$TimeoutSeconds = 30,
        [int]$PollIntervalMilliseconds = 250,
        [scriptblock]$ExistsProbe = { param($id) [bool](Get-Process -Id $id -ErrorAction SilentlyContinue) },
        [scriptblock]$SleepAction = { param($milliseconds) Start-Sleep -Milliseconds $milliseconds }
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (& $ExistsProbe $ProcessId)) { return $true }
        & $SleepAction $PollIntervalMilliseconds
    }
    return -not (& $ExistsProbe $ProcessId)
}

function Stop-AleBetOwnedNodeProcess {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$EntryPath,
        [string]$OwnerFile = '',
        [int]$GracefulTimeoutSeconds = 30,
        [int]$ForcedTimeoutSeconds = 10,
        [scriptblock]$ExistsProbe = { param($id) [bool](Get-Process -Id $id -ErrorAction SilentlyContinue) },
        [scriptblock]$SleepAction = { param($milliseconds) Start-Sleep -Milliseconds $milliseconds },
        [scriptblock]$ForceKillAction = {
            param($id)
            $taskkillPath = Join-Path $env:SystemRoot 'System32\taskkill.exe'
            if (-not (Test-Path -LiteralPath $taskkillPath -PathType Leaf)) { throw 'No está disponible taskkill.exe para la detención forzosa controlada.' }
            & $taskkillPath /PID $id /T /F | Out-Null
        }
    )

    if (-not (& $ExistsProbe $ProcessId)) { return }
    if (-not (Test-AleBetOwnedNodeProcess -ProcessId $ProcessId -EntryPath $EntryPath -OwnerFile $OwnerFile)) {
        throw "PID $ProcessId no pertenece al servidor ALE-BET; no se terminó ni modificó."
    }

    Stop-Process -Id $ProcessId -ErrorAction Stop
    if (Wait-AleBetProcessExit -ProcessId $ProcessId -TimeoutSeconds $GracefulTimeoutSeconds -ExistsProbe $ExistsProbe -SleepAction $SleepAction) { return }

    # Revalidar inmediatamente antes del force-kill: un PID reutilizado nunca debe terminarse.
    if (-not (Test-AleBetOwnedNodeProcess -ProcessId $ProcessId -EntryPath $EntryPath -OwnerFile $OwnerFile)) {
        throw "PID $ProcessId sigue vivo pero ya no valida como ALE-BET; no se terminó forzosamente."
    }
    & $ForceKillAction $ProcessId
    if (-not (Wait-AleBetProcessExit -ProcessId $ProcessId -TimeoutSeconds $ForcedTimeoutSeconds -ExistsProbe $ExistsProbe -SleepAction $SleepAction)) {
        throw "El proceso ALE-BET $ProcessId sigue vivo después de la detención forzosa."
    }
}

function Write-AleBetProcessOwnerProof {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$EntryPath,
        [Parameter(Mandatory = $true)][string]$OwnerFile,
        [DateTime]$ProcessStartTime = [DateTime]::MinValue
    )

    if ($Process.ProcessName -ine 'node') { throw 'El proceso recién iniciado no es node.exe.' }
    if ($ProcessStartTime -eq [DateTime]::MinValue) { $ProcessStartTime = $Process.StartTime }
    $proof = [pscustomobject]@{
        ProcessId = [int]$Process.Id
        ExecutablePath = [System.IO.Path]::GetFullPath($ExecutablePath)
        EntryPath = [System.IO.Path]::GetFullPath($EntryPath)
        ProcessStartTimeUtc = $ProcessStartTime.ToUniversalTime().ToString('o', [Globalization.CultureInfo]::InvariantCulture)
    }
    $directory = Split-Path -Parent $OwnerFile
    $temporaryFile = Join-Path $directory ('.platform-owner-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $proof | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporaryFile -Encoding utf8
        Move-Item -LiteralPath $temporaryFile -Destination $OwnerFile -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryFile -PathType Leaf) { Remove-Item -LiteralPath $temporaryFile -Force }
    }
}

function Assert-AleBetSingleListener {
    param(
        [Parameter(Mandatory = $true)][object[]]$Connections,
        [Parameter(Mandatory = $true)][int]$ExpectedProcessId,
        [string]$ExpectedAddress = '0.0.0.0',
        [int]$Port = 3000
    )

    if ($Connections.Count -ne 1) {
        $owners = @($Connections | Select-Object -ExpandProperty OwningProcess -Unique)
        throw "Se esperaba un único listener en $ExpectedAddress`:$Port; encontrados $($Connections.Count), PID(s): $($owners -join ', ')."
    }
    $connection = $Connections[0]
    if ([int]$connection.OwningProcess -ne $ExpectedProcessId -or $connection.LocalAddress -ne $ExpectedAddress) {
        throw "El listener de $ExpectedAddress`:$Port no pertenece exclusivamente al PID esperado $ExpectedProcessId. PID dueño: $($connection.OwningProcess); dirección: $($connection.LocalAddress)."
    }
}

function Wait-AleBetHealth {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$TimeoutSeconds = 90,
        [int]$RequestTimeoutSeconds = 2,
        [int]$PollIntervalMilliseconds = 500,
        [scriptblock]$HealthProbe = {
            param($healthUri, $requestTimeout)
            $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUri -TimeoutSec $requestTimeout
            $body = $response.Content | ConvertFrom-Json
            [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Status = [string]$body.status; App = [string]$body.app; Db = [string]$body.db }
        },
        [scriptblock]$SleepAction = { param($milliseconds) Start-Sleep -Milliseconds $milliseconds }
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $health = & $HealthProbe $Uri $RequestTimeoutSeconds
            if ($health.StatusCode -eq 200 -and $health.Status -eq 'ok' -and $health.App -eq 'platform' -and $health.Db -eq 'connected') { return $health }
        } catch { }
        & $SleepAction $PollIntervalMilliseconds
    }
    return $null
}

function Stop-AleBetScheduledTaskIfRunning {
    param(
        [string]$TaskName = 'LOGISTICA - Server',
        [int]$TimeoutSeconds = 30,
        [int]$PollIntervalMilliseconds = 250,
        [scriptblock]$TaskStateProbe = { param($name) Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction Stop },
        [scriptblock]$EndTaskAction = {
            param($name)
            & schtasks.exe /End /TN $name | Out-Null
            [int]$LASTEXITCODE
        },
        [scriptblock]$SleepAction = { param($milliseconds) Start-Sleep -Milliseconds $milliseconds }
    )

    $task = & $TaskStateProbe $TaskName
    $state = [string]$task.State
    if ($state -eq 'Ready') { return $task }
    if ($state -ne 'Running') { throw "La tarea '$TaskName' tiene estado '$state'; no se detendrá el servidor en un estado de tarea ambiguo." }

    $endResult = & $EndTaskAction $TaskName
    $task = & $TaskStateProbe $TaskName
    if ([int]$endResult -ne 0 -and [string]$task.State -eq 'Running') {
        throw "schtasks /End falló para la tarea '$TaskName'."
    }

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $task = & $TaskStateProbe $TaskName
        if ([string]$task.State -eq 'Ready') { return $task }
        if ([string]$task.State -ne 'Running') {
            throw "La tarea '$TaskName' cambió al estado ambiguo '$($task.State)' durante la detención."
        }
        & $SleepAction $PollIntervalMilliseconds
    }
    throw "La tarea '$TaskName' no terminó dentro de $TimeoutSeconds segundos."
}

function Assert-AleBetServerTaskConfiguration {
    param(
        [Parameter(Mandatory = $true)][object]$Task,
        [Parameter(Mandatory = $true)][string]$StartScriptPath,
        [Parameter(Mandatory = $true)][string]$ConfigPath
    )

    $actions = @($Task.Actions)
    if ($actions.Count -ne 1) { throw 'La tarea productiva debe tener exactamente una acción de inicio.' }
    $arguments = [string]$actions[0].Arguments
    $expectedScript = [System.IO.Path]::GetFullPath($StartScriptPath)
    $expectedConfig = [System.IO.Path]::GetFullPath($ConfigPath)
    $scriptArgumentPattern = '(?i)(?:^|\s)"?' + [regex]::Escape($expectedScript) + '"?(?=\s|$)'
    $configArgumentPattern = '(?i)-ConfigPath\s+"?' + [regex]::Escape($expectedConfig) + '"?(?=\s|$)'
    if ($arguments -notmatch $scriptArgumentPattern -or $arguments -notmatch $configArgumentPattern) {
        throw 'La tarea programada no apunta exactamente al start-prod.ps1 y production.env validados.'
    }
    if ([string]$Task.Settings.MultipleInstances -ne 'IgnoreNew') {
        throw 'La política de instancias de la tarea debe ser IgnoreNew.'
    }
}
