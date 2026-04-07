# Endpoint Mapping Specification

**Version:** 1.0.0
**Updated:** 2026-02-08

## Overview

This spec defines a **centralized endpoint mapping system** that provides a single source of truth for all WordPress-delegated API endpoints. The system uses:

1. **Go enum** (`WPEndpointName`) — a named string constant identifying each operation  
2. **Go endpoint map** (`GoEndpointMap`) — maps the enum to the Go backend API route  
3. **WP endpoint map** (`WPEndpointMap`) — maps the enum to the WordPress Riseup Asia Uploader REST API endpoint  
4. **PHP endpoints.json** — a JSON reference file bundled with the PHP plugin listing all registered endpoints with methods  
5. **PHP /status response** — enhanced to include a `registeredRoutes` field listing all active routes  

## Scope

**WordPress-delegated endpoints only** — operations where the Go backend forwards requests to the Riseup Asia Uploader REST API on a remote WordPress site.

## Enum Definitions

| Enum Name              | Go Backend Route                                  | WP Plugin Endpoint        | HTTP Method |
|------------------------|---------------------------------------------------|---------------------------|-------------|
| `ListPlugins`          | `GET  /api/v1/sites/{id}/remote-plugins`          | `GET  /plugins`           | GET         |
| `EnablePlugin`         | `POST /api/v1/sites/{id}/remote-plugins/enable`   | `POST /plugins/enable`    | POST        |
| `DisablePlugin`        | `POST /api/v1/sites/{id}/remote-plugins/disable`  | `POST /plugins/disable`   | POST        |
| `DeletePlugin`         | `POST /api/v1/sites/{id}/remote-plugins/delete`   | `POST /plugins/delete`    | POST        |
| `UploadPlugin`         | `POST /api/v1/sites/{id}/publish`                 | `POST /upload`            | POST        |
| `PluginFiles`          | `POST /api/v1/sites/{id}/remote-plugins/files`    | `POST /plugins/files`     | POST        |
| `PluginFileContent`    | `POST /api/v1/sites/{id}/remote-plugins/file`     | `POST /plugins/file`      | POST        |
| `PluginExport`         | `POST /api/v1/sites/{id}/remote-plugins/export`   | `POST /plugins/export`    | POST        |
| `SyncManifest`         | `POST /api/v1/sites/{id}/sync/manifest`           | `POST /plugins/sync-manifest` | POST    |
| `SyncPush`             | `POST /api/v1/sites/{id}/sync/push`               | `POST /plugins/sync`      | POST        |
| `Status`               | `GET  /api/v1/sites/{id}/status`                  | `GET  /status`            | GET         |
| `ExportSelf`           | `GET  /api/v1/sites/{id}/export-self`             | `GET  /export-self`       | GET         |

## Go Implementation

### File: `backend/internal/wordpress/endpoint_map.go`

```go
package wordpress

// WPEndpointName identifies a WordPress-delegated operation.
type WPEndpointName string

const (
    EPListPlugins      WPEndpointName = "ListPlugins"
    EPEnablePlugin     WPEndpointName = "EnablePlugin"
    EPDisablePlugin    WPEndpointName = "DisablePlugin"
    EPDeletePlugin     WPEndpointName = "DeletePlugin"
    EPUploadPlugin     WPEndpointName = "UploadPlugin"
    EPPluginFiles      WPEndpointName = "PluginFiles"
    EPPluginFileContent WPEndpointName = "PluginFileContent"
    EPPluginExport     WPEndpointName = "PluginExport"
    EPSyncManifest     WPEndpointName = "SyncManifest"
    EPSyncPush         WPEndpointName = "SyncPush"
    EPStatus           WPEndpointName = "Status"
    EPExportSelf       WPEndpointName = "ExportSelf"
)

// GoEndpointMap maps each operation to its Go backend API route pattern.
var GoEndpointMap = map[WPEndpointName]string{ ... }

// WPEndpointMap maps each operation to its WordPress plugin REST endpoint.
var WPEndpointMap = map[WPEndpointName]string{ ... }
```

## PHP endpoints.json

Located at `wp-plugins/riseup-asia-uploader/data/endpoints.json`.

```json
{
  "namespace": "riseup-asia-uploader/v1",
  "endpoints": [
    { "path": "/status",          "method": "GET",  "category": "system" },
    { "path": "/plugins",         "method": "GET",  "category": "plugins" },
    { "path": "/plugins/enable",  "method": "POST", "category": "plugins" },
    ...
  ]
}
```

## PHP /status Enhancement

The `/status` response gains a `registeredRoutes` array:

```json
{
  "success": true,
  "version": "1.27.0",
  "registeredRoutes": [
    { "route": "/riseup-asia-uploader/v1/status", "methods": ["GET"] },
    { "route": "/riseup-asia-uploader/v1/plugins", "methods": ["GET"] },
    ...
  ]
}
```

## Upload Script V2

`wp-plugins/scripts/upload-plugin-v2.ps1`:

1. **Git Pull** — `git pull` on current branch  
2. **Local Version** — parse `RISEUP_VERSION` from `constants.php`  
3. **Remote Version** — query `GET /wp-json/riseup-asia-uploader/v1/status` → `.version`  
4. **Compare & Log** — display both versions, confirm upgrade/downgrade/same  
5. **Publish** — ZIP + upload via Riseup Asia Uploader API  

## run.ps1 Integration

New flag: `-u` / `-upload`

Invokes `upload-plugin-v2.ps1` with defaults from `powershell.json`:
- Plugin path from `wpPlugins.defaultUploader`  
- Site URL, username, password from the first configured site (or passed as params)

## Maintenance Rules

1. When adding a new WP-delegated endpoint, update ALL of:
   - `endpoint_map.go` (Go enum + both maps)
   - `endpoints.json` (PHP reference)
   - `constants.php` (PHP constant)
   - `register_routes()` in main plugin file
2. The Go enum is the canonical identifier used in error logs and diagnostics
