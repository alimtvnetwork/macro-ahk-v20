# Upload Plugin Custom — Path Wrapper

> **Script:** `wp-plugins/scripts/upload-plugin-custom.ps1`  
> **Lines:** 88  
> **Status:** Active

---

## Purpose

Convenience wrapper that allows uploading any plugin by specifying its full folder path. Delegates to `upload-plugin-v2.ps1` for the actual upload, using either direct credentials or `wp-plugin-config.json`.

---

## Usage

```powershell
# Using config file for credentials
.\upload-plugin-custom.ps1 -p "C:\path\to\my-plugin"
.\upload-plugin-custom.ps1 -p "C:\path\to\my-plugin" -Activate

# Using direct credentials
.\upload-plugin-custom.ps1 -p "C:\path\to\my-plugin" -SiteUrl "https://example.com" -User "admin" -Password "xxxx"
```

---

## Parameters

| Short | Long | Type | Required | Description |
|-------|------|------|----------|-------------|
| `-p` | `-PluginPath` | String | **Yes** | Full path to plugin folder |
| — | `-Activate` | Switch | No | Activate after upload |
| — | `-SiteUrl` | String | No | WordPress site URL (overrides config) |
| — | `-User` | String | No | WordPress username (overrides config) |
| — | `-Password` | String | No | Application password (overrides config) |
| — | `-SkipGitPull` | Switch | No | Skip git pull |
| — | `-Quiet` | Switch | No | Suppress output |

---

## Credential Resolution

1. **Direct parameters** — If `-SiteUrl`, `-User`, and `-Password` are all provided, passes them directly to V2
2. **Config file** — Otherwise, reads `wp-plugin-config.json`, overrides `pluginFolderPath` with the `-p` value, and passes as JSON config to V2

---

## Exit Codes

Inherits exit code from `upload-plugin-v2.ps1`.

---

*Custom wrapper specification created: 2026-02-09*
