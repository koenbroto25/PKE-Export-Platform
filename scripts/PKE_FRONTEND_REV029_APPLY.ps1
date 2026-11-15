[CmdletBinding()]
param(
    [string]$ProjectRoot = 'D:\PKE'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$SourceRoot = Split-Path -Parent $PSScriptRoot
$SourceFrontend = Join-Path $SourceRoot 'frontend'
$TargetFrontend = Join-Path $ProjectRoot 'frontend'
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$BackupRoot = Join-Path (Join-Path $ProjectRoot 'backups') "FRONTEND_REV029_$Timestamp"

if (!(Test-Path (Join-Path $ProjectRoot 'package.json'))) { throw "package.json tidak ditemukan di ProjectRoot: $ProjectRoot" }
if (!(Test-Path (Join-Path $ProjectRoot 'src\index.ts'))) { throw "src\index.ts tidak ditemukan. Pilih root repository PKE yang benar." }
if (!(Test-Path (Join-Path $SourceFrontend 'package.json'))) { throw "Paket frontend Revision 029 tidak lengkap: $SourceFrontend" }

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
if (Test-Path $TargetFrontend) {
    Write-Host "Membuat backup frontend lama: $BackupRoot" -ForegroundColor Yellow
    Move-Item -Path $TargetFrontend -Destination (Join-Path $BackupRoot 'frontend')
}

try {
    Copy-Item -Path $SourceFrontend -Destination $TargetFrontend -Recurse -Force
    $EnvLocal = Join-Path $TargetFrontend '.env.local'
    if (!(Test-Path $EnvLocal)) {
        Copy-Item (Join-Path $TargetFrontend '.env.example') $EnvLocal
    }
    Write-Host ''
    Write-Host 'Frontend Revision 029 disalin.' -ForegroundColor Green
    Write-Host "Frontend: $TargetFrontend"
    Write-Host "Backup:   $BackupRoot"
    Write-Host ''
    Write-Host 'Langkah berikutnya (Revision 4 — single project/branch, fail-closed):' -ForegroundColor Cyan
    Write-Host '1. Set frontend\.env.local VITE_NEON_AUTH_URL ke Neon Auth URL milik proyek mandat:'
    Write-Host '   project purple-base-63944903, branch production br-damp-shape-b3xlh4nr (dari konfigurasi Neon Auth owner; JANGAN pakai endpoint proyek lama lucky-glitter-99553107).'
    Write-Host '2. Pastikan backend .env DATABASE_URL menunjuk single target mandat (app_runtime_secure, TLS) — tanpa fallback/branch lain.'
    Write-Host '3. Buka terminal pertama pada D:\PKE, jalankan: npm run dev'
    Write-Host '4. Buka terminal kedua pada D:\PKE, jalankan: npm run frontend:dev'
    Write-Host '5. Akses http://localhost:3001'
    Write-Host ''
    Write-Host 'Catatan: jangan membuat branch Neon tambahan; test/integration hanya pada satu branch production dengan tx/rollback+QA namespace+cleanup terverifikasi.' -ForegroundColor Yellow
}
catch {
    if (Test-Path $TargetFrontend) { Remove-Item -Path $TargetFrontend -Recurse -Force }
    $OldFrontend = Join-Path $BackupRoot 'frontend'
    if (Test-Path $OldFrontend) { Move-Item -Path $OldFrontend -Destination $TargetFrontend }
    throw
}
