# Split Database Architecture

> **Version:** 2.0.0  
> **Created:** 2026-02-01  
> **Updated:** 2026-02-01  
> **Status:** Active  
> **Purpose:** Reusable pattern for hierarchical SQLite database organization across all projects

---

## Summary

The **Split DB Architecture** defines a pattern for organizing SQLite databases into a **multi-layer hierarchical structure** where a **Root DB** manages metadata about child databases, and item-specific databases are created dynamically as needed. This pattern enables efficient data isolation, improved performance, logical organization, and easy import/export via zip files.

---

## Core Concepts

### 1. Root Database

The **Root DB** is the central registry that tracks all child databases:

| Role | Description |
|------|-------------|
| Registry | Maintains list of all child databases |
| Metadata | Stores creation date, status, size |
| Routing | Determines which child DB to query |
| Lifecycle | Manages creation/deletion of child DBs |
| Logging | Central logging for all DB operations |

### 2. Multi-Layer Hierarchy

The architecture supports **2-4 layer depth** based on use case:

| Layers | Structure | Use Case |
|--------|-----------|----------|
| 2-Layer | `{project}/{type}.db` | Simple apps |
| 3-Layer | `{project}/{type}/{entity}.db` | Most CLIs |
| 4-Layer | `{project}/{category}/{type}/{entity}.db` | Complex apps |

### 3. Database Types

Child databases can be organized by:

| Dimension | Example |
|-----------|---------|
| Project | `project-{slug}/` |
| Category | `ai/`, `search/`, `workflow/` |
| Type | `history/`, `cache/`, `config/`, `chat/`, `voice/`, `search/` |
| Entity | `{file-slug}.db`, `{session-id}.db` |

---

## Hierarchical Structure Examples

### 2-Layer Structure (Simple)

```
data/
├── root.db                              # Root registry
└── {project-slug}/
    ├── config.db                        # Project config
    ├── cache.db                         # Project cache
    └── logs.db                          # Project logs
```

### 3-Layer Structure (Standard - Most Common)

```
data/
├── root.db                              # Root registry database
├── {project-slug}/
│   ├── history/                         # History databases folder
│   │   ├── {file-slug}.db               # Per-file history
│   │   ├── {file-slug-2}.db
│   │   └── ...
│   ├── cache/                           # Cache databases folder
│   │   └── search-cache.db
│   ├── config/                          # Config databases
│   │   └── settings.db
│   ├── chat/                            # Chat session databases
│   │   ├── {session-id}.db
│   │   └── ...
│   ├── voice/                           # Voice recording databases
│   │   └── {recording-id}.db
│   └── search/                          # Search index databases
│       └── {index-id}.db
└── {project-slug-2}/
    └── ...
```

### 4-Layer Structure (Complex - With Categories)

```
data/
├── root.db                              # Root registry database
├── {project-slug}/
│   ├── ai/                              # AI category
│   │   ├── chat/                        # Chat type
│   │   │   ├── {session-id}.db
│   │   │   └── ...
│   │   ├── embeddings/                  # Embeddings type
│   │   │   └── {model-id}.db
│   │   └── prompts/                     # Prompts type
│   │       └── {template-id}.db
│   ├── workflow/                        # Workflow category
│   │   ├── history/                     # History type
│   │   │   └── {file-slug}.db
│   │   └── queue/                       # Queue type
│   │       └── {queue-id}.db
│   └── search/                          # Search category
│       ├── indices/                     # Indices type
│       │   └── {index-id}.db
│       └── cache/                       # Cache type
│           └── {query-hash}.db
└── {project-slug-2}/
    └── ...
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         SPLIT DATABASE ARCHITECTURE (v2.0)                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│                              ┌─────────────────┐                                     │
│                              │    ROOT.DB      │                                     │
│                              │   (Registry +   │                                     │
│                              │    Logging)     │                                     │
│                              └────────┬────────┘                                     │
│                                       │                                              │
│           ┌───────────────────────────┼───────────────────────────┐                  │
│           │                           │                           │                  │
│           ▼                           ▼                           ▼                  │
│  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐            │
│  │  PROJECT-A/     │       │  PROJECT-B/     │       │  PROJECT-C/     │            │
│  └────────┬────────┘       └────────┬────────┘       └────────┬────────┘            │
│           │                         │                         │                     │
│   ┌───────┴───────┐                ...                       ...                    │
│   │       │       │                                                                 │
│   ▼       ▼       ▼                                                                 │
│  ai/   workflow/ search/     ← Categories (optional 4-layer)                        │
│   │                                                                                 │
│   ├── chat/                  ← Types                                                │
│   │    │                                                                            │
│   │    ├── session-001.db    ← Entity DBs                                           │
│   │    └── session-002.db                                                           │
│   │                                                                                 │
│   └── embeddings/                                                                   │
│        └── gpt-4.db                                                                 │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                           IMPORT / EXPORT                                     │   │
│  │  ┌─────────────┐    ZIP     ┌─────────────┐    UNZIP    ┌─────────────┐      │   │
│  │  │ project-a/  │ ────────►  │ project-a   │ ──────────► │ project-a/  │      │   │
│  │  │ (folder)    │            │ .zip        │             │ (restored)  │      │   │
│  │  └─────────────┘            └─────────────┘             └─────────────┘      │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Root Database Schema

### Table: projects

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    path TEXT NOT NULL,                    -- Relative path to project folder
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'           -- active, archived, deleted
);

CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_status ON projects(status);
```

### Table: databases

```sql
CREATE TABLE databases (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,                    -- history, cache, config, search, etc.
    entity_id TEXT,                        -- File slug, search ID, etc.
    path TEXT NOT NULL,                    -- Relative path to .db file
    size_bytes INTEGER DEFAULT 0,
    record_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME,
    status TEXT DEFAULT 'active',          -- active, archived, deleted
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_databases_project ON databases(project_id);
CREATE INDEX idx_databases_type ON databases(type);
CREATE INDEX idx_databases_entity ON databases(entity_id);
```

### Table: database_stats

```sql
CREATE TABLE database_stats (
    id TEXT PRIMARY KEY,
    database_id TEXT NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    size_bytes INTEGER,
    record_count INTEGER,
    query_count INTEGER DEFAULT 0,
    avg_query_ms REAL,
    FOREIGN KEY (database_id) REFERENCES databases(id)
);

CREATE INDEX idx_stats_database ON database_stats(database_id);
CREATE INDEX idx_stats_recorded ON database_stats(recorded_at);
```

---

## Database Types

| Type | Purpose | Entity Example | Retention |
|------|---------|----------------|-----------|
| `history` | Version history tracking | File slug | Permanent |
| `cache` | Cached data (search, API) | Cache type | 7-30 days |
| `config` | Configuration/settings | - | Permanent |
| `search` | Search results | Search ID | 30 days |
| `session` | User sessions | Session ID | 24 hours |
| `analytics` | Usage analytics | - | 90 days |
| `logs` | Application logs | Date | 14 days |
| `queue` | Job/task queues | Queue name | Until processed |

---

## Concurrency & Locking

### SQLite WAL Mode

All databases use Write-Ahead Logging for concurrent access:

```go
func (m *DBManager) configureDB(db *sql.DB) error {
    if err := m.enableWALMode(db); err != nil {
        return err
    }

    if err := m.setBusyTimeout(db); err != nil {
        return err
    }

    return m.enableForeignKeys(db)
}

func (m *DBManager) enableWALMode(db *sql.DB) error {
    _, err := db.Exec("PRAGMA journal_mode=WAL")

    return err
}

func (m *DBManager) setBusyTimeout(db *sql.DB) error {
    _, err := db.Exec("PRAGMA busy_timeout=5000")

    return err
}

func (m *DBManager) enableForeignKeys(db *sql.DB) error {
    _, err := db.Exec("PRAGMA foreign_keys=ON")

    return err
}
```

### Connection Pooling

```go
type DBManager struct {
    rootDB    *sql.DB
    dataDir   string
    openDBs   map[string]*sql.DB
    mu        sync.RWMutex
    maxOpen   int           // Max open databases (default: 50)
    maxIdle   int           // Max idle connections per DB (default: 2)
    connLife  time.Duration // Max connection lifetime (default: 1h)
}

func (m *DBManager) getDB(key string) (*sql.DB, bool) {
    m.mu.RLock()
    defer m.mu.RUnlock()

    db, ok := m.openDBs[key]

    return db, ok
}
```

---

## Backup & Recovery

### Incremental Backup

```go
// BackupProject creates a backup of all databases for a project
func (m *DBManager) BackupProject(projectSlug, backupDir string) error {
    dbs, err := m.ListDatabases(projectSlug)
    if err != nil {
        return err
    }

    projectBackupDir := createBackupDir(backupDir, projectSlug)

    return m.backupAllDBs(dbs, projectBackupDir)
}

func createBackupDir(backupDir, projectSlug string) string {
    timestamp := time.Now().Format("20060102-150405")
    dir := filepath.Join(backupDir, projectSlug, timestamp)
    os.MkdirAll(dir, 0755)

    return dir
}

func (m *DBManager) backupAllDBs(dbs []Database, destDir string) error {
    for _, db := range dbs {
        srcPath := filepath.Join(m.dataDir, db.Path)
        dstPath := filepath.Join(destDir, filepath.Base(db.Path))

        if err := m.backupDB(srcPath, dstPath); err != nil {
            return fmt.Errorf("backup failed for %s: %w", db.Path, err)
        }
    }

    return nil
}
```

### Point-in-Time Recovery

```go
// RestoreProject restores databases from a backup
func (m *DBManager) RestoreProject(projectSlug, backupPath string) error {
    // Close all open databases for this project
    m.closeProjectDBs(projectSlug)
    
    // Restore from backup
    return filepath.Walk(backupPath, func(path string, info os.FileInfo, err error) error {
        isSkippable := err != nil || info.IsDir() || !strings.HasSuffix(path, ".db")

        if isSkippable {
            return err
        }
        
        relPath := strings.TrimPrefix(path, backupPath)
        dstPath := filepath.Join(m.dataDir, projectSlug, relPath)
        
        return copyFile(path, dstPath)
    })
}
```

---

## Go Implementation

### DBManager Interface

```go
package splitdb

import (
    "database/sql"
    "fmt"
    "os"
    "path/filepath"
    "sync"
    "time"
    
    _ "github.com/mattn/go-sqlite3"
)

type DBManager struct {
    rootDB    *sql.DB
    dataDir   string
    openDBs   map[string]*sql.DB
    mu        sync.RWMutex
}

type Project struct {
    ID          string
    Slug        string
    DisplayName string
    Path        string
    Status      string
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type Database struct {
    ID           string
    ProjectID    string
    Type         string
    EntityID     string
    Path         string
    SizeBytes    int64
    RecordCount  int64
    Status       string
    CreatedAt    time.Time
    UpdatedAt    time.Time
    LastAccessed *time.Time
}

// NewDBManager creates a new split database manager
func NewDBManager(dataDir string) (*DBManager, error) {
    if err := os.MkdirAll(dataDir, 0755); err != nil {
        return nil, fmt.Errorf("failed to create data dir: %w", err)
    }

    rootDB, err := openRootDB(dataDir)
    if err != nil {
        return nil, err
    }

    return initManager(rootDB, dataDir)
}

func openRootDB(dataDir string) (*sql.DB, error) {
    rootPath := filepath.Join(dataDir, "root.db")

    return sql.Open("sqlite3", rootPath)
}

func initManager(rootDB *sql.DB, dataDir string) (*DBManager, error) {
    manager := &DBManager{
        rootDB:  rootDB,
        dataDir: dataDir,
        openDBs: make(map[string]*sql.DB),
    }

    if err := manager.initRootSchema(); err != nil {
        return nil, err
    }

    return manager, nil
}

// GetOrCreateDB returns a database, creating it if it doesn't exist
func (m *DBManager) GetOrCreateDB(
	projectSlug string,
	dbType string,
	entityID string,
) (*sql.DB, error) {
    m.mu.Lock()
    defer m.mu.Unlock()

    key := fmt.Sprintf("%s/%s/%s", projectSlug, dbType, entityID)
    if db, ok := m.openDBs[key]; ok {
        return db, nil
    }

    return m.openNewDB(projectSlug, dbType, entityID, key)
}

func (m *DBManager) openNewDB(
	projectSlug string,
	dbType string,
	entityID string,
	cacheKey string,
) (*sql.DB, error) {
    project, err := m.getOrCreateProject(projectSlug)
    if err != nil {
        return nil, err
    }

    dbPath := m.buildDBPath(projectSlug, dbType, entityID)
    dbRecord, err := m.getOrCreateDatabase(project.ID, dbType, entityID, dbPath)
    if err != nil {
        return nil, err
    }

    return m.openAndCache(dbRecord, cacheKey)
}

func (m *DBManager) openAndCache(dbRecord *Database, cacheKey string) (*sql.DB, error) {
    dir := filepath.Dir(filepath.Join(m.dataDir, dbRecord.Path))
    if err := os.MkdirAll(dir, 0755); err != nil {
        return nil, fmt.Errorf("failed to create db dir: %w", err)
    }

    fullPath := filepath.Join(m.dataDir, dbRecord.Path)
    db, err := sql.Open("sqlite3", fullPath)
    if err != nil {
        return nil, fmt.Errorf("failed to open db: %w", err)
    }

    m.openDBs[cacheKey] = db
    m.updateLastAccessed(dbRecord.ID)

    return db, nil
}

// ListDatabases returns all databases for a project
func (m *DBManager) ListDatabases(projectSlug string) ([]Database, error) {
    rows, err := m.queryActiveDBs(projectSlug)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    return scanDatabases(rows)
}

func (m *DBManager) queryActiveDBs(projectSlug string) (*sql.Rows, error) {
    query := `
        SELECT d.id, d.project_id, d.type, d.entity_id, d.path, 
               d.size_bytes, d.record_count, d.status, d.created_at, d.updated_at
        FROM databases d
        JOIN projects p ON d.project_id = p.id
        WHERE p.slug = ? AND d.status = 'active'
    `

    return m.rootDB.Query(query, projectSlug)
}

func scanDatabases(rows *sql.Rows) ([]Database, error) {
    var dbs []Database
    for rows.Next() {
        var db Database
        if err := rows.Scan(
            &db.ID, &db.ProjectID, &db.Type, &db.EntityID, &db.Path,
            &db.SizeBytes, &db.RecordCount, &db.Status, &db.CreatedAt, &db.UpdatedAt,
        ); err != nil {
            return nil, err
        }
        dbs = append(dbs, db)
    }

    return dbs, nil
}

// Close closes all open databases
func (m *DBManager) Close() error {
    m.mu.Lock()
    defer m.mu.Unlock()
    
    for _, db := range m.openDBs {
        db.Close()
    }
    m.openDBs = make(map[string]*sql.DB)
    
    return m.rootDB.Close()
}
```

---

## Usage Examples

### History Database Pattern

```go
// Get history database for a specific file
historyDB, err := manager.GetOrCreateDB("my-project", "history", "readme-md")
if err != nil {
    return err
}

// Create history table if not exists
_, err = historyDB.Exec(`
    CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        author TEXT
    )
`)
```

### Cache Database Pattern

```go
// Get cache database for search results
cacheDB, err := manager.GetOrCreateDB("my-project", "cache", "search")
if err != nil {
    return err
}

// Create cache table if not exists
_, err = cacheDB.Exec(`
    CREATE TABLE IF NOT EXISTS search_cache (
        query_hash TEXT PRIMARY KEY,
        results TEXT NOT NULL,          -- JSON encoded
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )
`)
```

---

## File Path Convention

| Component | Pattern | Example |
|-----------|---------|---------|
| Root DB | `{data}/root.db` | `data/root.db` |
| Project Folder | `{data}/{project-slug}/` | `data/my-project/` |
| Type Folder | `{project}/{type}/` | `data/my-project/history/` |
| Entity DB | `{type}/{entity-slug}.db` | `data/my-project/history/readme-md.db` |

### Slug Generation

```go
func GenerateSlug(name string) string {
    slug := strings.ToLower(name)
    slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
    slug = strings.Trim(slug, "-")

    return slug
}
```

---

## Lifecycle Management

### Database Creation

1. Check if project exists in root.db, create if not
2. Check if database record exists, create if not
3. Create directory structure if needed
4. Open SQLite database file
5. Initialize schema (caller responsibility)

### Database Cleanup

```go
// Archive databases not accessed in 30 days
func (m *DBManager) ArchiveStale(maxAge time.Duration) error {
    cutoff := time.Now().Add(-maxAge)
    
    _, err := m.rootDB.Exec(`
        UPDATE databases 
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE last_accessed_at < ? AND status = 'active'
    `, cutoff)
    
    return err
}

// Delete archived databases older than retention period
func (m *DBManager) PurgeArchived(retention time.Duration) error {
    cutoff := time.Now().Add(-retention)

    if err := m.deleteArchivedFiles(cutoff); err != nil {
        return err
    }

    return m.deleteArchivedRecords(cutoff)
}

func (m *DBManager) deleteArchivedFiles(cutoff time.Time) error {
    rows, _ := m.rootDB.Query(`
        SELECT path FROM databases 
        WHERE status = 'archived' AND updated_at < ?
    `, cutoff)
    defer rows.Close()

    for rows.Next() {
        var path string
        rows.Scan(&path)
        os.Remove(filepath.Join(m.dataDir, path))
    }

    return nil
}

func (m *DBManager) deleteArchivedRecords(cutoff time.Time) error {
    _, err := m.rootDB.Exec(`
        DELETE FROM databases 
        WHERE status = 'archived' AND updated_at < ?
    `, cutoff)

    return err
}
```

---

## Import / Export (Zip Files)

### Export Project to Zip

```go
// ExportProjectToZip creates a zip file of all project databases
func (m *DBManager) ExportProjectToZip(projectSlug, outputPath string) error {
    m.logger.Info("Starting export", "project", projectSlug, "output", outputPath)

    projectDir := filepath.Join(m.dataDir, projectSlug)
    if _, err := os.Stat(projectDir); os.IsNotExist(err) {
        return fmt.Errorf("project not found: %s", projectSlug)
    }

    err := m.writeProjectZip(projectDir, outputPath)
    if err != nil {
        return fmt.Errorf("export failed: %w", err)
    }

    m.logger.Info("Export complete", "project", projectSlug, "output", outputPath)

    return nil
}

func (m *DBManager) writeProjectZip(projectDir, outputPath string) error {
    zipFile, err := os.Create(outputPath)
    if err != nil {
        return fmt.Errorf("failed to create zip file: %w", err)
    }
    defer zipFile.Close()

    zipWriter := zip.NewWriter(zipFile)
    defer zipWriter.Close()

    return filepath.Walk(projectDir, func(path string, info os.FileInfo, err error) error {
        return m.addDBFileToZip(zipWriter, projectDir, path, info, err)
    })
}

func (m *DBManager) addDBFileToZip(
	zipWriter *zip.Writer,
	projectDir string,
	path string,
	info os.FileInfo,
	walkErr error,
) error {
    if walkErr != nil {
        m.logger.Warn("Skip file due to error", "path", path, "error", walkErr)

        return nil
    }

    isSkippable := info.IsDir() || !strings.HasSuffix(path, ".db")

    if isSkippable {
        return nil
    }

    relPath, _ := filepath.Rel(projectDir, path)
    m.logger.Debug("Adding to zip", "file", relPath, "size", info.Size())

    return m.copyFileToZip(zipWriter, relPath, path)
}

func (m *DBManager) copyFileToZip(
	zipWriter *zip.Writer,
	relPath string,
	srcPath string,
) error {
    writer, err := zipWriter.Create(relPath)
    if err != nil {
        return err
    }

    file, err := os.Open(srcPath)
    if err != nil {
        return err
    }
    defer file.Close()

    _, err = io.Copy(writer, file)

    return err
}
```

### Import Project from Zip

```go
// ImportProjectFromZip imports databases from a zip file
func (m *DBManager) ImportProjectFromZip(
	zipPath string,
	projectSlug string,
	isOverwrite bool,
) error {
    m.logger.Info("Starting import", "zip", zipPath, "project", projectSlug, "isOverwrite", isOverwrite)

    reader, err := zip.OpenReader(zipPath)
    if err != nil {
        return fmt.Errorf("failed to open zip: %w", err)
    }
    defer reader.Close()

    if err := m.prepareImportDir(projectSlug, isOverwrite); err != nil {
        return err
    }

    return m.extractAndRegister(reader, projectSlug)
}

func (m *DBManager) prepareImportDir(projectSlug string, isOverwrite bool) error {
    projectDir := filepath.Join(m.dataDir, projectSlug)
    _, err := os.Stat(projectDir)
    isProjectExists := err == nil
    isConflict := isProjectExists && !isOverwrite

    if isConflict {
        return fmt.Errorf("project exists, use overwrite=true to replace")
    }

    m.closeProjectDBs(projectSlug)

    return os.MkdirAll(projectDir, 0755)
}


func (m *DBManager) extractAndRegister(reader *zip.ReadCloser, projectSlug string) error {
    projectDir := filepath.Join(m.dataDir, projectSlug)

    if err := m.extractAllFiles(reader, projectDir); err != nil {
        return err
    }

    return m.finalizeImport(projectSlug, len(reader.File))
}

func (m *DBManager) extractAllFiles(reader *zip.ReadCloser, projectDir string) error {
    for _, file := range reader.File {
        if file.FileInfo().IsDir() {
            continue
        }

        if err := m.extractSingleFile(file, projectDir); err != nil {
            return err
        }
    }

    return nil
}

func (m *DBManager) finalizeImport(projectSlug string, fileCount int) error {
    if err := m.registerImportedDatabases(projectSlug); err != nil {
        m.logger.Warn("Failed to register databases", "error", err)
    }

    m.logger.Info("Import complete", "project", projectSlug, "files", fileCount)

    return nil
}

func (m *DBManager) extractSingleFile(file *zip.File, projectDir string) error {
    destPath := filepath.Join(projectDir, file.Name)
    m.logger.Debug("Extracting", "file", file.Name, "size", file.UncompressedSize64)

    if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
        return err
    }

    return m.extractZipFile(file, destPath)
}

func (m *DBManager) extractZipFile(file *zip.File, destPath string) error {
    src, err := file.Open()
    if err != nil {
        return err
    }
    defer src.Close()

    dst, err := os.Create(destPath)
    if err != nil {
        return err
    }
    defer dst.Close()

    _, err = io.Copy(dst, src)

    return err
}
```

### Selective Export (By Type/Category)

```go
// ExportByType exports only specific database types
func (m *DBManager) ExportByType(
	projectSlug string,
	dbTypes []string,
	outputPath string,
) error {
    m.logger.Info("Selective export", "project", projectSlug, "types", dbTypes)

    dbs, err := m.ListDatabases(projectSlug)
    if err != nil {
        return err
    }

    typeSet := toStringSet(dbTypes)
    filtered := filterDBsByType(dbs, typeSet)

    return m.writeFilteredZip(filtered, projectSlug, outputPath)
}

func toStringSet(items []string) map[string]bool {
    set := make(map[string]bool, len(items))
    for _, item := range items {
        set[item] = true
    }

    return set
}

func filterDBsByType(dbs []Database, typeSet map[string]bool) []Database {
    var filtered []Database
    for _, db := range dbs {
        if typeSet[db.Type] {
            filtered = append(filtered, db)
        }
    }

    return filtered
}

func (m *DBManager) writeFilteredZip(
	dbs []Database,
	projectSlug string,
	outputPath string,
) error {
    zipFile, err := os.Create(outputPath)
    if err != nil {
        return err
    }
    defer zipFile.Close()

    zipWriter := zip.NewWriter(zipFile)
    defer zipWriter.Close()

    return m.addFilteredDBsToZip(zipWriter, dbs, projectSlug)
}

func (m *DBManager) addFilteredDBsToZip(
    zipWriter *zip.Writer,
    dbs []Database,
    projectSlug string,
) error {
    for _, db := range dbs {
        m.logger.Debug("Including", "type", db.Type, "path", db.Path)
        relPath := strings.TrimPrefix(db.Path, projectSlug+"/")
        fullPath := filepath.Join(m.dataDir, db.Path)
        m.copyFileToZip(zipWriter, relPath, fullPath)
    }

    return nil
}
```

---

## Logging System

### Structured Logging

All database operations are logged with structured context for debugging and audit:

```go
type DBLogger struct {
    logger *slog.Logger
}

func NewDBLogger(output io.Writer) *DBLogger {
    return &DBLogger{
        logger: slog.New(slog.NewJSONHandler(output, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })),
    }
}

func (l *DBLogger) Info(msg string, args ...any) {
    l.logger.Info(msg, args...)
}

func (l *DBLogger) Debug(msg string, args ...any) {
    l.logger.Debug(msg, args...)
}

func (l *DBLogger) Warn(msg string, args ...any) {
    l.logger.Warn(msg, args...)
}

func (l *DBLogger) Error(msg string, args ...any) {
    l.logger.Error(msg, args...)
}
```

### Operation Logging

```go
// GetOrCreateDB with logging
func (m *DBManager) GetOrCreateDB(
	projectSlug string,
	dbType string,
	entityID string,
) (*sql.DB, error) {
    m.logger.Debug("GetOrCreateDB called", "project", projectSlug, "type", dbType, "entity", entityID)
    startTime := time.Now()

    db, err := m.doGetOrCreateDB(projectSlug, dbType, entityID)
    duration := time.Since(startTime)

    if err != nil {
        m.logDBError(projectSlug, dbType, entityID, err, duration)

        return nil, err
    }

    m.logDBReady(projectSlug, dbType, entityID, duration)

    return db, nil
}

func (m *DBManager) logDBError(
	project string,
	dbType string,
	entity string,
	err error,
	d time.Duration,
) {
    m.logger.Error("GetOrCreateDB failed",
        "project", project, "type", dbType, "entity", entity,
        "error", err, "duration_ms", d.Milliseconds(),
    )
}

func (m *DBManager) logDBReady(
	project string,
	dbType string,
	entity string,
	d time.Duration,
) {
    m.logger.Info("Database ready",
        "project", project, "type", dbType, "entity", entity,
        "duration_ms", d.Milliseconds(),
    )
}
```

### Log Levels by Operation

| Operation | Success Level | Failure Level |
|-----------|---------------|---------------|
| GetOrCreateDB | INFO | ERROR |
| ListDatabases | DEBUG | WARN |
| Export | INFO | ERROR |
| Import | INFO | ERROR |
| Backup | INFO | ERROR |
| Archive/Purge | INFO | ERROR |
| Query Stats | DEBUG | WARN |

### Log Format Examples

```json
// Successful operation
{
  "time": "2026-02-01T10:30:00Z",
  "level": "INFO",
  "msg": "Database ready",
  "project": "my-project",
  "type": "history",
  "entity": "readme-md",
  "duration_ms": 12,
  "cached": false
}

// Export operation
{
  "time": "2026-02-01T10:35:00Z",
  "level": "INFO",
  "msg": "Export complete",
  "project": "my-project",
  "output": "/backups/my-project-2026-02-01.zip",
  "files_count": 15,
  "total_size_bytes": 1048576,
  "duration_ms": 250
}

// Error with context
{
  "time": "2026-02-01T10:40:00Z",
  "level": "ERROR",
  "msg": "Import failed",
  "zip": "/imports/invalid.zip",
  "error": "zip: not a valid zip file",
  "project": "new-project"
}
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Isolation** | Each entity has its own database, preventing table bloat |
| **Performance** | Smaller databases = faster queries |
| **Scalability** | Add new entities without affecting existing ones |
| **Backup** | Backup individual databases or folders |
| **Cleanup** | Easy to archive/delete unused databases |
| **Debugging** | Inspect specific databases in isolation |
| **Portability** | Easy import/export via zip files |
| **Auditability** | Structured logging for all operations |

---

## Applicable Projects

This pattern is used by:

| Project | Usage |
|---------|-------|
| WP Plugin Publish | Site/plugin data, sync state, backup archives |
| Spec Management | File history, search cache |
| GSearch CLI | Search results, cache |
| BRun CLI | Build artifacts, logs |
| AI Bridge | Conversation history, chat DBs |
| Nexus Flow | Workflow state, execution history |

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Seedable Config | [15-seedable-config.md](./15-seedable-config.md) |
| Database Schema | [02-database-schema.md](./02-database-schema.md) |
| Backup Service | [09-backup-service.md](./09-backup-service.md) |

---

*This pattern ensures consistent database organization across all projects.*
