# 01 — Go Project Structure

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

This document defines the Go project layout, naming conventions, and module organization for WP Plugin Publish.

---

## Project Layout

```
wp-plugin-publish/
├── cmd/
│   └── server/
│       └── main.go                 # Application entry point
├── internal/                        # Private application code
│   ├── config/
│   │   ├── config.go               # Configuration loading
│   │   ├── seed.go                 # JSON seed processing
│   │   └── version.go              # Version comparison
│   ├── database/
│   │   ├── database.go             # SQLite connection
│   │   ├── migrations.go           # Schema migrations
│   │   └── queries/                # SQL query files
│   ├── models/
│   │   ├── site.go                 # Site model
│   │   ├── plugin.go               # Plugin model
│   │   ├── sync_record.go          # Sync history model
│   │   ├── file_change.go          # File change model
│   │   ├── backup.go               # Backup model
│   │   └── error_log.go            # Error log model
│   ├── services/
│   │   ├── site/
│   │   │   ├── service.go          # Site CRUD operations
│   │   │   ├── validator.go        # Site validation
│   │   │   └── encryption.go       # Password encryption
│   │   ├── plugin/
│   │   │   ├── service.go          # Plugin CRUD operations
│   │   │   ├── scanner.go          # Directory scanning
│   │   │   └── hasher.go           # File hash calculation
│   │   ├── watcher/
│   │   │   ├── service.go          # File watcher management
│   │   │   ├── handler.go          # Change event handling
│   │   │   └── debouncer.go        # Event debouncing
│   │   ├── sync/
│   │   │   ├── service.go          # Sync comparison logic
│   │   │   ├── differ.go           # File diff calculation
│   │   │   └── resolver.go         # Conflict resolution
│   │   ├── publish/
│   │   │   ├── service.go          # Publish orchestration
│   │   │   ├── zipper.go           # Zip file creation
│   │   │   └── uploader.go         # WP upload handling
│   │   └── backup/
│   │       ├── service.go          # Backup management
│   │       ├── downloader.go       # Remote download
│   │       └── restorer.go         # Rollback logic
│   ├── wordpress/
│   │   ├── client.go               # WP REST API client
│   │   ├── auth.go                 # Application Password auth
│   │   ├── plugins.go              # Plugin endpoints
│   │   ├── files.go                # File operations (if supported)
│   │   └── errors.go               # WP-specific errors
│   ├── api/
│   │   ├── router.go               # HTTP router setup
│   │   ├── middleware/
│   │   │   ├── logging.go          # Request logging
│   │   │   ├── recovery.go         # Panic recovery
│   │   │   └── cors.go             # CORS handling
│   │   └── handlers/
│   │       ├── sites.go            # Site endpoints
│   │       ├── plugins.go          # Plugin endpoints
│   │       ├── sync.go             # Sync endpoints
│   │       ├── publish.go          # Publish endpoints
│   │       ├── backup.go           # Backup endpoints
│   │       └── errors.go           # Error log endpoints
│   ├── ws/
│   │   ├── hub.go                  # WebSocket hub
│   │   ├── client.go               # WebSocket client
│   │   └── events.go               # Event types
│   └── logger/
│       ├── logger.go               # Core logger
│       ├── context.go              # Context extraction
│       └── formatter.go            # Output formatting
├── pkg/                            # Public/reusable packages (if any)
│   └── apperror/
│       ├── error.go                # AppError type
│       ├── codes.go                # Error codes
│       └── stack.go                # Stack trace capture
├── web/                            # React frontend (separate build)
├── data/                           # Runtime data
│   └── .gitkeep
├── backups/                        # Plugin backups
│   └── .gitkeep
├── .temp/                          # Temporary files
│   └── .gitkeep
├── config.json                     # Seed configuration
├── go.mod
├── go.sum
├── Makefile
└── readme.md
```

---

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| Go source | lowercase, underscore | `sync_record.go` |
| Test files | `*_test.go` | `service_test.go` |
| SQL migrations | `NNNN_description.sql` | `0001_initial_schema.sql` |

### Packages

| Type | Convention | Example |
|------|------------|---------|
| Service package | singular noun | `site`, `plugin`, `sync` |
| Handler package | plural noun | `handlers` |
| Utility package | descriptive | `apperror`, `logger` |

### Variables and Functions

| Type | Convention | Example |
|------|------------|---------|
| Exported | PascalCase | `GetSiteByID`, `SyncService` |
| Unexported | camelCase | `validateURL`, `buildQuery` |
| Constants | PascalCase | `MaxRetries`, `DefaultTimeout` |
| Acronyms | All caps in names | `GetSiteURL`, `ParseHTTPResponse` |

### Database

| Type | Convention | Example |
|------|------------|---------|
| Table names | snake_case, plural | `sites`, `sync_records` |
| Column names | PascalCase | `SiteId`, `CreatedAt`, `IsActive` |
| Go struct fields | camelCase (internal) | mapped via tags |

---

## Module Organization

### cmd/server/main.go

```go
package main

import (
    "context"
    "os"
    "os/signal"
    "syscall"

    "wp-plugin-publish/internal/api"
    "wp-plugin-publish/internal/config"
    "wp-plugin-publish/internal/database"
    "wp-plugin-publish/internal/logger"
    "wp-plugin-publish/internal/services/watcher"
)

func main() {
    log := logger.New()

    cfg, db := initInfrastructure(log)
    defer db.Close()

    services := initServices(db, log)

    startBackgroundServices(services, log)

    awaitShutdown(services, log)
}

func initInfrastructure(log *logger.Logger) (*config.Config, *database.DB) {
    cfg, err := config.Load("config.json")
    if err != nil {
        log.Fatal("Failed to load config", "error", err)
    }

    db, err := database.New(cfg.DatabasePath)
    if err != nil {
        log.Fatal("Failed to connect to database", "error", err)
    }

    if err := database.Migrate(db); err != nil {
        log.Fatal("Failed to run migrations", "error", err)
    }

    if err := config.SeedIfNeeded(db, cfg); err != nil {
        log.Fatal("Failed to seed database", "error", err)
    }

    return cfg, db
}

func startBackgroundServices(services *Services, log *logger.Logger) {
    w := watcher.New(services.Plugin, services.Sync, log)
    go w.Start()

    server := api.NewServer(services, log)
    go server.Start(services.Config.Port)
}

func awaitShutdown(services *Services, log *logger.Logger) {
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Info("Shutting down...")
    services.Watcher.Stop()
    services.Server.Shutdown(context.Background())
}
```

---

## Dependency Injection

Services are constructed with their dependencies explicitly passed:

```go
// internal/services/sync/service.go
type Service struct {
    db       *database.DB
    wpClient *wordpress.Client
    log      *logger.Logger
}

func New(
	db *database.DB,
	wpClient *wordpress.Client,
	log *logger.Logger,
) *Service {
    return &Service{
        db:       db,
        wpClient: wpClient,
        log:      log,
    }
}
```

---

## Error Handling Pattern

All functions that can fail return `error` as the last return value:

```go
func (s *Service) GetSiteByID(ctx context.Context, id int64) (*models.Site, error) {
    site, err := s.db.GetSite(ctx, id)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get site")
    }
    if site == nil {
        return nil, apperror.New(apperror.ErrNotFound, "site not found")
    }
    return site, nil
}
```

---

## Build Commands

```makefile
# Makefile

.PHONY: build run test lint

build:
	go build -o bin/wp-plugin-publish ./cmd/server

run:
	go run ./cmd/server

test:
	go test -v ./...

lint:
	golangci-lint run

dev:
	air  # Hot reload for development
```

---

## Dependencies

```go
// go.mod
module wp-plugin-publish

go 1.21

require (
    github.com/fsnotify/fsnotify v1.7.0    // File watching
    github.com/mattn/go-sqlite3 v1.14.19   // SQLite driver
    github.com/gorilla/mux v1.8.1          // HTTP routing
    github.com/gorilla/websocket v1.5.1    // WebSocket support
    github.com/rs/zerolog v1.31.0          // Structured logging
)
```

---

## Next Document

See [02-database-schema.md](./02-database-schema.md) for SQLite table definitions.
