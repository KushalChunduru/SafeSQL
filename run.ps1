param(
    [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venvPython = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "No .venv found at $venvPython. Run: python -m venv .venv; .venv\Scripts\activate; pip install -r requirements.txt"
    exit 1
}

$reloadFlag = if ($NoReload) { @() } else { @("--reload") }

& $venvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 @reloadFlag
