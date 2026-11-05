$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!$env:PYTHON_PATH -and (Test-Path -LiteralPath $venvPython)) { $env:PYTHON_PATH = $venvPython }
& node --env-file-if-exists=.env server.mjs
exit $LASTEXITCODE
