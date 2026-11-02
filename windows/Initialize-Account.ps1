$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Read-Secret([string]$Label) {
 $value = Read-Host $Label -AsSecureString
 $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
 try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
try {
 $email = Read-Host 'Initial owner email (only for a database with no users)'
 $name = Read-Host 'Initial owner display name'
 $secret = Read-Secret 'Initial application password'
 $confirm = Read-Secret 'Confirm application password'
 if ($secret -cne $confirm) { throw 'Passwords do not match.' }
 $payload = @{email=$email;name=$name;password=$secret} | ConvertTo-Json -Compress
 # Force UTF-8 for piped Arabic names on Windows PowerShell 5.1.
 $OutputEncoding = New-Object Text.UTF8Encoding($false)
 $payload | & "$PSScriptRoot\runtime\node.exe" 'database-setup.mjs' 'bootstrap'
 if ($LASTEXITCODE -ne 0) { throw 'Account creation failed; existing accounts were not overwritten.' }
 $secret=$null;$confirm=$null;$payload=$null
 exit 0
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
