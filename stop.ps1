$targets = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*uvicorn app.main:app*--port 8000*'
}

if (-not $targets) {
    Write-Host '未发现 MuMuAINovel 运行进程。'
    exit 0
}

$targets | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Host "已停止进程 $($_.ProcessId)"
}
