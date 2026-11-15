
[CmdletBinding()]
param([string]$ProjectRoot = "D:\PKE")

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$zip = Join-Path $ProjectRoot "PKE_NEON_INTEGRATION_BLOCKERS_$stamp.zip"
$tmp = Join-Path $env:TEMP "PKE_TRIAGE_$stamp"
$dst = Join-Path $tmp "PKE_NEON_INTEGRATION_BLOCKERS"
New-Item -ItemType Directory -Path $dst -Force | Out-Null

$excludeDirs = @(".git","node_modules","dist","build",".next",".vercel",
  "coverage",".cache","_evidence","_db_sync","test-results")
$excludeFiles = @("*.env","*.env.*","*.pem","*.key","*.p12","*.pfx",
  "*.dump","*.backup","*.zip","*.7z","*.sql.gz")
$allowed = @(".ts",".tsx",".js",".jsx",".mjs",".cjs",".json",".sql",
  ".ps1",".psm1",".md",".txt",".yml",".yaml",".toml",".prisma",
  ".graphql",".sh",".html",".css",".scss",".xml")

$manifest = [System.Collections.Generic.List[string]]::new()
$seen = @{}

function Is-Excluded([string]$rel) {
  $parts = $rel -split '[\\/]'
  foreach ($p in $parts) {
    if ($excludeDirs -contains $p) { return $true }
  }
  $name = [IO.Path]::GetFileName($rel)
  foreach ($pattern in $excludeFiles) {
    if ($name -like $pattern) { return $true }
  }
  return $false
}

function Redact([string]$s) {
  $s = [regex]::Replace($s,
    '(?im)(DATABASE_URL(?:_UNPOOLED)?|MIGRATION_DATABASE_URL|SOURCE_OWNER_DATABASE_URL|TARGET_DATABASE_URL|NEON_API_KEY|NEON_AUTH_[A-Z0-9_]+|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GEMINI_API_KEY|GOOGLE_API_KEY|VERCEL_TOKEN|GITHUB_TOKEN|JWT_SECRET|SESSION_SECRET)(\s*[:=]\s*)(["'']?)[^\s"'']+',
    '$1$2"[REDACTED]"')
  $s = [regex]::Replace($s,
    '(?i)(postgres(?:ql)?://[^:\s/@]+:)[^@\s]+(@)',
    '$1[REDACTED]$2')
  $s = [regex]::Replace($s,
    '(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+',
    '$1[REDACTED]')
  $s = [regex]::Replace($s,
    '\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|vercel_[A-Za-z0-9]{20,})\b',
    '[REDACTED]')
  return $s
}

function Add-SafeFile([string]$full, [string]$reason) {
  if (!(Test-Path -LiteralPath $full -PathType Leaf)) { return }
  $full = (Resolve-Path -LiteralPath $full).Path
  if (!$full.StartsWith($ProjectRoot,[StringComparison]::OrdinalIgnoreCase)) { return }
  $rel = $full.Substring($ProjectRoot.Length).TrimStart('\','/')
  if (Is-Excluded $rel -or $seen.ContainsKey($rel)) { return }
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $base = [IO.Path]::GetFileName($full)
  if ($allowed -notcontains $ext -and $base -notin @(".gitignore",".vercelignore","Dockerfile")) { return }

  $target = Join-Path $dst $rel
  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  try {
    $content = [IO.File]::ReadAllText($full)
    [IO.File]::WriteAllText($target,(Redact $content),(New-Object Text.UTF8Encoding($false)))
    $hash = (Get-FileHash $target -Algorithm SHA256).Hash
    $manifest.Add("$rel`t$reason`t$hash")
    $seen[$rel] = $true
  } catch {
    $manifest.Add("$rel`tREAD_ERROR`t$($_.Exception.GetType().Name)")
  }
}

function Save-Command([string]$rel,[scriptblock]$cmd) {
  $p = Join-Path $dst $rel
  New-Item -ItemType Directory -Path (Split-Path $p) -Force | Out-Null
  try {
    $v = (& $cmd 2>&1 | Out-String)
    [IO.File]::WriteAllText($p,(Redact $v),(New-Object Text.UTF8Encoding($false)))
  } catch {
    Set-Content -LiteralPath $p "COMMAND_ERROR: $($_.Exception.Message)"
  }
}

Push-Location $ProjectRoot
try {
  # Git metadata only; no fetch, pull, checkout, commit, push, or reset.
  Save-Command "evidence\git-status.txt" { git status --short --branch }
  Save-Command "evidence\git-branch.txt" { git branch --show-current }
  Save-Command "evidence\git-remotes.txt" { git remote -v }
  Save-Command "evidence\git-diff-stat.txt" { git diff --stat }
  Save-Command "evidence\git-diff-names.txt" { git diff --name-only }
  Save-Command "evidence\git-cached-diff-stat.txt" { git diff --cached --stat }
  Save-Command "evidence\git-env-index.txt" {
    "git ls-files .env"; git ls-files -- .env
    "git check-ignore .env"; git check-ignore -v .env
  }

  # Only environment variable NAMES, never values.
  $keys = @()
  foreach ($f in @(".env",".env.local",".env.test.local",
                    "frontend/.env","frontend/.env.local")) {
    $path = Join-Path $ProjectRoot $f
    if (Test-Path $path) {
      foreach ($line in [IO.File]::ReadAllLines($path)) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=') {
          $keys += "$f`t$($Matches[1])"
        }
      }
    }
  }
  $keys | Sort-Object -Unique |
    Set-Content (Join-Path $dst "evidence\env-key-names-only.txt") -Encoding UTF8

  # Full relevant source trees, including untracked files.
  foreach ($folder in @("src","frontend/src","migrations","migration",
                        "scripts","tests","test","shared","server","api")) {
    $root = Join-Path $ProjectRoot $folder
    if (Test-Path $root -PathType Container) {
      Get-ChildItem $root -Recurse -File -Force |
        ForEach-Object { Add-SafeFile $_.FullName "SOURCE_TREE" }
    }
  }

  # Runtime/build/deployment configuration.
  $rootFiles = @(
    "package.json","package-lock.json","npm-shrinkwrap.json",
    "tsconfig.json","tsconfig.build.json","vite.config.ts",
    "vitest.config.ts","vercel.json",".vercelignore",".gitignore",
    "README.md","Dockerfile","Procfile","render.yaml",
    "frontend/package.json","frontend/package-lock.json",
    "frontend/tsconfig.json","frontend/vite.config.ts",
    "frontend/vercel.json","frontend/.gitignore",
    "drizzle.config.ts","knexfile.ts","prisma/schema.prisma",
    "PKE_Master_Implementation_Plan_Rev1.7_Single_Source.md"
  )
  foreach ($f in $rootFiles) {
    Add-SafeFile (Join-Path $ProjectRoot $f) "ROOT_CONFIG"
  }

  # Root-level diagnostic logs and text traces.
  Get-ChildItem $ProjectRoot -File -Force |
    Where-Object {
      $_.Name -match '(?i)(demo|error|err|out|integration|neon|vercel|deploy|test|build).*\.log$' -or
      $_.Name -match '(?i)(calls|trace|diagnostic).*\.txt$'
    } |
    ForEach-Object { Add-SafeFile $_.FullName "ROOT_DIAGNOSTIC" }

  foreach ($folder in @("logs","_logs","tmp","_tmp")) {
    $root = Join-Path $ProjectRoot $folder
    if (Test-Path $root -PathType Container) {
      Get-ChildItem $root -Recurse -File |
        Where-Object { $_.Extension -in @(".log",".txt") } |
        ForEach-Object { Add-SafeFile $_.FullName "DIAGNOSTIC_LOG" }
    }
  }

  $manifest | Sort-Object |
    Set-Content (Join-Path $dst "COLLECTION_MANIFEST.tsv") -Encoding UTF8

  @(
    "PKE Neon Integration Blocker Collection"
    "Created: $(Get-Date -Format o)"
    "Repository: $ProjectRoot"
    "Mode: READ-ONLY"
    "Files collected: $($seen.Count)"
    ".env values, private keys, database dumps, .git and node_modules excluded."
    "Credential-like values in text files redacted."
    "No Git, Neon, Auth, Storage, GitHub or Vercel mutation."
  ) | Set-Content (Join-Path $dst "README_COLLECTION.txt") -Encoding UTF8

  if (Test-Path $zip) { throw "Refusing to overwrite $zip" }
  Compress-Archive -Path (Join-Path $dst "*") -DestinationPath $zip -CompressionLevel Optimal
  $sha = (Get-FileHash $zip -Algorithm SHA256).Hash
  Set-Content "$zip.sha256" "$sha  $(Split-Path $zip -Leaf)"

  Write-Host "`nCOLLECTION COMPLETE" -ForegroundColor Green
  Write-Host "ZIP: $zip"
  Write-Host "SHA256: $sha"
  Write-Host "Files: $($seen.Count)"
  Write-Host "No project or database changes were made."
}
finally {
  Pop-Location
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
