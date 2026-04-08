# ──────────────────────────────────────────────────────────────
# Marco Extension — Download & Install Helper (PowerShell)
#
# Usage:
#   irm https://github.com/<OWNER>/<REPO>/releases/latest/download/install-extension.ps1 | iex
#   — or —
#   .\install-extension.ps1 [-Version v2.112.0] [-InstallDir "D:\marco-extension\v2.112.0"]
#
# Default install directory:
#   $HOME\marco-extension\<version>\
#
# What it does:
#   1. Detects the latest release (or uses -Version)
#   2. Downloads the marco-extension-<version>.zip
#   3. Extracts to <InstallDir>\<version>\ (versioned subdirectory)
#   4. Writes a VERSION marker file
#   5. Prints instructions to load as unpacked extension
# ──────────────────────────────────────────────────────────────

param(
    [string]$Version = "",
    [string]$InstallDir = "",
    [string]$Repo = "riseup-asia/macro-ahk"
)

$ErrorActionPreference = "Stop"

# ── Resolve version ──
if (-not $Version) {
    Write-Host "[INFO] Detecting latest release..." -ForegroundColor Cyan
    try {
        $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
        $Version = $release.tag_name
    } catch {
        Write-Host "[FAIL] Could not detect latest version. Use -Version to specify." -ForegroundColor Red
        exit 1
    }
}

# ── Resolve install directory (default: $HOME\marco-extension\<version>) ──
if (-not $InstallDir) {
    $InstallDir = Join-Path $HOME "marco-extension\$Version"
}

Write-Host ""
Write-Host "[OK] Marco Extension $Version" -ForegroundColor Green
Write-Host "     Repository : $Repo"
Write-Host "     Install to : $InstallDir"
Write-Host ""

# ── Download ──
$zipName = "marco-extension-$Version.zip"
$downloadUrl = "https://github.com/$Repo/releases/download/$Version/$zipName"
$tmpZip = Join-Path $env:TEMP "marco-extension-$(Get-Random).zip"

Write-Host "[INFO] Downloading $zipName..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpZip -UseBasicParsing
} catch {
    Write-Host "[FAIL] Download failed. Check version and repo." -ForegroundColor Red
    Write-Host "       URL: $downloadUrl"
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    exit 1
}

# ── Extract ──
Write-Host "[INFO] Extracting to $InstallDir..." -ForegroundColor Cyan
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Expand-Archive -Path $tmpZip -DestinationPath $InstallDir -Force
Remove-Item $tmpZip -Force

# ── Write version marker ──
$Version | Set-Content (Join-Path $InstallDir "VERSION")

# ── Done ──
Write-Host ""
Write-Host "[OK] Marco Extension $Version installed to:" -ForegroundColor Green
Write-Host "     $InstallDir"
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  To load in Chrome / Edge / Brave:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open chrome://extensions (or edge://extensions)"
Write-Host "  2. Enable 'Developer mode' (toggle in top-right)"
Write-Host "  3. Click 'Load unpacked'"
Write-Host "  4. Select: $InstallDir"
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To update later, re-run this script -- it replaces the folder."
Write-Host ""
Write-Host "  Example with custom directory:" -ForegroundColor DarkGray
Write-Host "    .\install-extension.ps1 -InstallDir `"D:\marco-extension\$Version`"" -ForegroundColor DarkGray
