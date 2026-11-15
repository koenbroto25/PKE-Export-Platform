[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$BackupRoot,
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)
$manifestPath = Join-Path $BackupRoot 'manifest.json'
if (-not (Test-Path $manifestPath)) { throw "Manifest backup tidak ditemukan: $manifestPath" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
foreach ($entry in $manifest) {
    $destination = Join-Path $ProjectRoot $entry.Path
    if ($entry.ExistedBefore) {
        $backup = Join-Path $BackupRoot $entry.Path
        if (-not (Test-Path $backup)) { throw "File backup hilang: $backup" }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item $backup $destination -Force
        Write-Host "Restored $($entry.Path)"
    } elseif (Test-Path $destination) {
        Remove-Item $destination -Force
        Write-Host "Removed newly-created $($entry.Path)"
    }
}
Write-Host 'Source/config rollback completed. Dependencies may need npm install based on the restored package-lock.json.'
