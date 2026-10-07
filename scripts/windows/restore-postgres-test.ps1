[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [string]$TargetDatabase = 'platform_prod_restore_test',
    [switch]$ConfirmTemporaryTarget,
    [string]$PgRestoreCommand = 'pg_restore'
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')
$repoRoot = Get-AleBetRepoRoot
$resolvedConfig = Assert-AleBetExternalConfig -ConfigPath $ConfigPath -RepoRoot $repoRoot
Import-AleBetEnv -Path $resolvedConfig
Assert-AleBetRequiredEnvironment -Names @('PLATFORM_DATABASE_URL', 'PGPASSFILE')
if (-not $ConfirmTemporaryTarget) { throw 'Debe indicar -ConfirmTemporaryTarget para habilitar el restore de prueba.' }
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "No existe el backup indicado: $BackupFile" }
if ([System.IO.Path]::GetExtension($BackupFile) -ne '.dump') { throw 'El backup debe tener extensión .dump.' }
$env:PGPASSFILE = Assert-AleBetExternalFile -Path $env:PGPASSFILE -RepoRoot $repoRoot -Description 'PGPASSFILE'

$source = Get-AleBetDatabaseTarget -DatabaseUrl $env:PLATFORM_DATABASE_URL
Assert-AleBetLoopbackDatabaseHost -HostName $source.Host
Assert-AleBetProductionBackupTarget -DatabaseName $source.Database
Assert-AleBetTemporaryRestoreTarget -DatabaseName $TargetDatabase
$pgRestore = Get-Command $PgRestoreCommand -ErrorAction Stop

& $pgRestore.Source '--format=custom' '--list' $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El backup no es un archivo custom válido para pg_restore.' }

& $pgRestore.Source '--format=custom' '--exit-on-error' '--clean' '--if-exists' '--no-owner' '--no-privileges' '--no-password' "--host=$($source.Host)" "--port=$($source.Port)" "--username=$($source.Username)" "--dbname=$TargetDatabase" $BackupFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore falló con código $LASTEXITCODE." }
Write-Host "Restore de prueba completo sobre $TargetDatabase. Nunca se apuntó a platform_prod."
