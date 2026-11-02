$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:NODE_ENV = 'production'
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\logs" | Out-Null
Get-ChildItem "$PSScriptRoot\logs" -Filter '*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item -Force
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$p = Start-Process -FilePath "$PSScriptRoot\runtime\node.exe" -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -RedirectStandardOutput "$PSScriptRoot\logs\server-$stamp.log" -RedirectStandardError "$PSScriptRoot\logs\error-$stamp.log" -PassThru
$p.Id | Set-Content "$PSScriptRoot\logs\server.pid"
$p.WaitForExit()
exit $p.ExitCode
