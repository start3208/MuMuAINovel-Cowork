$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$python = Join-Path $backendDir '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Error "未找到虚拟环境，请先完成部署。缺少: $python"
}

Set-Location $backendDir
$env:DEBUG = 'false'
$env:APP_HOST = '127.0.0.1'
$env:APP_PORT = '8000'
$env:DATABASE_URL = 'sqlite+aiosqlite:///./data/mumuai.db'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
