$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$launcher = Join-Path $PSScriptRoot 'desktop.ps1'
foreach ($action in 'Start','Stop') {
    $name = if ($action -eq 'Start') { 'Draft Coach starten' } else { 'Draft Coach stoppen' }
    $shortcut = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '" -Action ' + $action
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.Description = $name
    $shortcut.Save()
}
