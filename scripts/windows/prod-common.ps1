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

function Test-AleBetOwnedNodeProcess {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$EntryPath
    )

    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $info -or $info.Name -notmatch '^node(?:\.exe)?$' -or -not $info.CommandLine) { return $false }
    $expected = [System.IO.Path]::GetFullPath($EntryPath)
    return $info.CommandLine.IndexOf($expected, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-AleBetListeningProcessIds {
    param([Parameter(Mandatory = $true)][int]$Port)
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}
