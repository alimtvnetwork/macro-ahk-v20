# 11 — REST API Endpoints

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The backend HTTP API provides RESTful endpoints for the React frontend to interact with sites, plugins, sync operations, and error logs.

---

## Base Configuration

- **Base URL:** `http://localhost:8080/api/v1`
- **Content-Type:** `application/json`
- **Authentication:** None (localhost only)

---

## API Index & Health

### API Index

```
GET /api/v1
GET /api/v1/
```

Returns API metadata. Useful for verifying the API is running.

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "WP Plugin Publish API",
    "version": "v1",
    "health": "/api/v1/health",
    "ws": "/ws"
  }
}
```

### Health Check

```
GET /api/v1/health
```

Returns server health status using the **standard envelope format**.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-02-04T10:00:00Z"
  }
}
```

> **Important:** The health endpoint MUST return the standard `{success:true, data:{...}}` envelope, not a custom format like `{status:"healthy"}`. Frontend connectivity detection relies on parsing JSON and checking HTTP status codes.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "E2005",
    "message": "site not found",
    "details": "Additional context about the error",
    "context": {
      "site_id": 123
    },
    "file": "service.go",
    "line": 45,
    "function": "GetByID",
    "stackTrace": "...",
    "timestamp": "2026-02-01T10:30:00Z"
  }
}
```

---

## Endpoints

### Sites

#### List Sites

```
GET /api/v1/sites
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Production Site",
      "url": "https://example.com",
      "username": "admin",
      "isActive": true,
      "lastSyncAt": "2026-02-01T10:00:00Z",
      "createdAt": "2026-01-15T08:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### Get Site

```
GET /api/v1/sites/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Production Site",
    "url": "https://example.com",
    "username": "admin",
    "isActive": true,
    "lastSyncAt": "2026-02-01T10:00:00Z",
    "createdAt": "2026-01-15T08:00:00Z",
    "updatedAt": "2026-02-01T10:00:00Z"
  }
}
```

#### Create Site

```
POST /api/v1/sites
```

**Request:**
```json
{
  "name": "Production Site",
  "url": "https://example.com",
  "username": "admin",
  "appPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

**Response:** Same as Get Site

#### Update Site

```
PUT /api/v1/sites/:id
```

**Request:**
```json
{
  "name": "Updated Name",
  "appPassword": "new-password"
}
```

**Response:** Same as Get Site

#### Delete Site

```
DELETE /api/v1/sites/:id
```

**Response:**
```json
{
  "success": true,
  "data": null
}
```

#### Test Site Connection

```
POST /api/v1/sites/:id/test
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "wpVersion": "6.4.2",
    "siteName": "My WordPress Site",
    "pluginCount": 12
  }
}
```

#### Test Credentials (before saving)

```
POST /api/v1/sites/test
```

**Request:**
```json
{
  "url": "https://example.com",
  "username": "admin",
  "appPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

**Response:** Same as Test Site Connection

---

### Plugins

#### List All Plugins

```
GET /api/v1/plugins
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "My Plugin",
      "localPath": "/Users/dev/plugins/my-plugin",
      "remoteSlug": "my-plugin",
      "siteId": 1,
      "isActive": true,
      "isWatching": true,
      "lastPublishedAt": "2026-02-01T09:00:00Z",
      "lastHash": "abc123...",
      "createdAt": "2026-01-20T12:00:00Z",
      "updatedAt": "2026-02-01T09:00:00Z",
      "site": {
        "id": 1,
        "name": "Production Site",
        "url": "https://example.com"
      }
    }
  ]
}
```

#### List Plugins by Site

```
GET /api/v1/sites/:siteId/plugins
```

**Response:** Same as List All Plugins (filtered by site)

#### Get Plugin

```
GET /api/v1/plugins/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "My Plugin",
    "localPath": "/Users/dev/plugins/my-plugin",
    "remoteSlug": "my-plugin",
    "siteId": 1,
    "isActive": true,
    "isWatching": true,
    "lastPublishedAt": "2026-02-01T09:00:00Z",
    "lastHash": "abc123...",
    "createdAt": "2026-01-20T12:00:00Z",
    "updatedAt": "2026-02-01T09:00:00Z",
    "site": {
      "id": 1,
      "name": "Production Site",
      "url": "https://example.com"
    }
  }
}
```

#### Create Plugin

```
POST /api/v1/plugins
```

**Request:**
```json
{
  "name": "My Plugin",
  "localPath": "/Users/dev/plugins/my-plugin",
  "remoteSlug": "my-plugin",
  "siteId": 1
}
```

**Response:** Same as Get Plugin

#### Update Plugin

```
PUT /api/v1/plugins/:id
```

**Request:**
```json
{
  "name": "Updated Plugin Name",
  "isActive": false
}
```

**Response:** Same as Get Plugin

#### Delete Plugin

```
DELETE /api/v1/plugins/:id
```

**Response:**
```json
{
  "success": true,
  "data": null
}
```

#### Scan Directory

```
POST /api/v1/plugins/scan
```

**Request:**
```json
{
  "path": "/Users/dev/plugins/my-plugin"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/Users/dev/plugins/my-plugin",
    "isValid": true,
    "pluginName": "My Custom Plugin",
    "version": "1.2.0",
    "mainFile": "my-plugin.php",
    "files": [
      {
        "path": "my-plugin.php",
        "size": 4096,
        "hash": "abc123...",
        "modifiedAt": "2026-02-01T08:00:00Z",
        "isDirectory": false
      }
    ],
    "totalSize": 102400
  }
}
```

#### Set Watching Status

```
PUT /api/v1/plugins/:id/watching
```

**Request:**
```json
{
  "watching": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "watching": true
  }
}
```

---

### Sync Operations

#### Get File Changes

```
GET /api/v1/plugins/:id/changes
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "pluginId": 1,
      "filePath": "includes/class-utils.php",
      "changeType": "modified",
      "fileHash": "def456...",
      "isPending": true,
      "detectedAt": "2026-02-01T10:15:00Z",
      "createdAt": "2026-02-01T10:15:00Z"
    }
  ]
}
```

#### Check Sync Status

```
POST /api/v1/plugins/:id/sync/check
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pluginId": 1,
    "localHash": "abc123...",
    "remoteHash": "def456...",
    "isSynced": false,
    "localVersion": "1.2.1",
    "remoteVersion": "1.2.0",
    "changedFiles": [
      {
        "path": "includes/class-utils.php",
        "changeType": "modified",
        "localHash": "new123...",
        "remoteHash": "old456..."
      }
    ],
    "newFiles": ["assets/new-file.js"],
    "deletedFiles": []
  }
}
```

#### Clear Pending Changes

```
DELETE /api/v1/plugins/:id/changes
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cleared": 5
  }
}
```

---

### Publish Operations

#### Publish Plugin

```
POST /api/v1/plugins/:id/publish
```

**Request:**
```json
{
  "mode": "full",
  "createBackup": true,
  "activate": true
}
```

**Modes:**
- `full` — Zip and upload entire plugin
- `single` — Upload only changed files (requires companion plugin)

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "pluginSlug": "my-plugin",
    "version": "1.2.1",
    "wasUpdated": true,
    "backupId": 5,
    "filesPublished": 1,
    "duration": 2340
  }
}
```

---

### Backups

#### List Backups for Plugin

```
GET /api/v1/plugins/:id/backups
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "pluginId": 1,
      "siteId": 1,
      "filePath": "backups/my-plugin_2026-02-01_100000.zip",
      "fileSize": 102400,
      "pluginVersion": "1.2.0",
      "createdAt": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### Restore Backup

```
POST /api/v1/backups/:id/restore
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "restoredVersion": "1.2.0"
  }
}
```

#### Delete Backup

```
DELETE /api/v1/backups/:id
```

**Response:**
```json
{
  "success": true,
  "data": null
}
```

---

### Error Logs

#### List Errors

```
GET /api/v1/errors
GET /api/v1/errors?limit=50&level=error
```

**Query Parameters:**
- `limit` (optional): Maximum number of errors to return (default: 100)
- `level` (optional): Filter by level (error, warn, info)
- `code` (optional): Filter by error code

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "level": "error",
      "code": "E3002",
      "message": "Authentication failed",
      "context": {
        "site_url": "https://example.com"
      },
      "stackTrace": "...",
      "file": "auth.go",
      "line": 45,
      "function": "validateCredentials",
      "createdAt": "2026-02-01T10:30:00Z"
    }
  ]
}
```

#### Clear All Errors

```
DELETE /api/v1/errors
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": 15
  }
}
```

---

### Settings

#### Get Settings

```
GET /api/v1/settings
```

**Response:**
```json
{
  "success": true,
  "data": {
    "port": 8080,
    "watchDebounceMs": 500,
    "backupRetentionDays": 30,
    "maxBackupsPerPlugin": 10,
    "tempDirectory": ".temp",
    "backupDirectory": "backups",
    "logLevel": "info"
  }
}
```

#### Update Settings

```
PUT /api/v1/settings
```

**Request:**
```json
{
  "watchDebounceMs": 1000,
  "logLevel": "debug"
}
```

**Response:** Same as Get Settings

---

### Watcher

#### Get Watcher Status

```
GET /api/v1/watcher/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "watchedPlugins": 3,
    "pendingChanges": 5,
    "lastEventAt": "2026-02-01T10:28:00Z"
  }
}
```

#### Start Watcher

```
POST /api/v1/watcher/start
```

**Response:**
```json
{
  "success": true,
  "data": {
    "started": true
  }
}
```

#### Stop Watcher

```
POST /api/v1/watcher/stop
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stopped": true
  }
}
```

---

## Router Implementation

```go
// internal/api/router.go
package api

import (
    "net/http"
    
    "github.com/gorilla/mux"
    
    "wp-plugin-publish/internal/api/handlers"
    "wp-plugin-publish/internal/api/middleware"
    "wp-plugin-publish/internal/logger"
)

func NewRouter(h *handlers.Handlers, log *logger.Logger) *mux.Router {
    r := mux.NewRouter()
    applyMiddleware(r, log)

    api := r.PathPrefix("/api/v1").Subrouter()
    registerSiteRoutes(api, h)
    registerPluginRoutes(api, h)
    registerBackupRoutes(api, h)
    registerUtilityRoutes(api, h)

    return r
}

func applyMiddleware(r *mux.Router, log *logger.Logger) {
    r.Use(middleware.Logging(log))
    r.Use(middleware.Recovery(log))
    r.Use(middleware.CORS())
}

func registerSiteRoutes(api *mux.Router, h *handlers.Handlers) {
    api.HandleFunc("/sites", h.Sites.List).Methods("GET")
    api.HandleFunc("/sites", h.Sites.Create).Methods("POST")
    api.HandleFunc("/sites/test", h.Sites.TestCredentials).Methods("POST")
    api.HandleFunc("/sites/{id:[0-9]+}", h.Sites.Get).Methods("GET")
    api.HandleFunc("/sites/{id:[0-9]+}", h.Sites.Update).Methods("PUT")
    api.HandleFunc("/sites/{id:[0-9]+}", h.Sites.Delete).Methods("DELETE")
    api.HandleFunc("/sites/{id:[0-9]+}/test", h.Sites.TestConnection).Methods("POST")
    api.HandleFunc("/sites/{id:[0-9]+}/plugins", h.Plugins.ListBySite).Methods("GET")
}

func registerPluginRoutes(api *mux.Router, h *handlers.Handlers) {
    api.HandleFunc("/plugins", h.Plugins.List).Methods("GET")
    api.HandleFunc("/plugins", h.Plugins.Create).Methods("POST")
    api.HandleFunc("/plugins/scan", h.Plugins.Scan).Methods("POST")
    api.HandleFunc("/plugins/{id:[0-9]+}", h.Plugins.Get).Methods("GET")
    api.HandleFunc("/plugins/{id:[0-9]+}", h.Plugins.Update).Methods("PUT")
    api.HandleFunc("/plugins/{id:[0-9]+}", h.Plugins.Delete).Methods("DELETE")
    api.HandleFunc("/plugins/{id:[0-9]+}/watching", h.Plugins.SetWatching).Methods("PUT")
    api.HandleFunc("/plugins/{id:[0-9]+}/changes", h.Sync.GetChanges).Methods("GET")
    api.HandleFunc("/plugins/{id:[0-9]+}/changes", h.Sync.ClearChanges).Methods("DELETE")
    api.HandleFunc("/plugins/{id:[0-9]+}/sync/check", h.Sync.Check).Methods("POST")
    api.HandleFunc("/plugins/{id:[0-9]+}/publish", h.Publish.Publish).Methods("POST")
    api.HandleFunc("/plugins/{id:[0-9]+}/backups", h.Backup.List).Methods("GET")
}

func registerBackupRoutes(api *mux.Router, h *handlers.Handlers) {
    api.HandleFunc("/backups/{id:[0-9]+}", h.Backup.Delete).Methods("DELETE")
    api.HandleFunc("/backups/{id:[0-9]+}/restore", h.Backup.Restore).Methods("POST")
}

func registerUtilityRoutes(api *mux.Router, h *handlers.Handlers) {
    api.HandleFunc("/errors", h.Errors.List).Methods("GET")
    api.HandleFunc("/errors", h.Errors.Clear).Methods("DELETE")
    api.HandleFunc("/settings", h.Settings.Get).Methods("GET")
    api.HandleFunc("/settings", h.Settings.Update).Methods("PUT")
    api.HandleFunc("/watcher/status", h.Watcher.Status).Methods("GET")
    api.HandleFunc("/watcher/start", h.Watcher.Start).Methods("POST")
    api.HandleFunc("/watcher/stop", h.Watcher.Stop).Methods("POST")
}
```

---

## CORS Middleware

```go
// internal/api/middleware/cors.go
package middleware

import "net/http"

func CORS() func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Only allow localhost origins
            origin := r.Header.Get("Origin")
            isLocalOrigin := origin == "http://localhost:3000" || origin == "http://127.0.0.1:3000"

            if isLocalOrigin {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
                w.Header().Set("Access-Control-Max-Age", "86400")
            }
            
            if r.Method == "OPTIONS" {
                w.WriteHeader(http.StatusOK)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```

---

## Next Document

See [12-websocket-events.md](./12-websocket-events.md) for real-time notifications.
