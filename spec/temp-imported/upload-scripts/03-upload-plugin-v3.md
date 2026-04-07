# Upload Plugin V3 — Parallel Multi-Plugin Uploader

> **Script:** `wp-plugins/scripts/upload-plugin-v3.ps1`  
> **Version:** 3.0.0  
> **Lines:** 320  
> **Status:** Active

---

## Purpose

Parallel deployment of multiple WordPress plugins using PowerShell `Start-Job`. Wraps `upload-plugin-v2.ps1` for concurrent execution with configurable concurrency and built-in status checking.

---

## Two Modes

### 1. Upload Mode (Default)

Upload one or more plugins in parallel:

```powershell
.\upload-plugin-v3.ps1 -p "C:\dev\plugin-a, C:\dev\plugin-b, C:\dev\plugin-c"
.\upload-plugin-v3.ps1 -p "C:\dev\plugin-a" -Activate
```

### 2. Status Mode (`-s`)

Query remote plugin status without uploading:

```powershell
.\upload-plugin-v3.ps1 -s                            # Default plugin status
.\upload-plugin-v3.ps1 -s -p "C:\dev\my-plugin"      # Specific plugin status
```

---

## Parameters

| Short | Long | Type | Default | Description |
|-------|------|------|---------|-------------|
| `-p` | `-PluginPaths` | String | — | Comma-separated list of plugin folder paths |
| `-s` | `-Status` | Switch | false | Check status instead of uploading |
| — | `-Activate` | Switch | false | Activate plugins after upload |
| — | `-SkipGitPull` | Switch | false | Skip git pull in V2 |
| `-c` | `-Concurrency` | Int | 4 | Maximum parallel upload jobs |
| `-h` | `-Help` | Switch | false | Show help |
| — | `-Quiet` | Switch | false | Suppress output |

---

## Parallel Execution

### Job Creation

Each plugin path spawns a `Start-Job` that invokes V2 with a JSON config:

```powershell
$configCopy = $wpConfig | ConvertTo-Json -Compress | ConvertFrom-Json
$configCopy.pluginFolderPath = $pluginPath
$jsonStr = $configCopy | ConvertTo-Json -Compress

$job = Start-Job -ScriptBlock {
    param($V2Path, $JsonConfig, $DoActivate, $DoSkipGit)
    & $V2Path -JsonConfig $JsonConfig [-Activate] [-SkipGitPull]
} -ArgumentList $V2Script, $jsonStr, $Activate, $SkipGitPull
```

### Concurrency Throttling

```powershell
while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $Concurrency) {
    Start-Sleep -Milliseconds 500
}
```

### Result Collection

After `Wait-Job`, each job is checked for success/failure:

```
  ── Results ──

  ✅ plugin-a — Upload complete (12.3s)
  ✅ plugin-b — Upload complete (14.1s)
  ❌ plugin-c — Upload reported errors (8.5s)

  ── Summary ──
  Total:     3 plugins
  Succeeded: 2
  Failed:    1
  Duration:  14.5s
```

---

## Configuration

V3 reads `wp-plugin-config.json` from the script directory for site credentials:

```json
{
  "wordPressSiteURL": "https://your-site.com",
  "username": "admin",
  "appPassword": "xxxx xxxx xxxx xxxx",
  "pluginFolderPath": "C:\\path\\to\\default\\plugin"
}
```

The `pluginFolderPath` is overridden per-job with the provided `-p` paths.

---

## Status Mode Details

Queries `GET /wp-json/riseup-asia-uploader/v1/status` and displays:

```
  📦 my-plugin — ACTIVE v1.2.3
  📦 other-plugin — NOT FOUND
```

Unwraps the envelope `Results` array to match plugin slugs.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All plugins uploaded successfully |
| 1 | One or more plugins failed, or missing config |

---

*V3 specification created: 2026-02-09*
