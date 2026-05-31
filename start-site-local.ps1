param(
  [int]$Port = 8090
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot

Set-Location $root
$env:PORT = [string]$Port
Write-Host "Garimpanda local em http://127.0.0.1:$Port"
npm start
