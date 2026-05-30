$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$n8nRoot = 'C:\Users\Tullio\Documents\PROJETOS\radarimobi\n8n'
$nodeDir = Join-Path $n8nRoot '.local\node-v24.14.0-win-x64'
$n8nCmd = Join-Path $n8nRoot 'app\node_modules\.bin\n8n.cmd'
$userDir = Join-Path $root '.n8n-local'

New-Item -ItemType Directory -Force -Path $userDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $userDir '.n8n') | Out-Null

$env:Path = "$nodeDir;$env:Path"
$env:N8N_USER_FOLDER = $userDir
$env:N8N_HOST = '127.0.0.1'
$env:N8N_PORT = '5678'
$env:N8N_PROTOCOL = 'http'
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
$env:N8N_PERSONALIZATION_ENABLED = 'false'
$env:N8N_RUNNERS_MODE = 'internal'
$env:N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = 'false'
$env:N8N_SECURE_COOKIE = 'false'
$env:GENERIC_TIMEZONE = 'America/Fortaleza'
$env:NODE_FUNCTION_ALLOW_BUILTIN = 'crypto'

Set-Location $root
& $n8nCmd start
