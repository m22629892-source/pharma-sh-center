param([switch]$Reconfigure,[switch]$Uninstall,[string]$InstallDirectory = "$env:ProgramData\PharmaSHCenter")
$ErrorActionPreference = 'Stop'
$taskName = 'PharmaSHCenter-Server'
$ruleName = 'PharmaSHCenter-PrivateLAN'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
 $argsLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -InstallDirectory "' + $InstallDirectory + '"'
 if ($Reconfigure) { $argsLine += ' -Reconfigure' }
 if ($Uninstall) { $argsLine += ' -Uninstall' }
 $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $argsLine -Wait -PassThru
 exit $child.ExitCode
}
function Stop-App {
 $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 if ($task) { Stop-ScheduledTask -TaskName $taskName; Start-Sleep -Seconds 2 }
 $nodePath = Join-Path $InstallDirectory 'runtime\node.exe'
 Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.ExecutablePath -eq $nodePath -and $_.CommandLine -match 'server\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Ask([string]$Label,[string]$Default = '') {
 $value = Read-Host "$Label [$Default]"
 if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
 return $value.Trim()
}
function Plain([Security.SecureString]$Secure) {
 $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
 try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Encode-Env([string]$Value) {
 if ($Value.Contains("`r") -or $Value.Contains("`n")) { throw 'Settings must not contain line breaks.' }
 foreach ($char in @([char]96,[char]39,[char]34)) {
  if (-not $Value.Contains([string]$char)) {
   if ($char -eq [char]34 -and ($Value.Contains('\n') -or $Value.Contains('\r'))) { continue }
   return ([string]$char + $Value + [string]$char)
  }
 }
 throw 'This value contains all quote delimiters. Configure it manually before retrying.'
}
function Node-Command([string]$Command) {
 & "$InstallDirectory\runtime\node.exe" 'database-setup.mjs' $Command
 if ($LASTEXITCODE -ne 0) { throw "Database step failed: $Command" }
}
try {
 if ($Uninstall) {
  Stop-App
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host 'Automatic startup and the application firewall rule removed. Database, settings and program files kept.'
  exit 0
 }
 if (-not (Test-Path "$PSScriptRoot\runtime\node.exe")) { throw 'Use the complete Windows build artifact, not the source-code ZIP.' }
 $oldEnv = Join-Path $InstallDirectory '.env'
 $keepSettings = (Test-Path $oldEnv) -and -not $Reconfigure
 $settings = $null
 $initialize = $false
 if (-not $keepSettings) {
  Write-Host 'PharmaSHCenter - Windows 11 LAN server setup'
  $dbHost = Ask 'SQL Server host / IP (host only)' '127.0.0.1'
  $dbPort = Ask 'SQL Server TCP port' '1433'
  $dbName = Ask 'Database name' 'PharmaSHCenter'
  $dbUser = Ask 'SQL Server Authentication login (not application email)'
  $dbPassword = Plain (Read-Host 'SQL Server password' -AsSecureString)
  $webPort = Ask 'Application web port' '3000'
  $credentialMode = Ask 'Application password mode: plaintext or hashed' 'plaintext'
  foreach ($p in @($dbPort,$webPort)) { if ($p -notmatch '^\d+$' -or [int]$p -lt 1 -or [int]$p -gt 65535) { throw 'Invalid port number.' } }
  if (-not $dbHost -or $dbHost.Contains('\') -or -not $dbUser -or -not $dbPassword) { throw 'Provide SQL host, TCP port, login and password.' }
  if ($dbName -notmatch '^[A-Za-z0-9_]{1,128}$') { throw 'Use a database name with letters, digits or underscore.' }
  if ($credentialMode -notin @('plaintext','hashed')) { throw 'Invalid application password mode.' }
  $initialize = (Ask 'Create a NEW EMPTY database? Existing databases must use N. Y/N' 'N') -eq 'Y'
  $settings = [ordered]@{DATA_BACKEND='sqlserver';VITE_DATA_BACKEND='sqlserver';HOST='0.0.0.0';PORT=$webPort;APP_URL="http://localhost:$webPort";DB_SERVER=$dbHost;DB_PORT=$dbPort;DB_DATABASE=$dbName;DB_USER=$dbUser;DB_PASSWORD=$dbPassword;DB_TDS_VERSION='7_3_A';DB_ENCRYPT='false';DB_TRUST_CERTIFICATE='false';DB_PASSWORD_MODE=$credentialMode;SESSION_COOKIE_SECURE='false';GEMINI_API_KEY=''}
 }
 Stop-App
 New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
 $source = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
 $target = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
 if ($source -ne $target) { Copy-Item "$PSScriptRoot\*" $InstallDirectory -Recurse -Force }
 # Limit configuration and application access to administrators, SYSTEM and LocalService.
 & icacls.exe $InstallDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict installation folder permissions.' }
 New-Item -ItemType Directory -Force -Path "$InstallDirectory\logs" | Out-Null
 & icacls.exe "$InstallDirectory\logs" /grant:r '*S-1-5-19:(OI)(CI)M' | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Failed to grant server logging permissions.' }
 if ($settings) {
  if (Test-Path $oldEnv) { Copy-Item $oldEnv ($oldEnv + '.previous') -Force }
  $lines = foreach ($key in $settings.Keys) { "$key=$(Encode-Env ([string]$settings[$key]))" }
  [IO.File]::WriteAllLines($oldEnv,$lines,(New-Object Text.UTF8Encoding($false)))
 }
 Set-Location $InstallDirectory
 if ($initialize) {
  Node-Command 'initialize'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$InstallDirectory\Initialize-Account.ps1"
  if ($LASTEXITCODE -ne 0) { throw 'Initial account setup failed. Run Create-First-Account.cmd as administrator to retry when the Users table is still empty.' }
 }
 Node-Command 'check'
 $readPort = & "$InstallDirectory\runtime\node.exe" '--input-type=module' '-e' "import 'dotenv/config'; console.log(process.env.PORT || '3000')"
 if ($LASTEXITCODE -ne 0) { throw 'Cannot read web port.' }
 $webPort = [string](@($readPort)[-1])
 if ($webPort -notmatch '^\d+$') { throw 'Invalid configured web port.' }
 $node = Join-Path $InstallDirectory 'runtime\node.exe'
 Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
 New-NetFirewallRule -Name $ruleName -DisplayName 'PharmaSHCenter local network' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ([int]$webPort) -Program $node -Profile Private,Domain -RemoteAddress LocalSubnet | Out-Null
 $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $InstallDirectory + '\Run-Server.ps1"') -WorkingDirectory $InstallDirectory
 $trigger = New-ScheduledTaskTrigger -AtStartup
 $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
 $options = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
 Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $options -Force | Out-Null
 $local = "http://localhost:$webPort"
 $urls = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' } | ForEach-Object { "http://$($_.IPAddress):$webPort" })
 $urls | Set-Content "$InstallDirectory\network-info.txt" -Encoding UTF8
 $local | Set-Content "$InstallDirectory\local-url.txt" -Encoding Ascii
 $shortcut = "[InternetShortcut]`r`nURL=$local`r`n"
 $shortcut | Set-Content (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'PharmaSHCenter.url') -Encoding Ascii
 Start-ScheduledTask -TaskName $taskName
 $ready = $false
 for ($i=0;$i -lt 20;$i++) { try { $health=Invoke-RestMethod "$local/api/sql/health" -TimeoutSec 2; if ($health.ok) { $ready=$true;break } } catch {} Start-Sleep -Seconds 1 }
 if (-not $ready) { throw "Server did not become ready. Review $InstallDirectory\logs and SQL connectivity. Automatic startup remains installed." }
 Write-Host 'Installation complete. Employee computers use one of these LAN URLs:'
 $urls | ForEach-Object { Write-Host $_ }
 Write-Host 'Only the application port was opened on Private/Domain local subnets. SQL was not exposed by this installer.'
 Start-Process $local
} catch {
 Write-Host "Setup stopped: $($_.Exception.Message)" -ForegroundColor Red
 Write-Host 'The database was not deleted. Existing settings may be available in .env.previous.'
 exit 1
}
