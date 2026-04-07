# Chrome Extension — PowerShell Installer Specification

**Version**: v0.2 (Phase 4 Expansion)
**Date**: 2026-02-28
**Changes in v0.2**: Added `-ListProfiles`, interactive profile picker, `-Watch` mode, `-Direct` mode, end-to-end update workflow, Edge support

---

## Purpose

A PowerShell script (`Install-Extension.ps1`) that automates:
1. Git pull (get latest extension code)
2. Detect Chrome profiles and let user choose
3. Copy extension files to a Chrome profile (or point directly to repo)
4. Enable developer mode if needed
5. Register/reload the unpacked extension
6. Optionally watch for file changes and auto-reload

---

## Usage

```powershell
# Default: install to default Chrome profile
.\Install-Extension.ps1

# List all available Chrome profiles
.\Install-Extension.ps1 -ListProfiles

# Install to specific profile (by name or folder)
.\Install-Extension.ps1 -Profile "Profile 2"
.\Install-Extension.ps1 -Profile "Work"

# Interactive profile picker (when -Profile not specified and multiple profiles exist)
.\Install-Extension.ps1 -Interactive

# Direct mode: point Chrome to repo folder (no copy, changes apply on reload)
.\Install-Extension.ps1 -Direct

# Watch mode: auto-reload extension on file changes
.\Install-Extension.ps1 -Watch

# Combined: direct + watch (best for development)
.\Install-Extension.ps1 -Direct -Watch

# Install with incognito mode enabled
.\Install-Extension.ps1 -AllowIncognito

# Specify custom Chrome user data directory
.\Install-Extension.ps1 -ChromeUserDataDir "C:\Users\user\AppData\Local\Google\Chrome\User Data"

# Specify git repo path (if not running from repo root)
.\Install-Extension.ps1 -RepoPath "C:\Projects\marco-automator"

# Edge (Chromium) support
.\Install-Extension.ps1 -Browser Edge
```

---

## Script Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-RepoPath` | string | `.` (current directory) | Path to git repository root |
| `-ExtensionDir` | string | `chrome-extension` | Subfolder containing extension files |
| `-ChromeUserDataDir` | string | Auto-detected | Chrome User Data directory |
| `-Profile` | string | (auto or interactive) | Chrome profile folder name or display name |
| `-Browser` | string | `Chrome` | Browser target: `Chrome`, `ChromeBeta`, `ChromeDev`, `Edge` |
| `-ListProfiles` | switch | `$false` | List available profiles and exit |
| `-Interactive` | switch | `$false` | Show interactive profile picker |
| `-Direct` | switch | `$false` | Point Chrome to repo folder instead of copying files |
| `-Watch` | switch | `$false` | Monitor file changes and auto-reload extension |
| `-WatchDebounceMs` | int | `500` | Debounce interval for file change detection |
| `-AllowIncognito` | switch | `$false` | Enable extension in incognito mode |
| `-Force` | switch | `$false` | Skip confirmation prompts |
| `-NoPull` | switch | `$false` | Skip `git pull` step |

---

## Execution Flow

### Step 1: Git Pull

```powershell
# Pull latest code from remote
if (-not $NoPull) {
    Set-Location $RepoPath
    git pull origin main --ff-only
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Git pull failed — continuing with local files"
    }
}
```

### Step 2: Detect Chrome User Data Directory

```powershell
function Get-BrowserUserDataDir {
    param([string]$Browser = 'Chrome')

    $paths = switch ($Browser) {
        'Chrome'     { @("$env:LOCALAPPDATA\Google\Chrome\User Data") }
        'ChromeBeta' { @("$env:LOCALAPPDATA\Google\Chrome Beta\User Data") }
        'ChromeDev'  { @("$env:LOCALAPPDATA\Google\Chrome Dev\User Data") }
        'Edge'       { @("$env:LOCALAPPDATA\Microsoft\Edge\User Data") }
    }

    $found = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $found) {
        Write-Error "$Browser is not installed or User Data directory not found."
        Write-Error "Searched: $($paths -join ', ')"
        exit 1
    }
    return $found
}

$ChromeUserDataDir = if ($ChromeUserDataDir) { $ChromeUserDataDir } else { Get-BrowserUserDataDir -Browser $Browser }
```

### Step 3: Profile Detection & Selection (v0.2)

#### `-ListProfiles` — List All Available Profiles

```powershell
function Get-ChromeProfiles {
    param([string]$UserDataDir)

    $profiles = @()

    # Default profile
    $defaultPrefs = Join-Path $UserDataDir "Default" "Preferences"
    if (Test-Path $defaultPrefs) {
        $prefs = Get-Content $defaultPrefs -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        $profiles += [PSCustomObject]@{
            Folder      = "Default"
            DisplayName = $prefs.profile.name ?? "Default"
            Email       = $prefs.account_info[0].email ?? "(no email)"
            AvatarIndex = $prefs.profile.avatar_index ?? 0
            IsDefault   = $true
        }
    }

    # Numbered profiles (Profile 1, Profile 2, ...)
    Get-ChildItem -Path $UserDataDir -Directory -Filter "Profile *" | ForEach-Object {
        $prefsPath = Join-Path $_.FullName "Preferences"
        if (Test-Path $prefsPath) {
            $prefs = Get-Content $prefsPath -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
            $profiles += [PSCustomObject]@{
                Folder      = $_.Name
                DisplayName = $prefs.profile.name ?? $_.Name
                Email       = $prefs.account_info[0].email ?? "(no email)"
                AvatarIndex = $prefs.profile.avatar_index ?? 0
                IsDefault   = $false
            }
        }
    }

    return $profiles
}
```

**Output of `-ListProfiles`**:

```
[Install-Extension] Available Chrome profiles:
  #  Folder       Name           Email
  ── ──────────── ────────────── ─────────────────────────
  1  Default      Personal       user@gmail.com
  2  Profile 1    Work           user@company.com
  3  Profile 2    Dev Testing    (no email)
```

#### Interactive Profile Picker

When `-Profile` is not specified and either `-Interactive` is set or multiple profiles exist:

```powershell
function Select-ChromeProfile {
    param([PSCustomObject[]]$Profiles)

    if ($Profiles.Count -eq 0) {
        Write-Error "No Chrome profiles found."
        exit 1
    }

    if ($Profiles.Count -eq 1) {
        Write-Host "[Install-Extension] Single profile found: $($Profiles[0].DisplayName) ($($Profiles[0].Folder))"
        return $Profiles[0]
    }

    Write-Host ""
    Write-Host "[Install-Extension] Select a Chrome profile:" -ForegroundColor Cyan
    Write-Host ""
    for ($i = 0; $i -lt $Profiles.Count; $i++) {
        $p = $Profiles[$i]
        $marker = if ($p.IsDefault) { " (default)" } else { "" }
        Write-Host "  [$($i + 1)] $($p.DisplayName)$marker — $($p.Email)" -ForegroundColor White
    }
    Write-Host ""

    do {
        $choice = Read-Host "Enter number (1-$($Profiles.Count))"
        $index = [int]$choice - 1
    } while ($index -lt 0 -or $index -ge $Profiles.Count)

    $selected = $Profiles[$index]
    Write-Host "[Install-Extension] Selected: $($selected.DisplayName) ($($selected.Folder))" -ForegroundColor Green
    return $selected
}
```

#### Profile Resolution Logic

```powershell
# Resolve profile: explicit > interactive > auto-default
$allProfiles = Get-ChromeProfiles -UserDataDir $ChromeUserDataDir

if ($ListProfiles) {
    Format-ProfileTable $allProfiles
    exit 0
}

if ($Profile) {
    # Match by folder name OR display name (case-insensitive)
    $selectedProfile = $allProfiles | Where-Object {
        $_.Folder -eq $Profile -or $_.DisplayName -ieq $Profile
    } | Select-Object -First 1

    if (-not $selectedProfile) {
        Write-Error "Profile '$Profile' not found. Use -ListProfiles to see available profiles."
        exit 1
    }
} elseif ($Interactive -or $allProfiles.Count -gt 1) {
    $selectedProfile = Select-ChromeProfile -Profiles $allProfiles
} else {
    $selectedProfile = $allProfiles | Where-Object { $_.IsDefault } | Select-Object -First 1
}

$profileFolder = $selectedProfile.Folder
```

### Step 4: Copy Extension to Profile (or Direct Mode)

#### Copy Mode (default)

```powershell
if (-not $Direct) {
    # Target: Chrome profile's Extensions directory
    $targetDir = Join-Path $ChromeUserDataDir $profileFolder "Extensions" "marco-automator"

    # Clean previous version
    if (Test-Path $targetDir) {
        Remove-Item $targetDir -Recurse -Force
    }

    # Copy extension files
    $sourceDir = Join-Path $RepoPath $ExtensionDir
    Copy-Item -Path $sourceDir -Destination $targetDir -Recurse

    $fileCount = (Get-ChildItem $targetDir -Recurse -File).Count
    Write-Host "[Install-Extension] Copied $fileCount files to: $targetDir"
}
```

#### Direct Mode (v0.2)

In direct mode, Chrome's unpacked extension path points directly to the repo's extension folder. No files are copied — Chrome reads from the source directory.

```powershell
if ($Direct) {
    $targetDir = Join-Path (Resolve-Path $RepoPath) $ExtensionDir

    if (-not (Test-Path (Join-Path $targetDir "manifest.json"))) {
        Write-Error "No manifest.json found in $targetDir — is this a valid extension directory?"
        exit 1
    }

    Write-Host "[Install-Extension] Direct mode: Chrome will load from $targetDir"
    Write-Host "[Install-Extension] Changes to files in this folder apply on extension reload."
}
```

**Key difference**:

| Mode | Files | Update Behavior |
|------|-------|-----------------|
| Copy (default) | Copied to Chrome profile dir | Must re-run installer to update |
| Direct | Chrome points to repo folder | Changes apply on extension reload (Ctrl+Shift+R in chrome://extensions, or via watch mode) |

### Step 5: Enable Developer Mode

```powershell
$prefsPath = Join-Path $ChromeUserDataDir $profileFolder "Preferences"

# Backup preferences
Copy-Item $prefsPath "$prefsPath.bak" -Force

$prefs = Get-Content $prefsPath -Raw | ConvertFrom-Json

# Enable developer mode for extensions
if (-not $prefs.extensions) { $prefs | Add-Member -NotePropertyName "extensions" -NotePropertyValue @{} }
if (-not $prefs.extensions.ui) { $prefs.extensions | Add-Member -NotePropertyName "ui" -NotePropertyValue @{} }
$prefs.extensions.ui.developer_mode = $true

# Write back
$prefs | ConvertTo-Json -Depth 20 | Set-Content $prefsPath -Encoding UTF8
```

### Step 6: Register Unpacked Extension

```powershell
# Add to unpacked extensions list
Write-Host "[Install-Extension] ✅ Extension installed to: $targetDir"
Write-Host "[Install-Extension] ⚠  Restart Chrome or go to chrome://extensions and click 'Reload' on the extension"
```

### Step 7: Incognito Mode (Optional)

```powershell
if ($AllowIncognito) {
    Write-Host "[Install-Extension] ℹ  To enable incognito: chrome://extensions → Marco Automator → Details → Allow in incognito"
}
```

---

## Watch Mode (v0.2)

### Purpose

Monitor extension source files for changes and automatically trigger a reload. This eliminates the manual "go to chrome://extensions and click Reload" step during development.

### How It Works

```
.\Install-Extension.ps1 -Direct -Watch
    │
    ▼
Extension installed/pointed in direct mode
    │
    ▼
FileSystemWatcher monitors $ExtensionDir for changes
    │
    ├── .js file changed → trigger reload
    ├── .json file changed → trigger reload
    ├── .html file changed → trigger reload
    ├── .css file changed → trigger reload
    └── Other files → ignore
    │
    ▼
Reload trigger:
    │
    ├── Method 1 (preferred): Native messaging → background script
    │   Extension has a reload endpoint that receives a message
    │   and calls chrome.runtime.reload()
    │
    ├── Method 2 (fallback): chrome://extensions tab manipulation
    │   Use Chrome DevTools Protocol (CDP) to reload
    │
    └── Method 3 (simple): Touch a reload-signal file
        Extension polls for this file's modification timestamp
        and reloads when it changes
    │
    ▼
Console output: "[Watch] Detected change in combo.js — reloading extension..."
```

### Implementation

```powershell
function Start-ExtensionWatch {
    param(
        [string]$WatchDir,
        [int]$DebounceMs = 500,
        [string]$ReloadMethod = 'signal-file'
    )

    Write-Host ""
    Write-Host "[Watch] 👁 Monitoring: $WatchDir" -ForegroundColor Cyan
    Write-Host "[Watch] Debounce: ${DebounceMs}ms"
    Write-Host "[Watch] Reload method: $ReloadMethod"
    Write-Host "[Watch] Press Ctrl+C to stop"
    Write-Host ""

    $filter = '*.js', '*.json', '*.html', '*.css', '*.mjs'
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $WatchDir
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents = $true
    $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor
                            [System.IO.NotifyFilters]::FileName -bor
                            [System.IO.NotifyFilters]::DirectoryName

    $lastReload = [datetime]::MinValue
    $changeCount = 0

    $action = {
        $now = [datetime]::Now
        $elapsed = ($now - $script:lastReload).TotalMilliseconds
        if ($elapsed -lt $script:DebounceMs) { return }

        $changeType = $Event.SourceEventArgs.ChangeType
        $fullPath = $Event.SourceEventArgs.FullPath
        $fileName = Split-Path $fullPath -Leaf

        # Filter to watched extensions
        $ext = [System.IO.Path]::GetExtension($fileName)
        if ($ext -notin '.js', '.json', '.html', '.css', '.mjs') { return }

        # Ignore node_modules, .git, etc.
        if ($fullPath -match '(node_modules|\.git|\.DS_Store)') { return }

        $script:lastReload = $now
        $script:changeCount++

        $timestamp = $now.ToString('HH:mm:ss')
        Write-Host "[$timestamp] 🔄 $changeType`: $fileName (#$($script:changeCount))" -ForegroundColor Yellow

        # Trigger reload
        switch ($script:ReloadMethod) {
            'signal-file' {
                $signalPath = Join-Path $script:WatchDir '.reload-signal'
                [datetime]::Now.ToString('o') | Set-Content $signalPath -Encoding UTF8
                Write-Host "[$timestamp] ✅ Reload signal written" -ForegroundColor Green
            }
            'cdp' {
                Invoke-CdpReload
                Write-Host "[$timestamp] ✅ Extension reloaded via CDP" -ForegroundColor Green
            }
        }
    }

    Register-ObjectEvent $watcher 'Changed' -Action $action | Out-Null
    Register-ObjectEvent $watcher 'Created' -Action $action | Out-Null
    Register-ObjectEvent $watcher 'Deleted' -Action $action | Out-Null
    Register-ObjectEvent $watcher 'Renamed' -Action $action | Out-Null

    # Block until Ctrl+C
    try {
        while ($true) { Start-Sleep -Seconds 1 }
    } finally {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
        Write-Host ""
        Write-Host "[Watch] Stopped. $changeCount reloads triggered." -ForegroundColor Cyan
    }
}
```

### Reload Methods

#### Method 1: Signal File (Default, Simple)

The extension background script polls for a `.reload-signal` file:

```javascript
// background.js — reload watcher (only in dev mode)
if (chrome.runtime.getManifest().update_url === undefined) {
  // Unpacked extension (dev mode) — poll for reload signal
  let lastSignal = '';
  setInterval(async () => {
    try {
      const response = await fetch(chrome.runtime.getURL('.reload-signal'));
      const text = await response.text();
      if (text !== lastSignal && lastSignal !== '') {
        console.log('[Marco] Reload signal detected — reloading extension');
        chrome.runtime.reload();
      }
      lastSignal = text;
    } catch (e) {
      // File doesn't exist yet — normal on first run
    }
  }, 1000);
}
```

- **Pros**: No additional setup. Works with any Chrome version.
- **Cons**: 1-second polling delay. Extra file in extension dir.
- The `.reload-signal` file is gitignored.

#### Method 2: Chrome DevTools Protocol (Advanced)

Uses CDP to find and reload the extension programmatically:

```powershell
function Invoke-CdpReload {
    # Chrome must be launched with --remote-debugging-port=9222
    try {
        $targets = Invoke-RestMethod -Uri "http://localhost:9222/json" -TimeoutSec 2
        $extPage = $targets | Where-Object { $_.url -match "chrome-extension://" -and $_.title -match "Marco" }

        if ($extPage) {
            # Send Runtime.evaluate to call chrome.runtime.reload()
            $wsUrl = $extPage.webSocketDebuggerUrl
            # WebSocket call to execute chrome.runtime.reload()
            # (Implementation uses System.Net.WebSockets.ClientWebSocket)
            Write-Host "[Watch] Reloaded via CDP: $($extPage.title)"
        }
    } catch {
        Write-Warning "[Watch] CDP reload failed — is Chrome running with --remote-debugging-port=9222?"
    }
}
```

- **Pros**: Instant reload. No polling.
- **Cons**: Requires Chrome launched with `--remote-debugging-port=9222`. Security implications.

#### Method Comparison

| Method | Latency | Setup | Security |
|--------|---------|-------|----------|
| Signal File | ~1s (polling) | None | Safe — no network ports |
| CDP | Instant | Chrome must use `--remote-debugging-port` | Opens a debug port |

**Default**: Signal file. CDP is opt-in via `-WatchReloadMethod cdp`.

### Watch Mode Output

```
[Install-Extension] ✅ Extension installed (direct mode)
[Watch] 👁 Monitoring: C:\Projects\marco-automator\chrome-extension
[Watch] Debounce: 500ms
[Watch] Reload method: signal-file
[Watch] Press Ctrl+C to stop

[14:30:05] 🔄 Changed: combo.js (#1)
[14:30:05] ✅ Reload signal written
[14:30:22] 🔄 Changed: config.json (#2)
[14:30:22] ✅ Reload signal written
[14:31:01] 🔄 Created: new-helper.js (#3)
[14:31:01] ✅ Reload signal written

^C
[Watch] Stopped. 3 reloads triggered.
```

---

## End-to-End Update Workflow (v0.2)

### Scenario 1: Developer Workflow (Active Development)

```
Developer makes code changes
    │
    ▼
Option A: Direct + Watch (recommended)
    .\Install-Extension.ps1 -Direct -Watch
    │
    ├── Extension loads from repo folder
    ├── File watcher detects changes
    ├── Reload signal triggers chrome.runtime.reload()
    └── Extension updates in < 2 seconds
    │
    ▼
No manual action needed — changes are live

Option B: Manual reload
    .\Install-Extension.ps1 -Direct
    │
    ├── Make changes to code
    ├── Go to chrome://extensions
    └── Click 🔄 reload button on Marco Automator
```

### Scenario 2: User Update (Pulling Latest Version)

```
User wants latest version
    │
    ▼
.\Install-Extension.ps1
    │
    ├── Step 1: git pull origin main --ff-only
    │   └── Downloads latest code
    ├── Step 2: Auto-detect or select profile
    ├── Step 3: Copy files to Chrome profile dir
    ├── Step 4: Ensure developer mode enabled
    └── Step 5: Display reload instructions
    │
    ▼
User restarts Chrome or clicks Reload
    │
    ▼
Extension runs with latest code
```

### Scenario 3: First-Time Setup

```
User clones repo
    │
    ▼
cd marco-automator
.\Install-Extension.ps1 -Interactive
    │
    ├── Git pull (already latest from clone)
    ├── Detect Chrome profiles
    │   ┌─────────────────────────────────────┐
    │   │ Select a Chrome profile:            │
    │   │                                     │
    │   │ [1] Personal (default) — me@gm.com  │
    │   │ [2] Work — me@company.com           │
    │   │ [3] Dev Testing — (no email)        │
    │   └─────────────────────────────────────┘
    ├── User selects [3]
    ├── Copy files to "Profile 2" extensions dir
    ├── Enable developer mode
    └── ✅ Installed
    │
    ▼
User opens Chrome with Dev Testing profile
    │
    ▼
Goes to chrome://extensions → Marco Automator visible
    │
    ▼
Extension active on matching URLs
```

### How "Connected Extension Receives Latest Changes" Works

| Approach | Mechanism | When Changes Apply |
|----------|-----------|-------------------|
| **Copy mode** | Files copied to Chrome profile dir | On next `Install-Extension.ps1` run + Chrome reload |
| **Direct mode** | Chrome reads from repo folder | On Chrome extension reload (manual or via watch) |
| **Direct + Watch** | Repo folder + FileSystemWatcher | Automatically within ~1-2s of file save |

**Confirmed**: In "load unpacked" developer mode, Chrome reads extension files directly from the specified folder path. If `-Direct` mode points to the repo folder, any file change is immediately available — Chrome just needs to reload the extension (not restart the browser). The `-Watch` flag automates this reload step.

---

## Output

### Standard Install

```
[Install-Extension] Git pull: OK (already up to date)
[Install-Extension] Browser: Chrome
[Install-Extension] User Data: C:\Users\user\AppData\Local\Google\Chrome\User Data
[Install-Extension] Profile: Dev Testing (Profile 2)
[Install-Extension] Mode: Copy
[Install-Extension] Copying extension files... 18 files copied
[Install-Extension] Developer mode: enabled
[Install-Extension] ✅ Extension installed successfully
[Install-Extension] ⚠  Action needed: Restart Chrome or reload extension at chrome://extensions
```

### Direct + Watch Install

```
[Install-Extension] Git pull: OK (3 files updated)
[Install-Extension] Browser: Chrome
[Install-Extension] User Data: C:\Users\user\AppData\Local\Google\Chrome\User Data
[Install-Extension] Profile: Dev Testing (Profile 2)
[Install-Extension] Mode: Direct (loading from repo)
[Install-Extension] Source: C:\Projects\marco-automator\chrome-extension
[Install-Extension] Developer mode: enabled
[Install-Extension] ✅ Extension loaded from source directory
[Install-Extension] Starting watch mode...

[Watch] 👁 Monitoring: C:\Projects\marco-automator\chrome-extension
[Watch] Debounce: 500ms
[Watch] Reload method: signal-file
[Watch] Press Ctrl+C to stop
```

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Git not found | Skip pull, warn user |
| Chrome/Edge not installed | Exit with error message listing searched paths |
| Chrome running (copy mode) | Warn that changes require restart. Suggest `-Direct` mode. |
| Profile not found | List available profiles via `Get-ChromeProfiles`, ask user to choose |
| Profile name ambiguous | If display name matches multiple folders, show disambiguation prompt |
| Permission denied | Run as administrator or check file locks |
| No manifest.json in ext dir | Error: "Not a valid extension directory" |
| Watch: file locked | Debounce and retry on next change |
| Watch: CDP port unavailable | Fall back to signal-file method |

---

## Safety

1. **Never modifies Chrome binaries** — only copies files and edits `Preferences` JSON
2. **Backs up Preferences** before modifying: creates `Preferences.bak`
3. **Non-destructive** — extension files are copied to a dedicated subfolder (or read in-place for direct mode)
4. **Idempotent** — safe to run multiple times; always replaces previous version
5. **Signal file is gitignored** — `.reload-signal` never committed to repo
6. **Profile picker is read-only** — only reads `Preferences` JSON, never modifies profile data during listing

---

## .gitignore Additions

```
# Watch mode signal file
chrome-extension/.reload-signal
```

---

## Edge (Chromium) Support (v0.2)

The script supports Microsoft Edge via the `-Browser Edge` parameter. Edge uses the same Chromium extension system:

| Property | Chrome | Edge |
|----------|--------|------|
| User Data Dir | `%LOCALAPPDATA%\Google\Chrome\User Data` | `%LOCALAPPDATA%\Microsoft\Edge\User Data` |
| Profile structure | Identical | Identical |
| Developer mode | `Preferences` → `extensions.ui.developer_mode` | Same |
| Load unpacked | Same mechanism | Same mechanism |

No code changes needed in the extension itself — only the installer path changes.

---

## Acceptance Criteria (Phase 4)

- [x] `-ListProfiles` lists all Chrome profiles with folder, display name, email
- [x] Interactive profile picker prompts when multiple profiles exist
- [x] Profile resolution works by folder name OR display name (case-insensitive)
- [x] `-Direct` mode points Chrome to repo folder (no copy)
- [x] `-Watch` mode monitors file changes with debounce
- [x] Two reload methods documented: signal file (default) and CDP (advanced)
- [x] End-to-end update workflow documented for 3 scenarios (dev, user update, first-time)
- [x] "Connected extension receives latest changes" confirmed and documented
- [x] Edge support via `-Browser Edge` parameter
- [x] Error handling covers profile-not-found, ambiguous names, missing manifest
