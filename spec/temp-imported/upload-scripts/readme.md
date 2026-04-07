# Upload Scripts Specification

> **Version:** 1.1.0  
> **Updated:** 2026-02-10  
> **Status:** Active  
> **Location:** `wp-plugins/scripts/`  
> **Purpose:** WordPress plugin deployment via PowerShell scripts using Riseup Asia Uploader API

---

## Overview

The upload scripts provide automated WordPress plugin deployment from local development to remote WordPress sites. They use the **Riseup Asia Uploader** REST API (`riseup-asia-uploader/v1`) as the primary upload channel, with fallback to the WordPress Core REST API (`wp/v2/plugins`).

All scripts use **Basic Authentication** (WordPress Application Passwords) and support the **Universal Response Envelope** for structured response parsing.

---

## Script Hierarchy

```
wp-plugins/scripts/
├── upload-plugin.ps1          ← V1: Basic standalone uploader
├── upload-plugin-v2.ps1       ← V2: Enhanced (Git Pull + Version Compare + OPcache Flush + Publish)
├── upload-plugin-v3.ps1       ← V3: Parallel multi-plugin wrapper around V2
├── upload-plugin-custom.ps1   ← Custom path wrapper around V2
└── wp-plugin-config.json      ← Shared credentials config (not in git)
```

### Dependency Chain

```
upload-plugin-v3.ps1 ───wraps──→ upload-plugin-v2.ps1 ───fallback──→ upload-plugin.ps1
upload-plugin-custom.ps1 ──wraps──→ upload-plugin-v2.ps1
run.ps1 (project runner) ──calls──→ upload-plugin-v2.ps1
```

### Server-Side Components

```
wp-content/plugins/riseup-asia-uploader/
├── opcache-reset.php          ← Standalone OPcache flush (called by V2 after self-updates)
└── riseup-asia-uploader.php   ← Upload handler with version detection + OPcache invalidation
```

---

## Documents

| File | Description |
|------|-------------|
| [readme.md](./readme.md) | This overview |
| [01-upload-plugin-v1.md](./01-upload-plugin-v1.md) | V1 script specification |
| [02-upload-plugin-v2.md](./02-upload-plugin-v2.md) | V2 script specification (v2.1.0) |
| [03-upload-plugin-v3.md](./03-upload-plugin-v3.md) | V3 script specification |
| [04-upload-plugin-custom.md](./04-upload-plugin-custom.md) | Custom path wrapper specification |
| [05-configuration.md](./05-configuration.md) | Shared configuration format |

---

## Common Features (All Scripts)

### Authentication

All scripts use HTTP Basic Authentication with WordPress Application Passwords:

```powershell
$CleanAppPassword = $AppPassword -replace '\s', ''
$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${CleanAppPassword}"))
```

**Important:** Application password spaces are stripped before encoding.

### Request Headers

All requests include:
- `Authorization: Basic <base64>`
- `Accept: application/json` (prevents HTML challenge responses)

### Envelope Unwrapping

All scripts detect and unwrap the Universal Response Envelope:

```powershell
$resultData = $response
if ($response.Results -and $response.Results.Count -gt 0) {
    $resultData = $response.Results[0]
}
```

### Error Handling

All scripts include:

- **HTML stripping** — `ConvertFrom-Html` removes tags and decodes entities from error responses
- **Server critical error detection** — Detects `critical error on this website` and `internal_server_error` patterns
- **Stack trace rendering** — Parses `stackTrace` strings and `stackTraceFrames` arrays from JSON error responses
- **Error response extraction** — `Get-ErrorResponseBody` works on both PowerShell 5.1 and 7+
- **Security block detection** — Imunify360 `Access denied` / `bot-protection` messages throw actionable errors

### Upload Source Attribution

V2 includes `upload_source: "upload_script"` and `machine_name` in the request body for audit log tracking.

---

## Quick Reference

| Script | Use Case | Command |
|--------|----------|---------|
| V1 | Single plugin, basic upload | `.\upload-plugin.ps1 -PluginPath "C:\path" -SiteUrl "https://site.com" -User "admin" -Password "pass"` |
| V2 | Single plugin, full pipeline | `.\upload-plugin-v2.ps1 -PluginPath "C:\path" -SiteUrl "https://site.com" -User "admin" -Password "pass"` |
| V3 | Multiple plugins, parallel | `.\upload-plugin-v3.ps1 -p "C:\path1, C:\path2"` |
| V3 Status | Check remote plugin status | `.\upload-plugin-v3.ps1 -s` |
| Custom | Arbitrary path via config | `.\upload-plugin-custom.ps1 -p "C:\path\to\plugin"` |

---

## API Endpoints Used

| Endpoint | Method | Script | Purpose |
|----------|--------|--------|---------|
| `/wp-json/` | GET | V1, V2 | REST API health check |
| `/wp-json/riseup-asia-uploader/v1/upload` | POST | V1, V2 | Primary upload (base64 JSON body) |
| `/wp-json/riseup-uploader/v1/upload` | POST | V1 | Legacy namespace fallback |
| `/wp-json/riseup-asia-uploader/v1/status` | GET | V2, V3 | Version check & status |
| `/wp-json/wp/v2/plugins` | POST | V1 | WordPress Core API fallback (multipart) |
| `/wp-content/plugins/.../opcache-reset.php` | GET | V2 | OPcache flush after self-update |

---

## Integration with `run.ps1`

The project runner (`run.ps1`) integrates upload scripts via the `-u` flag:

```powershell
.\run.ps1 -u                              # Upload default plugin via V2
.\run.ps1 -u -d                           # Upload with debug mode
.\run.ps1 -u -pp "C:\path\to\plugin"      # Upload custom plugin path via V2
```

The runner locates `upload-plugin-v2.ps1` at `wp-plugins/scripts/upload-plugin-v2.ps1` relative to the project root.

---

*Specification v1.1.0 — updated: 2026-02-10*
