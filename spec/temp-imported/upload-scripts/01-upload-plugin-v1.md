# Upload Plugin V1 — Standalone Uploader

> **Script:** `wp-plugins/scripts/upload-plugin.ps1`  
> **Lines:** 617  
> **Status:** Active (used as V2 fallback)

---

## Purpose

The original standalone WordPress plugin uploader. Handles ZIP creation, REST API health checks, and plugin upload with automatic namespace detection. Serves as the **fallback** for V2 when the enhanced pipeline's API call fails.

---

## Pipeline (5 Steps)

| Step | Description |
|------|-------------|
| 1/5 | **Verify plugin folder** — Validate path exists, derive slug from folder name |
| 2/5 | **Create ZIP** — Package plugin into temp ZIP with proper directory structure |
| 3/5 | **Pre-upload health check** — GET `/wp-json/` to verify REST API and namespace availability |
| 4/5 | **Upload plugin** — Try Riseup Asia Uploader, then legacy namespace, then WP Core API |
| 5/5 | **Activate** — If using WP Core API fallback, activate via PUT to `/wp/v2/plugins/{slug}` |

---

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `-ConfigPath` | String | No | Path to JSON config file |
| `-PluginPath` | String | No* | Plugin folder path |
| `-SiteUrl` | String | No* | WordPress site URL |
| `-User` | String | No* | WordPress username |
| `-Password` | String | No* | Application password |
| `-Slug` | String | No | Override plugin slug (default: folder name) |
| `-Activate` | Switch | No | Activate after upload |
| `-DeleteZip` | Switch | No | Delete temp ZIP after upload |
| `-Quiet` | Switch | No | Suppress output (return JSON) |
| `-JsonConfig` | String | No | Inline JSON config string |

*Required if no config file is provided.

---

## Config Priority

1. **`-JsonConfig`** — Inline JSON string (highest priority)
2. **Command-line parameters** — Direct `-PluginPath`, `-SiteUrl`, `-User`, `-Password`
3. **Config file** — `wp-plugin-config.json` (or custom path via `-ConfigPath`)

---

## Upload Strategy

### Attempt 1: Riseup Asia Uploader (JSON body, base64 ZIP)

```
POST /wp-json/riseup-asia-uploader/v1/upload
Content-Type: application/json
Authorization: Basic <base64>

{
  "plugin_zip": "<base64-encoded-zip>",
  "slug": "my-plugin",
  "activate": true
}
```

Tries both `riseup-asia-uploader/v1` and `riseup-uploader/v1` namespaces.

### Attempt 2: WordPress Core API (multipart, raw ZIP)

```
POST /wp-json/wp/v2/plugins
Content-Type: multipart/form-data
Authorization: Basic <base64>

[binary ZIP file]
```

Followed by activation if requested:

```
POST /wp-json/wp/v2/plugins/{plugin-slug}
{"status": "active"}
```

---

## Key Functions

| Function | Purpose |
|----------|---------|
| `Write-Status` | Conditional output (respects `-Quiet`) |
| `ConvertFrom-Html` | Strip HTML tags and decode entities |
| `Test-IsHtml` | Detect HTML content in response |
| `Get-ErrorResponseBody` | Extract error body from exception (PS 5.1 + PS 7+) |
| `Write-ErrorBody` | Pretty-print JSON/HTML error responses with stack traces |
| `Test-ServerCriticalError` | Detect WordPress fatal errors |
| `Write-ServerErrorBanner` | Display server-side error troubleshooting banner |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Missing parameters, plugin not found, ZIP creation failed, upload failed |

---

*V1 specification created: 2026-02-09*
