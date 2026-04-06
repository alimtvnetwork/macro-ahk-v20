# PowerShell Script Reference

> **Spec Version:** 2.2.0  
> **Script Version:** run.ps1 1.2.0, upload-plugin-v2.ps1 2.1.0  
> **Updated:** 2026-02-10  
> **Status:** Active

---

## Command-Line Flags

| Short | Long | Type | Description |
|-------|------|------|-------------|
| `-h` | `-help` | Switch | Show help message and exit |
| `-b` | `-buildonly` | Switch | Build frontend only, don't start backend |
| `-s` | `-skipbuild` | Switch | Skip frontend build, only run backend |
| `-p` | `-skippull` | Switch | Skip git pull step |
| `-f` | `-force` | Switch | Force-clean build artifacts and pnpm folders before building; a fresh install will run if needed |
| `-i` | `-install` | Switch | Install/update dependencies for frontend (pnpm) and backend (go mod), then exit |
| `-r` | `-rebuild` | Switch | Full reset: clean build artifacts, sessions, logs, and error data first, then install, then build/run (frontend install happens after the clean) |
| `-fw` | `-openfirewall` | Switch | Add Windows Firewall rules (requires Admin) |
| `-u` | `-upload` | Switch | Upload default plugin to WordPress via upload-plugin-v2 |
| `-pp` | `-pluginpath` | String | Override plugin folder path (use with `-u`) |
| `-v` | `-verbose` | Switch | Show detailed debug output |

---

## Usage Examples

```powershell
# Show help
.\run.ps1 -h

# Install/update all dependencies (frontend + backend)
.\run.ps1 -i

# Complete clean reinstall (recommended after git pull with new deps)
.\run.ps1 -r

# Full build and run (default)
.\run.ps1

# Clean rebuild everything
.\run.ps1 -f

# Quick start (skip build)
.\run.ps1 -s

# Build only for CI/CD
.\run.ps1 -b

# Skip git, clean build
.\run.ps1 -p -f

# First-time setup with firewall
.\run.ps1 -fw

# Upload default plugin to WordPress
.\run.ps1 -u

# Upload custom plugin path
.\run.ps1 -u -pp "C:\path\to\custom-plugin"

# Verbose output for debugging
.\run.ps1 -v
```

---

## Functions Reference

### Format-ElapsedTime

Formats a Stopwatch elapsed time for display.

```powershell
function Format-ElapsedTime($Stopwatch) {
    $elapsed = $Stopwatch.Elapsed
    if ($elapsed.TotalMinutes -ge 1) {
        return "{0:N0}m {1:N1}s" -f [Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds
    } else {
        return "{0:N1}s" -f $elapsed.TotalSeconds
    }
}
```

**Output Examples:**
- `2.3s` - Short duration
- `1m 45.2s` - Longer duration

---

### Test-Command

Checks if a command exists in PATH.

```powershell
function Test-Command($Command) {
    try { 
        if (Get-Command $Command) { return $true } 
    }
    catch { return $false }
}
```

**Usage:**
```powershell
if (-not (Test-Command "pnpm")) {
    Install-Pnpm
}
```

---

### Test-IsAdmin

Checks if running with Administrator privileges.

```powershell
function Test-IsAdmin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
```

---

### Install-Pnpm

Installs pnpm globally via npm.

```powershell
function Install-Pnpm {
    Write-Host "  Installing pnpm globally..." -ForegroundColor Yellow
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) { throw "Failed to install pnpm" }
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + 
                [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "  ✓ pnpm installed successfully" -ForegroundColor Green
}
```

---

### Install-NodeJS

Installs Node.js LTS via winget.

```powershell
function Install-NodeJS {
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + 
                [System.Environment]::GetEnvironmentVariable("Path","User")
}
```

---

### Install-Go

Installs Go via winget.

```powershell
function Install-Go {
    winget install GoLang.Go --accept-package-agreements --accept-source-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + 
                [System.Environment]::GetEnvironmentVariable("Path","User")
}
```

---

### Ensure-FirewallRules

Creates Windows Firewall inbound rules.

```powershell
function Ensure-FirewallRules {
    param([int[]]$Ports = @(8080))
    
    foreach ($p in $Ports) {
        $ruleName = "$ProjectName (Go Backend) TCP $p"
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        if ($null -eq $existing) {
            New-NetFirewallRule `
                -DisplayName $ruleName `
                -Direction Inbound `
                -Action Allow `
                -Protocol TCP `
                -LocalPort $p `
                -Profile Private,Domain
        }
    }
}
```

**Requirements:**
- Must run as Administrator
- Windows PowerShell 5.1+ or PowerShell 7+

---

## Pipeline Steps Detail

### Step 1: Git Pull

```powershell
if (-not $SkipPull) {
    Push-Location $RootDir
    if (Test-Path ".git") {
        git pull
    }
    Pop-Location
}
```

**Behavior:**
- Skipped if `-SkipPull` flag
- Warns but continues if git pull fails
- Skips if not a git repository

---

### Step 2: Prerequisites Check

```powershell
# Check Go
if ($config.prerequisites.go -and -not (Test-Command "go")) {
    Install-Go
}

# Check Node.js
if ($config.prerequisites.node -and -not (Test-Command "node")) {
    Install-NodeJS
}

# Check pnpm
if ($config.prerequisites.pnpm -and -not (Test-Command "pnpm")) {
    Install-Pnpm
}
```

**Auto-Install:**
- Uses winget for Go and Node.js
- Uses npm for pnpm
- Refreshes PATH after install
- Warns if restart needed

---

### Step 3: pnpm Install (PnP Mode)

```powershell
Push-Location $FrontendDir

# Configure pnpm store path
if ($config.pnpmStorePath) {
    $storePath = Join-Path $RootDir $config.pnpmStorePath
    pnpm config set store-dir $storePath
}

# Force clean (removes ALL pnpm artifacts including PnP loaders)
if ($Force) {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".pnpm" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".pnp.cjs" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".pnp.loader.mjs" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force ".pnp.data.json" -ErrorAction SilentlyContinue
    pnpm store prune

    # Backend runtime data cleanup (sessions, request-sessions, error logs)
    if ($DataDir) {
        Remove-Item -Recurse -Force "$DataDir/sessions" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "$DataDir/request-sessions" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "$DataDir/errors" -ErrorAction SilentlyContinue
        Remove-Item -Force "$DataDir/log.txt" -ErrorAction SilentlyContinue
        Remove-Item -Force "$DataDir/error.log.txt" -ErrorAction SilentlyContinue
    }
}

# Install dependencies
# NOTE: pnpm v10+ blocks dependency build scripts by default.
# The runner auto-appends:
#   --dangerously-allow-all-builds
# when pnpm v10+ is detected, to ensure native deps like esbuild/@swc work for Vite.
#
# IMPORTANT: -rebuild (-r) defers install until AFTER force-clean to avoid
# installing then immediately deleting node_modules.
pnpm install

Pop-Location
```

**PnP Benefits:**
- No `node_modules` folder needed (or minimal)
- Faster installs from shared store
- Disk savings of 50-70%

**Install Detection (v1.1.0+):**
- Respects `EffectiveNodeLinker` setting (PnP checks `.pnp.cjs`, isolated checks `node_modules`)
- `-i` and `-r` flags always trigger install, even if deps appear present

---

### Step 4: Frontend Build

```powershell
Push-Location $FrontendDir

# Build the frontend
# NOTE: When pnpm PnP is enabled, Node ESM tools like Vite may require PnP loader options.
# The runner handles this automatically when `node-linker=pnp` is active.
pnpm run build

---

## Important Notes (Windows / Node 24)

If `usePnp` is enabled in `powershell.json`, the runner will **fall back to `node-linker=isolated`** when:

- Node.js major version is **24+**, or
- The pnpm store is on a **different drive** than the project

This avoids `ERR_MODULE_NOT_FOUND` failures (e.g., Vite failing to resolve `esbuild`).

Pop-Location
```

---

### Step 5: Copy Build

```powershell
$SourceDist = Join-Path $RootDir $DistDir
$TargetDist = Join-Path $RootDir $TargetDir

# Remove old
if (Test-Path $TargetDist) {
    Remove-Item -Recurse -Force $TargetDist
}

# Copy new
Copy-Item -Recurse $SourceDist $TargetDist
```

---

### Step 6: Start Backend

```powershell
Push-Location $BackendDir

# Create config if missing
if (-not (Test-Path $config.configFile)) {
    Copy-Item $config.configExampleFile $config.configFile
}

# Create data directories
New-Item -ItemType Directory -Path "data" -ErrorAction SilentlyContinue

# Run
Invoke-Expression $config.runCommand

Pop-Location
```

---

## Timing Output

The script tracks time for each step:

```
========================================
  WP Plugin Publish - Build & Run Script
========================================

[1/5] Pulling latest changes from git...
  ✓ Git pull complete
  ⏱ 1.2s

[2/5] Checking prerequisites...
  ✓ Go found: go version go1.21.0 windows/amd64
  ✓ Node.js found: v20.10.0
  ✓ pnpm found: 8.12.0
  ⏱ 0.3s

[3/5] Installing dependencies (pnpm PnP)...
  Store path: .pnpm-store
  ✓ Dependencies installed
  ⏱ 5.2s

[4/5] Building React frontend...
  Running pnpm build...
  ✓ Frontend built successfully
  ⏱ 12.5s

[5/5] Starting Go backend...
========================================
  WP Plugin Publish starting...
  Open: http://localhost:8080
  Press Ctrl+C to stop
  Build time: 19.2s
========================================
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Prerequisites installation failed |
| 2 | pnpm install failed |
| 3 | pnpm build failed |
| 4 | Go run failed |
| 5 | Config file not found |
| 6 | Config validation failed |

---

## pnpm Store Commands

Useful commands for managing the pnpm store:

```powershell
# View store path
pnpm store path

# Check store status
pnpm store status

# Prune unused packages (run periodically)
pnpm store prune

# Add package
pnpm add <package>

# Remove package
pnpm remove <package>
```

---

## Cross-References

- [Overview](./00-overview.md) - Architecture and quick start
- [Configuration Schema](./01-configuration-schema.md) - JSON config format
- [Error Codes](./04-error-codes.md) - Detailed error handling
- [Upload Scripts](../upload-scripts/readme.md) - WordPress plugin deployment scripts
