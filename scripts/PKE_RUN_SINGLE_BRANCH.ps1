<#
PKE_RUN_SINGLE_BRANCH.ps1 — Revision 4 (2026-11-14, owner-mandated, permanent)
SINGLE Neon project, SINGLE branch, SINGLE DATABASE_URL. NO additional branches ever.
  Project : purple-base-63944903 (PKE-export-platform)
  Branch  : br-damp-shape-b3xlh4nr (production)
  Database: neondb
  Host    : ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech
  Role    : app_runtime_secure (TLS required)

FAIL-CLOSED: stops if target is not the mandated project/branch/host/db/role.
NEVER creates branches, NEVER uses local PostgreSQL/Docker, NEVER falls back to legacy targets,
NEVER prints secrets/connection strings. Does not modify owner secrets/config.
#>
param(
  [ValidateSet("preflight","integration","backend","frontend","smoke","all")]
  [string]$Mode = "preflight",
  [switch]$SkipDbProof
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$EXPECTED_PROJECT_ID  = "purple-base-63944903"
$EXPECTED_BRANCH_ID   = "br-damp-shape-b3xlh4nr"
$EXPECTED_BRANCH_NAME = "production"
$EXPECTED_HOST        = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech"
$EXPECTED_DB          = "neondb"
$EXPECTED_ROLE        = "app_runtime_secure"

$FORBIDDEN_ENV = @("NEON_TEST_DATABASE_URL","NEON_TEST_PROJECT_ID","NEON_TEST_BRANCH_ID","PKE_TEST_TARGET","LOCAL_TEST_DATABASE_URL","LOCAL_TEST_MAINTENANCE_DATABASE_URL")
$LEGACY_HOST_HINTS = @("ep-restless-hat-b35j9x0d","ep-blue-rice-b3ywrqrq","br-calm-glade-b3nrleet","br-billowing-math-b31f4wos","lucky-glitter-99553107")

function Fail([string]$msg) { Write-Error "BLOCKED (single-branch policy): $msg"; exit 1 }

function Assert-NoForbiddenEnv {
  foreach ($k in $FORBIDDEN_ENV) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ($null -ne $v -and $v -ne "") { Fail "Forbidden env var set: $k. NEON_TEST_DATABASE_URL/branch-selection/local-db vars are not allowed." }
  }
}

function Assert-NeonConfig {
  $neonPath = Join-Path $PSScriptRoot "..\.neon"
  if (-not (Test-Path $neonPath)) { Fail ".neon config missing; cannot prove project/branch." }
  $cfg = Get-Content $neonPath -Raw | ConvertFrom-Json
  if ($cfg.projectId -ne $EXPECTED_PROJECT_ID) { Fail "projectId must be $EXPECTED_PROJECT_ID." }
  if ($cfg.branchId -ne $EXPECTED_BRANCH_ID) { Fail "branchId must be $EXPECTED_BRANCH_ID." }
  $branchName = if ($cfg.PSObject.Properties.Name -contains "branch") { $cfg.branch } else { $EXPECTED_BRANCH_NAME }
  if ($branchName -ne $EXPECTED_BRANCH_NAME) { Fail "branch name must be $EXPECTED_BRANCH_NAME." }
  Write-Host "OK: .neon targets project $EXPECTED_PROJECT_ID / branch $EXPECTED_BRANCH_ID ($EXPECTED_BRANCH_NAME)." -ForegroundColor Green
}

function Assert-DatabaseUrlTarget {
  $db = $env:DATABASE_URL
  if ([string]::IsNullOrWhiteSpace($db)) { Fail "DATABASE_URL is not set. Single DATABASE_URL to the mandated production branch is required." }
  foreach ($h in $LEGACY_HOST_HINTS) { if ($db -match [regex]::Escape($h)) { Fail "DATABASE_URL references a legacy/forbidden project or branch host." } }
  try { $u = [Uri]$db } catch { Fail "DATABASE_URL is malformed." }
  if ($u.Host -ne $EXPECTED_HOST) { Fail "DATABASE_URL host must be exactly $EXPECTED_HOST." }
  $dbName = $u.AbsolutePath.TrimStart('/')
  if ($dbName -ne $EXPECTED_DB) { Fail "DATABASE_URL database must be $EXPECTED_DB." }
  $user = [Uri]::UnescapeDataString($u.UserInfo.Split(':')[0])
  if ($user -ne $EXPECTED_ROLE) { Fail "DATABASE_URL role must be $EXPECTED_ROLE." }
  try { $q = [System.Web.HttpUtility]::ParseQueryString($u.Query) } catch { $q = $null }
  $ssl = if ($q) { $q["sslmode"] } else { "" }
  if ($ssl -notin @("require","verify-ca","verify-full")) { Fail "TLS required: sslmode must be require/verify-ca/verify-full." }
  Write-Host "OK: DATABASE_URL targets mandated single production host/db/role with TLS (value not shown)." -ForegroundColor Green
}

function Run-Preflight {
  $skip = @()
  if ($SkipDbProof) { $skip += "--skip-db-proof" }
  Write-Host "Running strict single-branch preflight (scripts/test-db/preflight.mjs)..."
  node (Join-Path $PSScriptRoot "test-db\preflight.mjs") @skip
  if ($LASTEXITCODE -ne 0) { Fail "Preflight failed." }
}

function Run-Integration {
  Write-Host "Running integration tests (single DATABASE_URL, no branches, QA fixtures must be namespaced/cleaned)..."
  node (Join-Path $PSScriptRoot "test-db\run-integration.mjs")
  if ($LASTEXITCODE -ne 0) { Fail "Integration tests failed." }
}

function Run-Backend { Write-Host "Starting backend (npm run dev) against single mandated DATABASE_URL..."; npm run dev }
function Run-Frontend { Push-Location (Join-Path $PSScriptRoot "..\frontend"); try { npm run dev } finally { Pop-Location } }
function Run-Smoke { Write-Host "Smoke: manual/backend/frontend checks against single mandated target only. No branches, no dummy business data." }

Assert-NoForbiddenEnv
Assert-NeonConfig
Assert-DatabaseUrlTarget

switch ($Mode) {
  "preflight"   { Run-Preflight }
  "integration" { Run-Preflight; Run-Integration }
  "backend"     { Run-Preflight; Run-Backend }
  "frontend"    { Run-Frontend }
  "smoke"       { Run-Preflight; Run-Smoke }
  "all"         { Run-Preflight; Run-Integration }
}
