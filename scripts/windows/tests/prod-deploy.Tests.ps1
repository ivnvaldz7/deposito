$commonPath = Join-Path $PSScriptRoot '..\prod-common.ps1'
. $commonPath

Describe 'ALE-BET production process guards' {
    BeforeEach {
        $script:entryPath = 'C:\AleBet\apps\platform\server\dist\index.js'
    }

    It 'accepts only node.exe with the exact entryPath argument' {
        Mock Get-CimInstance { [pscustomobject]@{ Name = 'node.exe'; CommandLine = '"C:\Program Files\nodejs\node.exe" C:\AleBet\apps\platform\server\dist\index.js' } }
        Test-AleBetOwnedNodeProcess -ProcessId 100 -EntryPath $script:entryPath | Should Be $true

        Mock Get-CimInstance { [pscustomobject]@{ Name = 'node.exe'; CommandLine = 'node.exe C:\AleBet\apps\platform\server\dist\index.js.backup' } }
        Test-AleBetOwnedNodeProcess -ProcessId 100 -EntryPath $script:entryPath | Should Be $false
    }

    It 'uses the launch proof only when S4U hides CommandLine and process identity still matches' {
        $ownerFile = [System.IO.Path]::GetTempFileName()
        $script:proofStart = [DateTime]::UtcNow.AddSeconds(-1)
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $proof = [pscustomobject]@{
            ProcessId = 101
            ExecutablePath = $nodePath
            EntryPath = $script:entryPath
            ProcessStartTimeUtc = $script:proofStart.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
        }
        $proof | ConvertTo-Json | Set-Content -LiteralPath $ownerFile -Encoding utf8
        $script:identityCreation = $script:proofStart
        Mock Get-CimInstance { [pscustomobject]@{ Name = 'node.exe'; CommandLine = $null; CreationDate = $script:identityCreation } }
        try {
            Test-AleBetOwnedNodeProcess -ProcessId 101 -EntryPath $script:entryPath -OwnerFile $ownerFile | Should Be $true
            Test-AleBetOwnedNodeProcess -ProcessId 102 -EntryPath $script:entryPath -OwnerFile $ownerFile | Should Be $false
            $script:identityCreation = $script:proofStart.AddMinutes(1)
            Test-AleBetOwnedNodeProcess -ProcessId 101 -EntryPath $script:entryPath -OwnerFile $ownerFile | Should Be $false
        } finally { Remove-Item -LiteralPath $ownerFile -Force }
    }

    It 'treats a stale PID as stopped without attempting to stop any process' {
        Mock Stop-Process { throw 'Stop-Process must not be called for a stale PID.' }
        $exists = { param($id) $false }
        { Stop-AleBetOwnedNodeProcess -ProcessId 123 -EntryPath $script:entryPath -ExistsProbe $exists } | Should Not Throw
        Assert-MockCalled Stop-Process -Times 0
    }

    It 'continues polling through a graceful shutdown longer than ten checks' {
        $script:existenceChecks = 0
        Mock Test-AleBetOwnedNodeProcess { $true }
        Mock Stop-Process { }
        $exists = { param($id) $script:existenceChecks++; return $script:existenceChecks -le 11 }
        $noSleep = { param($milliseconds) }

        Stop-AleBetOwnedNodeProcess -ProcessId 124 -EntryPath $script:entryPath -GracefulTimeoutSeconds 30 -ExistsProbe $exists -SleepAction $noSleep -ForceKillAction { param($id) throw 'Force-kill should not be needed.' }

        $script:existenceChecks | Should BeGreaterThan 10
        Assert-MockCalled Test-AleBetOwnedNodeProcess -Times 1
    }

    It 'revalidates ownership before forced tree termination after grace timeout' {
        $script:waitCalls = 0
        $script:ownershipChecks = 0
        $script:forceCalls = 0
        Mock Test-AleBetOwnedNodeProcess { $script:ownershipChecks++; return $true }
        Mock Stop-Process { }
        Mock Wait-AleBetProcessExit { $script:waitCalls++; return $script:waitCalls -gt 1 }
        $exists = { param($id) $true }
        $force = { param($id) $script:forceCalls++ }

        Stop-AleBetOwnedNodeProcess -ProcessId 125 -EntryPath $script:entryPath -ExistsProbe $exists -ForceKillAction $force

        $script:forceCalls | Should Be 1
        $script:ownershipChecks | Should Be 2
        $script:waitCalls | Should Be 2
    }

    It 'never signals a process whose ownership check fails' {
        Mock Test-AleBetOwnedNodeProcess { $false }
        $script:stopCalls = 0
        Mock Stop-Process { $script:stopCalls++ }
        $exists = { param($id) $true }

        $threw = $false
        try { Stop-AleBetOwnedNodeProcess -ProcessId 126 -EntryPath $script:entryPath -ExistsProbe $exists } catch { $threw = $true }
        $threw | Should Be $true
        $script:stopCalls | Should Be 0
    }

    It 'does not force-kill if ownership changes while waiting for graceful exit' {
        $script:ownershipChecks = 0
        $script:waitCalls = 0
        $script:forceCalls = 0
        Mock Test-AleBetOwnedNodeProcess { $script:ownershipChecks++; return $script:ownershipChecks -eq 1 }
        Mock Stop-Process { }
        Mock Wait-AleBetProcessExit { $script:waitCalls++; return $false }
        $exists = { param($id) $true }
        $force = { param($id) $script:forceCalls++ }
        $threw = $false
        try { Stop-AleBetOwnedNodeProcess -ProcessId 127 -EntryPath $script:entryPath -ExistsProbe $exists -ForceKillAction $force } catch { $threw = $true }
        $threw | Should Be $true
        $script:forceCalls | Should Be 0
        $script:ownershipChecks | Should Be 2
    }
}

Describe 'ALE-BET deploy readiness checks' {
    It 'treats the no-listener cmdletization result as an empty port and lets start reach launch' {
        Mock Get-NetTCPConnection {
            $exception = [System.Management.Automation.ItemNotFoundException]::new('mensaje localizado irrelevante')
            $record = [System.Management.Automation.ErrorRecord]::new(
                $exception,
                'CmdletizationQuery_NotFound,Get-NetTCPConnection',
                [System.Management.Automation.ErrorCategory]::ObjectNotFound,
                'query'
            )
            throw $record
        }

        @(Get-AleBetListeningProcessIds -Port 3000).Count | Should Be 0
        { Assert-AleBetPortAvailable -Port 3000 } | Should Not Throw
        $source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\start-prod.ps1') -Raw
        $guardIndex = $source.IndexOf('Assert-AleBetPortAvailable -Port $listenPort', [StringComparison]::Ordinal)
        $launchIndex = $source.IndexOf('$startedProcess = Start-Process', [StringComparison]::Ordinal)
        ($guardIndex -ge 0 -and $launchIndex -gt $guardIndex) | Should Be $true
        Assert-MockCalled Get-NetTCPConnection -Times 1
    }

    It 'returns listener PIDs when the port query has results' {
        Mock Get-NetTCPConnection { [pscustomobject]@{ OwningProcess = 8123; LocalAddress = '0.0.0.0' } }
        @(Get-AleBetListeningProcessIds -Port 3000) | Should Be @(8123)
    }

    It 'does not hide errors other than the known empty-query result' {
        Mock Get-NetTCPConnection {
            $exception = [System.InvalidOperationException]::new('not inspected')
            throw [System.Management.Automation.ErrorRecord]::new(
                $exception,
                'SomeOtherFailure,Get-NetTCPConnection',
                [System.Management.Automation.ErrorCategory]::InvalidOperation,
                $null
            )
        }
        $threw = $false
        try { Get-AleBetListeningConnections -Port 3000 | Out-Null } catch { $threw = $true }
        $threw | Should Be $true
    }

    It 'accepts exactly one listener on 0.0.0.0 owned by the expected PID' {
        $connections = @([pscustomobject]@{ LocalAddress = '0.0.0.0'; LocalPort = 3000; OwningProcess = 500 })
        { Assert-AleBetSingleListener -Connections $connections -ExpectedProcessId 500 } | Should Not Throw
        $wrongOwner = @([pscustomobject]@{ LocalAddress = '0.0.0.0'; LocalPort = 3000; OwningProcess = 501 })
        $threwForMultiple = $false
        try { Assert-AleBetSingleListener -Connections ($connections + $connections) -ExpectedProcessId 500 } catch { $threwForMultiple = $true }
        $threwForMultiple | Should Be $true
        $threwForOwner = $false
        try { Assert-AleBetSingleListener -Connections $wrongOwner -ExpectedProcessId 500 } catch { $threwForOwner = $true }
        $threwForOwner | Should Be $true
    }

    It 'waits through delayed health and accepts only HTTP 200 plus db connected' {
        $script:healthAttempts = 0
        $probe = {
            param($uri, $timeout)
            $script:healthAttempts++
            if ($script:healthAttempts -lt 4) { return [pscustomobject]@{ StatusCode = 503; Status = 'starting'; App = 'platform'; Db = 'disconnected' } }
            return [pscustomobject]@{ StatusCode = 200; Status = 'ok'; App = 'platform'; Db = 'connected' }
        }
        $result = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 5 -HealthProbe $probe -SleepAction { param($milliseconds) }
        $result.StatusCode | Should Be 200
        $script:healthAttempts | Should Be 4
    }

    It 'fails closed when health never becomes ready' {
        $probe = { param($uri, $timeout) [pscustomobject]@{ StatusCode = 500; Status = 'error'; App = 'platform'; Db = 'disconnected' } }
        $result = Wait-AleBetHealth -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSeconds 0 -HealthProbe $probe -SleepAction { param($milliseconds) }
        $result | Should Be $null
    }

    It 'builds before either scheduled-task stop or server stop' {
        $deployPath = Join-Path $PSScriptRoot '..\deploy-prod.ps1'
        $text = Get-Content -LiteralPath $deployPath -Raw
        $buildIndex = $text.IndexOf('& npm.cmd run build:prod', [StringComparison]::Ordinal)
        $buildFailureIndex = $text.IndexOf('if ($LASTEXITCODE -ne 0) { throw "npm run build:prod', [StringComparison]::Ordinal)
        $taskStopIndex = $text.IndexOf('Stop-AleBetScheduledTaskIfRunning', [StringComparison]::Ordinal)
        $serverStopIndex = $text.IndexOf("'stop-prod.ps1'", [StringComparison]::Ordinal)
        $commonText = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\prod-common.ps1') -Raw
        $endTaskActionExists = $commonText.Contains('schtasks.exe /End')
        ($buildIndex -ge 0 -and $buildFailureIndex -gt $buildIndex -and $taskStopIndex -gt $buildFailureIndex -and $serverStopIndex -gt $taskStopIndex -and $endTaskActionExists) | Should Be $true
    }

    It 'accepts an already stopped scheduled task without issuing End' {
        $script:taskEndCalls = 0
        $stateProbe = { param($name) [pscustomobject]@{ State = 'Ready' } }
        $endAction = { param($name) $script:taskEndCalls++; return 0 }

        Stop-AleBetScheduledTaskIfRunning -TaskName 'LOGISTICA - Server' -TaskStateProbe $stateProbe -EndTaskAction $endAction

        $script:taskEndCalls | Should Be 0
    }

    It 'ends a running scheduled task and waits for Ready' {
        $script:taskState = 'Running'
        $script:taskEndCalls = 0
        $stateProbe = { param($name) [pscustomobject]@{ State = $script:taskState } }
        $endAction = { param($name) $script:taskEndCalls++; $script:taskState = 'Ready'; return 0 }

        Stop-AleBetScheduledTaskIfRunning -TaskName 'LOGISTICA - Server' -TaskStateProbe $stateProbe -EndTaskAction $endAction -SleepAction { param($milliseconds) }

        $script:taskEndCalls | Should Be 1
        $script:taskState | Should Be 'Ready'
    }

    It 'fails closed when a scheduled task remains Running' {
        $stateProbe = { param($name) [pscustomobject]@{ State = 'Running' } }
        $endAction = { param($name) return 0 }
        $threw = $false
        try { Stop-AleBetScheduledTaskIfRunning -TaskName 'LOGISTICA - Server' -TimeoutSeconds 0 -TaskStateProbe $stateProbe -EndTaskAction $endAction -SleepAction { param($milliseconds) } } catch { $threw = $true }
        $threw | Should Be $true
    }

    It 'requires the existing task to invoke the exact start script/config with IgnoreNew' {
        $task = [pscustomobject]@{
            Actions = @([pscustomobject]@{ Arguments = '-File "C:\AleBet\scripts\windows\start-prod.ps1" -ConfigPath "C:\AleBet\config\production.env" -StartupTimeoutSeconds 60' })
            Settings = [pscustomobject]@{ MultipleInstances = 'IgnoreNew' }
        }
        { Assert-AleBetServerTaskConfiguration -Task $task -StartScriptPath 'C:\AleBet\scripts\windows\start-prod.ps1' -ConfigPath 'C:\AleBet\config\production.env' } | Should Not Throw
        $task.Settings.MultipleInstances = 'Parallel'
        $threw = $false
        try { Assert-AleBetServerTaskConfiguration -Task $task -StartScriptPath 'C:\AleBet\scripts\windows\start-prod.ps1' -ConfigPath 'C:\AleBet\config\production.env' } catch { $threw = $true }
        $threw | Should Be $true
    }
}
