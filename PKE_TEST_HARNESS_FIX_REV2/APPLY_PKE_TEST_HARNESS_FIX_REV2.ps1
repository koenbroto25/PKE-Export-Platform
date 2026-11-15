[CmdletBinding()]
param([string]$RepoRoot = "D:\PKE")

$ErrorActionPreference = "Stop"
$PackageRoot = $PSScriptRoot
$PayloadRoot = Join-Path $PackageRoot "payload"
$ManifestPath = Join-Path $PackageRoot "SHA256SUMS.txt"

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) { throw "Repository root not found: $RepoRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "package.json") -PathType Leaf)) { throw "package.json not found under $RepoRoot" }
if (-not (Test-Path -LiteralPath $PayloadRoot -PathType Container)) { throw "Payload folder missing." }
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "SHA256SUMS.txt missing." }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupRoot = Join-Path $RepoRoot "_backups\PKE_TEST_HARNESS_FIX_REV2_$stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$replaceFiles = @(
  "scripts/test-db/run-integration.mjs",
  "scripts/test-db/preflight.mjs",
  "src/test-db/run-integration.guard.test.ts",
  "vitest.config.js",
  "vitest.config.ts",
  "vitest.config.integration.js",
  "vitest.config.integration.ts"
)
$deleteFiles = @("src/test-db/preflight.test.js")

# Back up all existing targets before making any change.
foreach ($relative in ($replaceFiles + $deleteFiles)) {
  $target = Join-Path $RepoRoot ($relative -replace "/", "\")
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $backup = Join-Path $BackupRoot ($relative -replace "/", "\")
    New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup -Force
  }
}

# Copy replacements, preserving repository-relative paths.
foreach ($relative in $replaceFiles) {
  $source = Join-Path $PayloadRoot ($relative -replace "/", "\")
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing payload file: $source" }
  $target = Join-Path $RepoRoot ($relative -replace "/", "\")
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

# Remove only the obsolete contradictory test. Keep preflight.test.ts.
foreach ($relative in $deleteFiles) {
  $target = Join-Path $RepoRoot ($relative -replace "/", "\")
  if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
}

# Verify payload SHA-256 hashes.
$verified = @()
foreach ($line in Get-Content -LiteralPath $ManifestPath) {
  if ($line -match '^([a-fA-F0-9]{64})\s+(.+)$') {
    $expected = $Matches[1].ToLowerInvariant()
    $relative = $Matches[2].Trim().Replace("/", "\")
    $target = Join-Path $RepoRoot $relative
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing installed file: $relative" }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "SHA-256 mismatch: $relative" }
    $verified += [pscustomobject]@{ RepositoryPath=$relative; SHA256=$actual; Status="VERIFIED" }
  } else { throw "Invalid hash manifest line: $line" }
}

$legacy = Join-Path $RepoRoot "src\test-db\preflight.test.js"
if (Test-Path -LiteralPath $legacy) { throw "Legacy test still exists after removal: $legacy" }

Write-Host "`nPatch applied. File hashes verified." -ForegroundColor Green
Write-Host "Backup: $BackupRoot"
$verified | Format-Table -AutoSize

Write-Host "`nSAFE STATIC VALIDATION COMMANDS (no DB/Docker):"
Write-Host "  Set-Location '$RepoRoot'"
Write-Host "  npx vitest run"
Write-Host "  npx tsc --noEmit"
Write-Host "`nDO NOT run npm run test:integration without separate owner authorization for local Docker/database use."
