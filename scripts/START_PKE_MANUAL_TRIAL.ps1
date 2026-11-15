<#
PKE Manual Trial Mode launcher (Rev 5.4-5.5)
- Loopback-only, in-memory demo. No Neon/PostgreSQL/Auth/storage/external providers/production credentials.
- Fails closed on conflicting environment.
#>
[CmdletBinding()]
param(
  [int]$ApiPort = 3000,
  [int]$FrontendPort = 3001
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Fail([string]$msg) { Write-Host "BLOCKED: $msg" -ForegroundColor Red; exit 1 }

if ($env:NODE_ENV -eq 'production') { Fail 'NODE_ENV=production is not allowed for Manual Trial Mode.' }
if ($env:PKE_MANUAL_TRIAL_MODE -and $env:PKE_MANUAL_TRIAL_MODE -notmatch '^(1|true|yes|on)$') { Fail 'PKE_MANUAL_TRIAL_MODE is set but not enabled; use true.' }
if ($env:HOST -and $env:HOST -notin @('127.0.0.1','localhost','::1','[::1]')) { Fail 'HOST must be loopback for Manual Trial Mode.' }

$env:NODE_ENV = 'development'
$env:PKE_MANUAL_TRIAL_MODE = 'true'
$env:HOST = '127.0.0.1'
$env:PORT = [string]$ApiPort
# Prevent accidental production DB/Auth usage by demo process; demo path must not initialize them.
Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\NEON_AUTH_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\NEON_AUTH_JWKS_URL -ErrorAction SilentlyContinue

$frontendEnv = Join-Path $root 'frontend\.env.local'
$frontendEnvBak = Join-Path $root 'frontend\.env.local.manual-trial.bak'
$wroteFrontendEnv = $false
if (-not (Test-Path -LiteralPath $frontendEnv)) {
  @(
    'VITE_PKE_MANUAL_TRIAL_MODE=true'
    'VITE_API_BASE=/api/v1'
    'VITE_NEON_AUTH_URL=http://127.0.0.1/manual-trial-disabled'
  ) | Set-Content -LiteralPath $frontendEnv -Encoding UTF8
  $wroteFrontendEnv = $true
} else {
  $content = Get-Content -LiteralPath $frontendEnv -Raw
  if ($content -notmatch 'VITE_PKE_MANUAL_TRIAL_MODE\s*=') {
    Copy-Item -LiteralPath $frontendEnv -Destination $frontendEnvBak -Force
    Add-Content -LiteralPath $frontendEnv -Value "`nVITE_PKE_MANUAL_TRIAL_MODE=true`nVITE_API_BASE=/api/v1"
    $wroteFrontendEnv = $true
  }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PKE MANUAL TRIAL MODE (BROWSER LOCAL DEMO)" -ForegroundColor Cyan
Write-Host "- Loopback only: API http://127.0.0.1:$ApiPort  Frontend http://127.0.0.1:$FrontendPort" -ForegroundColor Gray
Write-Host "- In-memory deterministic demo data, resettable, survives browser refresh (not server restart)" -ForegroundColor Gray
Write-Host "- NO Neon/PostgreSQL, NO Neon Auth, NO storage, NO external providers, NO production credentials/writes" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

$apiCmd = "Set-Location -LiteralPath '$root'; `$env:NODE_ENV='development'; `$env:PKE_MANUAL_TRIAL_MODE='true'; `$env:HOST='127.0.0.1'; `$env:PORT='$ApiPort'; `$env:DATABASE_URL=''; `$env:NEON_AUTH_BASE_URL=''; `$env:NEON_AUTH_JWKS_URL=''; npx tsx src/index.ts"
$feCmd  = "Set-Location -LiteralPath '$root\frontend'; `$env:VITE_PKE_MANUAL_TRIAL_MODE='true'; `$env:VITE_API_BASE='/api/v1'; npx vite --host 127.0.0.1 --port $FrontendPort --strictPort"

Start-Process -FilePath "powershell" -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command', $apiCmd) -WorkingDirectory $root | Out-Null
Start-Sleep -Seconds 2
Start-Process -FilePath "powershell" -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command', $feCmd) -WorkingDirectory (Join-Path $root 'frontend') | Out-Null

Write-Host "Launched demo API and frontend in separate PowerShell windows." -ForegroundColor Green
Write-Host "Open: http://127.0.0.1:$FrontendPort" -ForegroundColor Green
if ($wroteFrontendEnv) { Write-Host "Note: frontend/.env.local was created/updated for manual trial (VITE_PKE_MANUAL_TRIAL_MODE=true)." -ForegroundColor DarkYellow }
