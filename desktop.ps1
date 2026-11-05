param(
    [ValidateSet('Start', 'Stop', 'Test')]
    [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Join-Path $PSScriptRoot 'runtime'
$port = if ($Action -eq 'Test') { 14317 } else { 4317 }
$localUrl = "http://127.0.0.1:$port"
$deviceFile = Join-Path $runtime 'desktop-device.txt'

function Get-CoachConfig {
    try {
        Invoke-RestMethod -Uri "$localUrl/api/config" -TimeoutSec 2
    } catch {
        $null
    }
}

function Start-Coach {
    $config = Get-CoachConfig
    if ($config.token -and $config.collection) {
        if (!$config.desktopControl) { throw 'Auf Port 4317 läuft noch eine ältere Coach-Version. Beende zuerst deren Startfenster.' }
        return
    }

    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = $null
    if ($node) {
        $version = & $node.Source --version
        if ($version -match '^v(\d+\.\d+\.\d+)' -and [version]$Matches[1] -ge [version]'22.16.0') { $nodePath = $node.Source }
    }
    $pythonPath = $env:PYTHON_PATH
    if (!$pythonPath) {
        $pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
        if (!(Test-Path -LiteralPath $pythonPath)) { $pythonPath = 'python' }
    }
    if (!$nodePath) { throw 'Node.js ab Version 22.16 fehlt.' }

    $env:PORT = "$port"
    $env:PYTHON_PATH = $pythonPath
    if ($Action -ne 'Test' -and !$env:ADB_DEVICE -and (Test-Path -LiteralPath $deviceFile)) {
        $savedDevice = (Get-Content -LiteralPath $deviceFile -Raw).Trim()
        if ($savedDevice -match '^[a-zA-Z0-9._:-]{1,180}$') { $env:ADB_DEVICE = $savedDevice }
    }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $log = Join-Path $runtime "desktop-server-$port.log"
    $errorLog = Join-Path $runtime "desktop-server-$port-error.log"
    $process = Start-Process -FilePath $nodePath -ArgumentList '--env-file-if-exists=.env','server.mjs' -WorkingDirectory $PSScriptRoot `
        -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errorLog -PassThru
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        $config = Get-CoachConfig
        if ($config.token -and $config.desktopControl) { return }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    throw "Der Coach antwortet nicht. Details stehen in $errorLog"
}

function Stop-Coach {
    $config = Get-CoachConfig
    if (!$config.token -or !$config.collection) { return }
    if (!$config.desktopControl) { throw 'Diese ältere Coach-Version unterstützt die Desktop-Steuerung noch nicht.' }
    if ($Action -ne 'Test') {
        $state = Invoke-RestMethod -Uri "$localUrl/api/state" -TimeoutSec 3
        if ($state.device -match '^[a-zA-Z0-9._:-]{1,180}$') {
            Set-Content -LiteralPath $deviceFile -Value $state.device -Encoding ASCII
        }
    }
    $headers = @{ 'x-coach-token' = $config.token }
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        try {
            Invoke-RestMethod -Uri "$localUrl/api/desktop/stop" -Method Post -Headers $headers -TimeoutSec 3 | Out-Null
            return
        } catch {
            if ($null -eq $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) {
                if (!(Get-CoachConfig)) { return }
                throw 'Der Coach konnte nicht beendet werden. Falls noch eine ältere Version läuft, beende zuerst deren Startfenster.'
            }
        }
        Start-Sleep -Milliseconds 300
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Der Coach ist noch beschäftigt. Versuche es nach Abschluss erneut.'
}

$mutex = New-Object Threading.Mutex($false, 'Local\DraftCoachDesktop4317')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Der Coach wird gerade gestartet oder beendet.' }
    if ($Action -eq 'Stop') {
        Stop-Coach
    } elseif ($Action -eq 'Test') {
        if (Get-CoachConfig) { throw 'Für den Start-Stopp-Test muss der Coach zuerst beendet sein.' }
        try {
            Start-Coach
            $deadline = [DateTime]::UtcNow.AddSeconds(20)
            do {
                $state = Invoke-RestMethod -Uri "$localUrl/api/state" -TimeoutSec 3
                if ($state.ready) { break }
                if ($state.error) { throw $state.error }
                Start-Sleep -Milliseconds 250
            } while ([DateTime]::UtcNow -lt $deadline)
            if (!$state.ready) { throw 'Die Bilderkennung wurde nicht bereit.' }
        } finally {
            Stop-Coach
        }
        Start-Sleep -Milliseconds 500
        if (Get-CoachConfig) { throw 'Der Coach antwortet nach Stopp noch.' }
        Write-Output 'Start, Bilderkennung und Stopp erfolgreich geprüft.'
    } else {
        Start-Coach
        Start-Process "$localUrl/"
    }
} catch {
    if ($Action -eq 'Test') { throw }
    Add-Type -AssemblyName PresentationFramework
    [Windows.MessageBox]::Show($_.Exception.Message, 'Draft Coach') | Out-Null
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
