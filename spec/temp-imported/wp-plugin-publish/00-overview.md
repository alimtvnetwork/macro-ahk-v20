# WP Plugin Publish — Overview

> **Version:** 1.0.0  
> **Status:** Complete  
> **Last Updated:** 2026-02-01

---

## Purpose

**WP Plugin Publish** is a local development tool for WordPress plugin developers that enables:

1. **Multi-Site Management** — Connect to multiple WordPress installations via Application Password authentication
2. **Multi-Plugin Management** — Manage multiple local plugin source directories
3. **Real-Time Sync Detection** — File watchers detect local changes; manual checks compare against remote
4. **One-Click Publishing** — Push single files or full plugin zips to remote WordPress sites
5. **Automatic Activation** — Plugins are automatically activated after upload
6. **Full Backup & Rollback** — Download remote plugins before updating for safety

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React UI (localhost:3000)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Sites    │ │ Plugins  │ │ Sync     │ │ Error Console    │   │
│  │ Manager  │ │ Manager  │ │ Dashboard│ │ (Copy to AI)     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Go Backend (localhost:8080)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ File Watcher │ │ WP REST API  │ │ Zip Builder              │ │
│  │ (fsnotify)   │ │ Client       │ │ (.temp folder)           │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ SQLite DB    │ │ Logger       │ │ Backup Manager           │ │
│  │ (main store) │ │ (structured) │ │ (download before update) │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Remote WordPress Sites                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Site A       │ │ Site B       │ │ Site C                   │ │
│  │ (Production) │ │ (Staging)    │ │ (Development)            │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React + TypeScript + Tailwind | Local UI for management |
| Backend | Go 1.21+ | File watching, WP API, zip handling |
| Database | SQLite | Sites, plugins, sync history, logs |
| Config | JSON (seed only) | Initial setup, version-controlled |
| File Watcher | fsnotify | Real-time local change detection |
| WP Integration | REST API + Application Password | Remote plugin management |

---

## Core Features

### 1. Site Management
- Add/edit/remove WordPress sites
- Store site URL, username, application password (encrypted)
- Test connection before saving
- Track last sync time per site

### 2. Plugin Management
- Register local plugin directories
- Map local plugins to remote site plugin slugs
- Track file modification timestamps
- Support multiple plugins per site

### 3. Sync Detection
- **Local Watcher**: fsnotify watches registered plugin directories
- **Remote Comparison**: On-demand fetch of remote plugin file hashes
- **Diff Display**: Show which files differ between local and remote

### 4. Publishing Modes
- **Single File Update**: Upload individual changed files (faster for dev)
- **Full Plugin Zip**: Create zip in `.temp/`, upload, auto-activate

### 5. Backup & Rollback
- Download remote plugin as zip before any update
- Store in `backups/` with timestamp
- One-click rollback to previous version

### 6. Error Management
- Structured error logging with file:line:function
- Stack traces for Go panics
- Error console in React UI with copy-to-clipboard
- Error history stored in SQLite

---

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 00 | [Overview](./00-overview.md) | This document |
| — | [Unified Testing Index](../00-testing-index.md) | Cross-reference of all E2E tests across Chrome Extension and WP Plugin Publish |
| **Backend Specs** | | |
| 01 | [Plugin Structure](./01-backend/01-plugin-structure.md) | Go project layout and conventions |
| 02 | [Database Schema](./01-backend/02-database-schema.md) | SQLite tables and migrations |
| 03 | [Config System](./01-backend/03-config-system.md) | JSON seeding and SQLite sync |
| 04 | [Site Service](./01-backend/04-site-service.md) | WordPress site management |
| 05 | [Plugin Service](./01-backend/05-plugin-service.md) | Local plugin management |
| 06 | [File Watcher](./01-backend/06-file-watcher.md) | fsnotify integration |
| 07 | [Sync Service](./01-backend/07-sync-service.md) | Local vs remote comparison |
| 08 | [Publish Service](./01-backend/08-publish-service.md) | Zip creation and upload |
| 09 | [Backup Service](./01-backend/09-backup-service.md) | Download and rollback |
| 10 | [WP REST Client](./01-backend/10-wp-rest-client.md) | WordPress API integration |
| 11 | [REST API Endpoints](./01-backend/11-rest-api-endpoints.md) | Backend HTTP API |
| 12 | [WebSocket Events](./01-backend/12-websocket-events.md) | Real-time notifications |
| 13 | [Error Management](./01-backend/13-error-management.md) | Structured errors and logging |
| 14 | [Logging System](./01-backend/14-logging-system.md) | File:line:function logging |
| **Frontend Specs** | | |
| 20 | [Frontend Overview](./02-frontend/20-frontend-overview.md) | React architecture |
| 21 | [Site Manager UI](./02-frontend/21-site-manager-ui.md) | Add/edit/test sites |
| 22 | [Plugin Manager UI](./02-frontend/22-plugin-manager-ui.md) | Register local plugins |
| 23 | [Sync Dashboard](./02-frontend/23-sync-dashboard.md) | View changes, trigger sync |
| 24 | [Error Console](./02-frontend/24-error-console.md) | View and copy errors |
| 25 | [Settings Page](./02-frontend/25-settings-page.md) | App configuration |
| **Shared** | | |
| 66 | [Shared Constants](./66-shared-constants.md) | Error codes, enums, status values |
| 99 | [Consistency Report](./99-consistency-report.md) | Cross-reference validation |

---

## Data Flow

### Sync Check Flow
```
1. User clicks "Check for Changes"
2. Backend fetches remote plugin file list via WP REST
3. Backend compares with local file hashes
4. Returns diff to frontend
5. UI shows list of changed files
```

### Publish Flow (Full Plugin)
```
1. User clicks "Publish Plugin"
2. Backend downloads current remote version → backups/
3. Backend creates zip in .temp/
4. Backend uploads zip via WP REST
5. Backend activates plugin via WP REST
6. Backend cleans up .temp/
7. UI shows success notification
```

### File Watcher Flow
```
1. fsnotify detects local file change
2. Backend records change in SQLite
3. WebSocket notifies frontend
4. UI shows "X files changed" indicator
```

---

## Security Considerations

1. **Application Passwords**: Stored encrypted in SQLite using AES-256
2. **Local Only**: Backend only binds to localhost
3. **No External Access**: All WP requests originate from user's machine
4. **Credential Rotation**: UI allows regenerating application passwords

---

## Directory Structure

```
wp-plugin-publish/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── internal/
│   ├── config/                  # JSON seeding, version control
│   ├── database/                # SQLite setup, migrations
│   ├── models/                  # Data structures
│   ├── services/                # Business logic
│   │   ├── site/                # Site management
│   │   ├── plugin/              # Plugin management
│   │   ├── watcher/             # File watching
│   │   ├── sync/                # Sync comparison
│   │   ├── publish/             # Zip and upload
│   │   └── backup/              # Download and rollback
│   ├── wordpress/               # WP REST API client
│   ├── api/                     # HTTP handlers
│   ├── ws/                      # WebSocket handlers
│   └── logger/                  # Structured logging
├── web/                         # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
├── data/
│   └── app.db                   # SQLite database
├── backups/                     # Downloaded plugin backups
├── .temp/                       # Temporary zip files
├── config.json                  # Seed configuration (version-controlled)
└── go.mod
```

---

## Quick Start (Target UX)

```bash
# 1. Start the application
./wp-plugin-publish

# 2. Open browser to localhost:3000
# 3. Add a WordPress site (URL + Application Password)
# 4. Register local plugin directories
# 5. Map plugins to remote sites
# 6. Click "Check for Changes" or enable file watcher
# 7. Click "Publish" when ready
```

---

## Next Steps

See [01-backend/01-plugin-structure.md](./01-backend/01-plugin-structure.md) to begin implementation.
