[CmdletBinding()]
param(
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$SkipBuildAndTests
)

$ErrorActionPreference = 'Stop'
$expectedAuthBase = 'https://ep-mute-voice-b3abqeyh.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth'
$expectedJwks = 'https://ep-mute-voice-b3abqeyh.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json'

function Convert-SecureStringToPlainText([System.Security.SecureString]$Value) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Set-EnvValue([string[]]$Lines, [string]$Name, [string]$Value) {
    $pattern = '^\s*' + [Regex]::Escape($Name) + '\s*='
    $filtered = @($Lines | Where-Object { $_ -notmatch $pattern })
    $filtered += "$Name=$Value"
    return ,$filtered
}

$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$sourceRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "package.json tidak ditemukan di $ProjectRoot. Jalankan dari folder D:\PKE."
}
foreach ($relative in @('src/index.ts','src/auth.ts','scripts/migrate.mjs')) {
    if (-not (Test-Path (Join-Path $ProjectRoot $relative))) { throw "File source tidak ditemukan: $relative" }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupRoot = Join-Path $ProjectRoot "backups\REV028_$timestamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$files = @(
    'src/index.ts',
    'src/auth.ts',
    'src/auth-context.tsx',
    'src/runtime-security.ts',
    'src/runtime-security.test.ts',
    'migrations/019_project_auth_rbac_export_ops.sql',
    'migrations/020_runtime_default_privileges.sql',
    'migrations/021_secure_runtime_auth_resolver.sql',
    'migrations/022_persistent_user_notifications.sql',
    'migrations/023_accept_project_invitation.sql',
    'migrations/024_tracking_evidence_write_policies.sql',
    'migrations/025_project_rbac_read_after_write.sql',
    'migrations/026_fix_invitation_acceptance_ambiguity.sql',
    'migrations/027_workflow_and_shipment_child_rls.sql',
    'scripts/migrate.mjs',
    'scripts/verify-runtime-security.mjs',
    'scripts/bootstrap-admin.mjs',
    'scripts/verify-migration-manifest.mjs',
    'migration_manifest_001_027.json',
    'package.json',
    '.env.example',
    'REVISION_028_README.md'
)

# Snapshot every destination before touching it, including local environment files.
$trackedPaths = @($files + '.gitignore' + '.env' + '.env.migrate' | Select-Object -Unique)
$manifest = @()
foreach ($relative in $trackedPaths) {
    $destination = Join-Path $ProjectRoot $relative
    $existed = Test-Path $destination
    $manifest += [pscustomobject]@{ Path = $relative; ExistedBefore = $existed }
    if ($existed) {
        $backup = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
        Copy-Item $destination $backup -Force
    }
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $backupRoot 'manifest.json') -Encoding UTF8

foreach ($relative in $files) {
    $source = Join-Path $sourceRoot $relative
    if (-not (Test-Path $source)) { throw "File patch hilang dari paket: $relative" }
    $destination = Join-Path $ProjectRoot $relative
    $destinationDir = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    Copy-Item $source $destination -Force
}

# Keep local secrets out of git. Preserve other ignore rules.
$gitignore = Join-Path $ProjectRoot '.gitignore'
$ignoreText = @'
# Revision 028 local secrets / recovery
.env
.env.*
!.env.example
backups/
'@
if (Test-Path $gitignore) {
    $existing = Get-Content $gitignore -Raw
    $requiredIgnoreLines = @('.env', '.env.*', '!.env.example', 'backups/')
    $missingIgnoreLines = @()
    foreach ($ignoreLine in $requiredIgnoreLines) {
        if ($existing -notmatch ('(?m)^' + [Regex]::Escape($ignoreLine) + '\s*$')) {
            $missingIgnoreLines += $ignoreLine
        }
    }
    if ($missingIgnoreLines.Count -gt 0) {
        Add-Content -Path $gitignore -Value ("`r`n# Revision 028 local secrets / recovery`r`n" + ($missingIgnoreLines -join "`r`n"))
    }
} else {
    Set-Content -Path $gitignore -Value $ignoreText -Encoding UTF8
}

# Ask for the runtime credential without echoing it. It is written only to the local .env.
$secureInput = Read-Host 'Paste Neon connection URL for app_runtime_secure (input hidden)' -AsSecureString
$runtimeUrl = Convert-SecureStringToPlainText $secureInput
try {
    $uri = [Uri]$runtimeUrl
    if ($uri.Scheme -notin @('postgres','postgresql')) { throw 'URL harus memakai postgres:// atau postgresql://.' }
    $userinfo = [Uri]::UnescapeDataString($uri.UserInfo)
    $runtimeUser = ($userinfo -split ':',2)[0]
    if ($runtimeUser -ne 'app_runtime_secure') { throw 'Connection URL harus menggunakan role app_runtime_secure, bukan app_runtime atau neondb_owner.' }

    $envPath = Join-Path $ProjectRoot '.env'
    $previousLines = if (Test-Path $envPath) { @(Get-Content $envPath) } else { @() }
    # Preserve a previous owner connection separately, never in the API .env.
    $migrationUrl = $null
    $migrationLine = $previousLines | Where-Object { $_ -match '^\s*MIGRATION_DATABASE_URL\s*=' } | Select-Object -Last 1
    if ($migrationLine) {
        $migrationUrl = ($migrationLine -replace '^\s*MIGRATION_DATABASE_URL\s*=','').Trim().Trim('"').Trim("'")
    } else {
        $oldDbLine = $previousLines | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
        if ($oldDbLine) {
            $oldDbUrl = ($oldDbLine -replace '^\s*DATABASE_URL\s*=','').Trim().Trim('"').Trim("'")
            try {
                $oldUri = [Uri]$oldDbUrl
                $oldUser = [Uri]::UnescapeDataString($oldUri.UserInfo).Split(':',2)[0]
                if ($oldUser -eq 'neondb_owner') { $migrationUrl = $oldDbUrl }
            } catch { }
        }
    }

    $migrationInput = Read-Host 'Optional: paste neondb_owner migration URL (hidden); press Enter to skip' -AsSecureString
    $typedMigrationUrl = Convert-SecureStringToPlainText $migrationInput
    try {
        if (-not [string]::IsNullOrWhiteSpace($typedMigrationUrl)) {
            $migrationUri = [Uri]$typedMigrationUrl
            $migrationUser = [Uri]::UnescapeDataString($migrationUri.UserInfo).Split(':',2)[0]
            if ($migrationUri.Scheme -notin @('postgres','postgresql') -or $migrationUser -ne 'neondb_owner') {
                throw 'Migration URL harus valid dan menggunakan role neondb_owner.'
            }
            $migrationUrl = $typedMigrationUrl
        }
    } finally {
        $typedMigrationUrl = $null
        $migrationInput.Dispose()
    }
    if ($migrationUrl) {
        $migrationEnvPath = Join-Path $ProjectRoot '.env.migrate'
        $migrationLines = if (Test-Path $migrationEnvPath) { @(Get-Content $migrationEnvPath | Where-Object { $_ -notmatch '^\s*MIGRATION_DATABASE_URL\s*=' }) } else { @() }
        $migrationLines += "MIGRATION_DATABASE_URL=$migrationUrl"
        Set-Content -Path $migrationEnvPath -Value $migrationLines -Encoding UTF8
        Write-Host 'Migration credential tersimpan terpisah di .env.migrate.'
    } else {
        Write-Host 'Migration credential tidak diubah. Status/apply migration memerlukan .env.migrate.'
    }

    $lines = $previousLines
    $lines = Set-EnvValue $lines 'DATABASE_URL' $runtimeUrl
    $lines = @($lines | Where-Object { $_ -notmatch '^\s*MIGRATION_DATABASE_URL\s*=' })
    $lines = Set-EnvValue $lines 'NODE_ENV' 'development'
    $lines = Set-EnvValue $lines 'NEON_AUTH_BASE_URL' $expectedAuthBase
    $lines = Set-EnvValue $lines 'NEON_AUTH_JWKS_URL' $expectedJwks
    $lines = Set-EnvValue $lines 'VITE_NEON_AUTH_URL' $expectedAuthBase
    $lines = Set-EnvValue $lines 'CORS_ALLOWED_ORIGINS' 'http://localhost:3001,http://127.0.0.1:3001'
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
} finally {
    $runtimeUrl = $null
    $secureInput.Dispose()
}

Write-Host "Backup source: $backupRoot"
Write-Host 'Patch Revision 028 tersalin. Credential tidak ditampilkan.'
Write-Host 'Jalankan pemeriksaan build dan test sekarang...'

Push-Location $ProjectRoot
try {
    node scripts/verify-migration-manifest.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Migration 001-027 manifest/checksum verification gagal.' }
} finally { Pop-Location }

if (-not $SkipBuildAndTests) {
    Push-Location $ProjectRoot
    try {
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Neon Auth SDK installation failed. Check npm registry connectivity; source backup is available.' }
        npm run test:revision028
        if ($LASTEXITCODE -ne 0) { throw 'Revision 028 unit tests gagal. Backup tersedia untuk rollback.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript build gagal. Periksa log; backup tersedia untuk rollback.' }
        npm run verify:runtime
        if ($LASTEXITCODE -ne 0) { throw 'Runtime DB security check gagal. Periksa DATABASE_URL dan privilege.' }
    } finally {
        Pop-Location
    }
}

Write-Host ''
Write-Host 'Revision 028 code/config installation selesai.'
Write-Host 'Catatan: bootstrap admin belum dijalankan. Neon Auth sign-up sedang OFF; tunggu email admin dan lakukan bootstrap terkontrol.'
Write-Host 'Migration credentials harus disimpan terpisah di .env.migrate sebagai MIGRATION_DATABASE_URL.'
