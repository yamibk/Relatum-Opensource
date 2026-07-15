# Source-mode launcher: locate Python and run app.py.
# Called by the batch launcher; may also be run with powershell -File start.ps1.
# Keep this script ASCII-only for Windows PowerShell 5.1 compatibility.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-PythonPath {
    $sys = Get-Command python -ErrorAction SilentlyContinue
    if ($sys -and $sys.Source) { return $sys.Source }
    return $null
}

$python = Get-PythonPath
if (-not $python) {
    Write-Host ""
    Write-Host "  Python was not found." -ForegroundColor Red
    Write-Host "  Install Python and ensure the python command is on PATH." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$app = Join-Path $here "app.py"
# Forward arguments from the batch launcher, including an optional .canvas path.
& $python $app @args
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "  Canvas exited unexpectedly (exit code: $exitCode)." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
}

exit $exitCode
