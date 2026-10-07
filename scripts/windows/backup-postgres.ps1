[CmdletBinding()]
param(
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [string]$BackupDirectory = '',
    [int]$RetentionDays = 30,
    [string]$PgDumpCommand = 'pg_dump'
)

. (Join-Path $PSScriptRoot 'prod-common.ps1')
$repoRoot = Get-AleBetRepoRoot
$resolvedConfig = Assert-AleBetExternalConfig -ConfigPath $ConfigPath -RepoRoot $repoRoot
Import-AleBetEnv -Path $resolvedConfig
Assert-AleBetRequiredEnvironment -Names @('PLATFORM_DATABASE_URL', 'PGPASSFILE')
if ($RetentionDays -lt 1) { throw 'RetentionDays debe ser al menos 1.' }
$env:PGPASSFILE = Assert-AleBetExternalFile -Path $env:PGPASSFILE -RepoRoot $repoRoot -Description 'PGPASSFILE'

$target = Get-AleBetDatabaseTarget -DatabaseUrl $env:PLATFORM_DATABASE_URL
Assert-AleBetLoopbackDatabaseHost -HostName $target.Host
Assert-AleBetProductionBackupTarget -DatabaseName $target.Database

if (-not $BackupDirectory) {
    $BackupDirectory = if ($env:ALEBET_BACKUP_DIR) { $env:ALEBET_BACKUP_DIR } else { 'C:\AleBet\backups' }
}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$pgDump = Get-Command $PgDumpCommand -ErrorAction Stop
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$outputPath = Join-Path $BackupDirectory "$($target.Database)_$timestamp.dump"

& $pgDump.Source '-Fc' '--no-password' "--host=$($target.Host)" "--port=$($target.Port)" "--username=$($target.Username)" "--file=$outputPath" $target.Database
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputPath -PathType Leaf) -or (Get-Item -LiteralPath $outputPath).Length -eq 0) {
    throw "pg_dump falló con código $LASTEXITCODE."
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $BackupDirectory -Filter "$($target.Database)_*.dump" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName }
Write-Host "Backup completo: $outputPath"
