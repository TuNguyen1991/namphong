param(
  [string]$User = "root",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 3306,
  [string]$MysqlExe = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $MysqlExe)) {
  throw "mysql.exe not found at $MysqlExe"
}

$SchemaPath = Join-Path $PSScriptRoot "001_schema.sql"
if (-not (Test-Path -LiteralPath $SchemaPath)) {
  throw "Schema file not found at $SchemaPath"
}

$securePassword = Read-Host "MySQL password for $User" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential($User, $securePassword)
$password = $credential.GetNetworkCredential().Password

try {
  Get-Content -LiteralPath $SchemaPath -Raw | & $MysqlExe --host=$HostName --port=$Port --user=$User "--password=$password"
  Write-Host "Created/updated MySQL database: alse_tms"
} finally {
  $password = $null
}
