# 02 — Database Schema

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

SQLite is the primary data store. JSON configuration is used only for initial seeding.

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│     Sites       │       │    Plugins      │
├─────────────────┤       ├─────────────────┤
│ Id (PK)         │       │ Id (PK)         │
│ Name            │       │ Name            │
│ Url             │       │ LocalPath       │
│ Username        │       │ RemoteSlug      │
│ AppPassword     │◄──────│ SiteId (FK)     │
│ IsActive        │       │ IsActive        │
│ LastSyncAt      │       │ LastPublishedAt │
│ CreatedAt       │       │ CreatedAt       │
│ UpdatedAt       │       │ UpdatedAt       │
└─────────────────┘       └─────────────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│   SyncRecords   │       │  FileChanges    │
├─────────────────┤       ├─────────────────┤
│ Id (PK)         │       │ Id (PK)         │
│ PluginId (FK)   │       │ PluginId (FK)   │
│ Status          │       │ FilePath        │
│ FilesChanged    │       │ ChangeType      │
│ ErrorMessage    │       │ DetectedAt      │
│ StartedAt       │       │ IsPending       │
│ CompletedAt     │       │ SyncedAt        │
│ CreatedAt       │       │ CreatedAt       │
└─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│    Backups      │       │   ErrorLogs     │
├─────────────────┤       ├─────────────────┤
│ Id (PK)         │       │ Id (PK)         │
│ PluginId (FK)   │       │ Level           │
│ SiteId (FK)     │       │ Code            │
│ FilePath        │       │ Message         │
│ FileSize        │       │ Context         │
│ CreatedAt       │       │ StackTrace      │
└─────────────────┘       │ File            │
                          │ Line            │
┌─────────────────┐       │ Function        │
│   AppConfig     │       │ CreatedAt       │
├─────────────────┤       └─────────────────┘
│ Key (PK)        │
│ Value           │
│ UpdatedAt       │
└─────────────────┘
```

---

## Table Definitions

### Sites

Stores WordPress site connection information.

```sql
CREATE TABLE Sites (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Name            TEXT NOT NULL,
    Url             TEXT NOT NULL UNIQUE,
    Username        TEXT NOT NULL,
    AppPassword     TEXT NOT NULL,  -- AES-256 encrypted
    IsActive        INTEGER NOT NULL DEFAULT 1,
    LastSyncAt      TEXT,           -- ISO8601 timestamp
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sites_is_active ON Sites(IsActive);
CREATE INDEX idx_sites_url ON Sites(Url);
```

### Plugins

Stores local plugin directory mappings.

```sql
CREATE TABLE Plugins (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Name            TEXT NOT NULL,
    LocalPath       TEXT NOT NULL,          -- Absolute path to local directory
    RemoteSlug      TEXT NOT NULL,          -- WordPress plugin slug
    SiteId          INTEGER NOT NULL,
    IsActive        INTEGER NOT NULL DEFAULT 1,
    IsWatching      INTEGER NOT NULL DEFAULT 0,
    LastPublishedAt TEXT,                   -- ISO8601 timestamp
    LastHash        TEXT,                   -- Hash of last published state
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (SiteId) REFERENCES Sites(Id) ON DELETE CASCADE,
    UNIQUE(LocalPath, SiteId)
);

CREATE INDEX idx_plugins_site_id ON Plugins(SiteId);
CREATE INDEX idx_plugins_is_active ON Plugins(IsActive);
CREATE INDEX idx_plugins_is_watching ON Plugins(IsWatching);
```

### FileChanges

Tracks detected file modifications.

```sql
CREATE TABLE FileChanges (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    PluginId        INTEGER NOT NULL,
    FilePath        TEXT NOT NULL,          -- Relative path within plugin
    ChangeType      TEXT NOT NULL,          -- 'created', 'modified', 'deleted'
    FileHash        TEXT,                   -- MD5/SHA256 of current file
    IsPending       INTEGER NOT NULL DEFAULT 1,
    DetectedAt      TEXT NOT NULL DEFAULT (datetime('now')),
    SyncedAt        TEXT,
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (PluginId) REFERENCES Plugins(Id) ON DELETE CASCADE
);

CREATE INDEX idx_file_changes_plugin_id ON FileChanges(PluginId);
CREATE INDEX idx_file_changes_is_pending ON FileChanges(IsPending);
CREATE INDEX idx_file_changes_detected_at ON FileChanges(DetectedAt);
```

### SyncRecords

Logs sync/publish operations.

```sql
CREATE TABLE SyncRecords (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    PluginId        INTEGER NOT NULL,
    SiteId          INTEGER NOT NULL,
    Operation       TEXT NOT NULL,          -- 'check', 'publish_single', 'publish_full'
    Status          TEXT NOT NULL,          -- 'pending', 'in_progress', 'completed', 'failed'
    FilesChanged    INTEGER DEFAULT 0,
    FilesPublished  INTEGER DEFAULT 0,
    ErrorMessage    TEXT,
    StartedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    CompletedAt     TEXT,
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (PluginId) REFERENCES Plugins(Id) ON DELETE CASCADE,
    FOREIGN KEY (SiteId) REFERENCES Sites(Id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_records_plugin_id ON SyncRecords(PluginId);
CREATE INDEX idx_sync_records_status ON SyncRecords(Status);
CREATE INDEX idx_sync_records_created_at ON SyncRecords(CreatedAt);
```

### Backups

Tracks downloaded plugin backups.

```sql
CREATE TABLE Backups (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    PluginId        INTEGER NOT NULL,
    SiteId          INTEGER NOT NULL,
    FilePath        TEXT NOT NULL,          -- Path in backups/ directory
    FileSize        INTEGER NOT NULL,       -- Size in bytes
    PluginVersion   TEXT,                   -- Version from plugin header
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (PluginId) REFERENCES Plugins(Id) ON DELETE CASCADE,
    FOREIGN KEY (SiteId) REFERENCES Sites(Id) ON DELETE CASCADE
);

CREATE INDEX idx_backups_plugin_id ON Backups(PluginId);
CREATE INDEX idx_backups_created_at ON Backups(CreatedAt);
```

### ErrorLogs

Stores application errors for UI display.

```sql
CREATE TABLE ErrorLogs (
    Id              INTEGER PRIMARY KEY AUTOINCREMENT,
    Level           TEXT NOT NULL,          -- 'error', 'warn', 'info'
    Code            TEXT NOT NULL,          -- Error code (e.g., 'E1001')
    Message         TEXT NOT NULL,
    Context         TEXT,                   -- JSON blob with additional context
    StackTrace      TEXT,                   -- Full stack trace
    File            TEXT,                   -- Source file
    Line            INTEGER,                -- Line number
    Function        TEXT,                   -- Function name
    CreatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_error_logs_level ON ErrorLogs(Level);
CREATE INDEX idx_error_logs_code ON ErrorLogs(Code);
CREATE INDEX idx_error_logs_created_at ON ErrorLogs(CreatedAt);
```

### AppConfig

Application configuration (version tracking, settings).

```sql
CREATE TABLE AppConfig (
    Key             TEXT PRIMARY KEY,
    Value           TEXT NOT NULL,
    UpdatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default entries
INSERT INTO AppConfig (Key, Value) VALUES ('schema_version', '1');
INSERT INTO AppConfig (Key, Value) VALUES ('seed_version', '0');
```

---

## Migration Strategy

### Migration Files

```
internal/database/migrations/
├── 0001_initial_schema.sql
├── 0002_add_file_hash.sql
└── ...
```

### Migration Runner

```go
// internal/database/migrations.go
func Migrate(db *sql.DB) error {
    // Get current version
    var currentVersion int
    err := db.QueryRow("SELECT Value FROM AppConfig WHERE Key = 'schema_version'").Scan(&currentVersion)
    if err == sql.ErrNoRows {
        currentVersion = 0
    }
    
    // Apply pending migrations
    for i := currentVersion + 1; i <= len(migrations); i++ {
        if err := applyMigration(db, i); err != nil {
            return fmt.Errorf("migration %d failed: %w", i, err)
        }
    }
    
    return nil
}
```

---

## Data Types

| SQLite Type | Go Type | Notes |
|-------------|---------|-------|
| INTEGER | int64 | Primary keys, foreign keys |
| TEXT | string | Strings, JSON blobs |
| TEXT (ISO8601) | time.Time | Timestamps |
| INTEGER (0/1) | bool | Boolean flags |
| REAL | float64 | Decimal numbers |

---

## Encryption

Application passwords are encrypted using AES-256-GCM:

```go
// internal/services/site/encryption.go
func EncryptPassword(plaintext string, key []byte) (string, error) {
    gcm, err := createGCM(key)
    if err != nil {
        return "", err
    }

    nonce, err := generateNonce(gcm.NonceSize())
    if err != nil {
        return "", err
    }

    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

    return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func createGCM(key []byte) (cipher.AEAD, error) {
    block, err := aes.NewCipher(key)
    if err != nil {
        return nil, err
    }

    return cipher.NewGCM(block)
}

func generateNonce(size int) ([]byte, error) {
    nonce := make([]byte, size)
    _, err := io.ReadFull(rand.Reader, nonce)

    return nonce, err
}
```

---

## Next Document

See [03-config-system.md](./03-config-system.md) for JSON seeding and version control.
