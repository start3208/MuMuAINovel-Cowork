$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $root
$python = Join-Path $repoRoot 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Error "未找到后端虚拟环境：$python"
}

Set-Location $root
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
& $python -m uvicorn backend.main:app --host 127.0.0.1 --port 8011
