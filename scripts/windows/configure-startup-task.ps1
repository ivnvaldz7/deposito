[CmdletBinding()]
param(
    [string]$TaskName = 'LOGISTICA - Server',
    [string]$TaskPath = '\',
    [string]$ConfigPath = 'C:\AleBet\config\production.env',
    [int]$StartupDelaySeconds = 120,
    [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

if ($StartupDelaySeconds -lt 1) { throw 'StartupDelaySeconds debe ser al menos 1.' }
if ($StartupTimeoutSeconds -lt 30) { throw 'StartupTimeoutSeconds debe ser al menos 30.' }

$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
$actions = @($task.Actions)
if ($actions.Count -ne 1) { throw "La tarea '$TaskName' debe tener exactamente una acción." }

$startScriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'start-prod.ps1'))
$resolvedConfigPath = [System.IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path -LiteralPath $startScriptPath -PathType Leaf)) { throw "No existe $startScriptPath" }
if (-not (Test-Path -LiteralPath $resolvedConfigPath -PathType Leaf)) { throw "No existe $resolvedConfigPath" }

# Keep the existing PowerShell executable and principal (S4U), but make the
# exact bootstrap command explicit and deterministic.
$action = New-ScheduledTaskAction -Execute $actions[0].Execute -Argument (
    "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$startScriptPath`" -ConfigPath `"$resolvedConfigPath`" -StartupTimeoutSeconds $StartupTimeoutSeconds"
)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = [System.Xml.XmlConvert]::ToString([TimeSpan]::FromSeconds($StartupDelaySeconds))

$settings = $task.Settings
$settings.StartWhenAvailable = $true
$settings.MultipleInstances = 'IgnoreNew'
$settings.RestartCount = 6
$settings.RestartInterval = 'PT1M'
$settings.ExecutionTimeLimit = 'PT20M'

# Omit the S4U principal here: Set-ScheduledTask preserves the registered
# principal when it is not supplied, while Windows rejects re-submitting its
# UserId for an S4U task.
Set-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Action $action -Trigger @($trigger) -Settings $settings | Out-Null

$updated = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
$updatedAction = @($updated.Actions)[0]
$updatedTrigger = @($updated.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' })[0]
if (-not $updatedTrigger -or $updatedTrigger.Delay -ne $trigger.Delay) { throw 'La demora de arranque no se guardó en la tarea.' }
if ([string]$updatedAction.Arguments -notmatch [regex]::Escape("-StartupTimeoutSeconds $StartupTimeoutSeconds")) { throw 'El timeout de inicio no se guardó en la tarea.' }

Write-Host "Tarea '$TaskName' configurada: inicio $($updatedTrigger.Delay) después del arranque; health timeout $StartupTimeoutSeconds segundos."
