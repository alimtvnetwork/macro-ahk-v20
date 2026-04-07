# 05 — Plugin Service

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The Plugin Service manages local plugin directories, including registration, file scanning, hash calculation, and mapping to remote WordPress sites.

---

## Interface

```go
// internal/services/plugin/service.go
package plugin

import (
    "context"
    
    "wp-plugin-publish/internal/models"
)

type Service interface {
    // CRUD operations
    List(ctx context.Context) ([]models.Plugin, error)
    ListBySite(ctx context.Context, siteID int64) ([]models.Plugin, error)
    GetByID(ctx context.Context, id int64) (*models.Plugin, error)
    Create(ctx context.Context, input CreateInput) (*models.Plugin, error)
    Update(ctx context.Context, id int64, input UpdateInput) (*models.Plugin, error)
    Delete(ctx context.Context, id int64) error
    
    // Directory scanning
    ScanDirectory(ctx context.Context, path string) (*DirectoryScan, error)
    ValidatePath(ctx context.Context, path string) error
    
    // Hash management
    CalculateHash(ctx context.Context, id int64) (string, error)
    UpdateHash(ctx context.Context, id int64, hash string) error
    
    // Watcher management
    SetWatching(ctx context.Context, id int64, watching bool) error
    GetWatchedPlugins(ctx context.Context) ([]models.Plugin, error)
    
    // Status
    UpdateLastPublished(ctx context.Context, id int64) error
}
```

---

## Data Types

### Plugin Model

```go
// internal/models/plugin.go
package models

import "time"

type Plugin struct {
    ID              int64      `json:"id"`
    Name            string     `json:"name"`
    LocalPath       string     `json:"localPath"`
    RemoteSlug      string     `json:"remoteSlug"`
    SiteID          int64      `json:"siteId"`
    IsActive        bool       `json:"isActive"`
    IsWatching      bool       `json:"isWatching"`
    LastPublishedAt *time.Time `json:"lastPublishedAt,omitempty"`
    LastHash        string     `json:"lastHash,omitempty"`
    CreatedAt       time.Time  `json:"createdAt"`
    UpdatedAt       time.Time  `json:"updatedAt"`
    
    // Joined data
    Site            *Site      `json:"site,omitempty"`
}

// PluginWithStatus includes sync and file status
type PluginWithStatus struct {
    Plugin
    PendingChanges  int    `json:"pendingChanges"`
    TotalFiles      int    `json:"totalFiles"`
    TotalSize       int64  `json:"totalSize"`
    RemoteVersion   string `json:"remoteVersion,omitempty"`
    LocalVersion    string `json:"localVersion,omitempty"`
    IsSynced        bool   `json:"isSynced"`
}
```

### Input Types

```go
// internal/services/plugin/types.go
package plugin

type CreateInput struct {
    Name       string `json:"name" validate:"required,max=255"`
    LocalPath  string `json:"localPath" validate:"required,max=4096"`
    RemoteSlug string `json:"remoteSlug" validate:"required,max=255,lowercase"`
    SiteID     int64  `json:"siteId" validate:"required"`
}

type UpdateInput struct {
    Name       *string `json:"name,omitempty" validate:"omitempty,max=255"`
    LocalPath  *string `json:"localPath,omitempty" validate:"omitempty,max=4096"`
    RemoteSlug *string `json:"remoteSlug,omitempty" validate:"omitempty,max=255,lowercase"`
    IsActive   *bool   `json:"isActive,omitempty"`
}

type DirectoryScan struct {
    Path        string     `json:"path"`
    IsValid     bool       `json:"isValid"`
    PluginName  string     `json:"pluginName,omitempty"`
    Version     string     `json:"version,omitempty"`
    MainFile    string     `json:"mainFile,omitempty"`
    Files       []FileInfo `json:"files"`
    TotalSize   int64      `json:"totalSize"`
    Error       string     `json:"error,omitempty"`
}

type FileInfo struct {
    Path         string    `json:"path"`         // Relative path within plugin
    Size         int64     `json:"size"`
    Hash         string    `json:"hash"`         // MD5 or SHA256
    ModifiedAt   time.Time `json:"modifiedAt"`
    IsDirectory  bool      `json:"isDirectory"`
}
```

---

## Implementation

### Service Constructor

```go
// internal/services/plugin/service.go
package plugin

import (
    "database/sql"
    
    "wp-plugin-publish/internal/logger"
    "wp-plugin-publish/internal/services/site"
)

type serviceImpl struct {
    db          *sql.DB
    siteService site.Service
    log         *logger.Logger
}

func New(
	db *sql.DB,
	siteService site.Service,
	log *logger.Logger,
) Service {
    return &serviceImpl{
        db:          db,
        siteService: siteService,
        log:         log,
    }
}
```

### CRUD Operations

```go
// internal/services/plugin/crud.go
package plugin

import (
    "context"
    "database/sql"
    "strings"
    "time"
    
    "wp-plugin-publish/internal/models"
    "wp-plugin-publish/pkg/apperror"
)

const pluginSelectQuery = `
    SELECT p.Id, p.Name, p.LocalPath, p.RemoteSlug, p.SiteId, 
           p.IsActive, p.IsWatching, p.LastPublishedAt, p.LastHash,
           p.CreatedAt, p.UpdatedAt,
           s.Id, s.Name, s.Url
    FROM Plugins p
    JOIN Sites s ON p.SiteId = s.Id`

func (s *serviceImpl) List(ctx context.Context) ([]models.Plugin, error) {
    s.log.Debug("Listing all plugins")

    rows, err := s.db.QueryContext(ctx, pluginSelectQuery+" ORDER BY p.Name ASC")
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to list plugins")
    }
    defer rows.Close()

    return s.scanPlugins(rows)
}

func (s *serviceImpl) ListBySite(ctx context.Context, siteID int64) ([]models.Plugin, error) {
    s.log.Debug("Listing plugins by site", "site_id", siteID)

    rows, err := s.db.QueryContext(ctx, pluginSelectQuery+" WHERE p.SiteId = ? ORDER BY p.Name ASC", siteID)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to list plugins by site")
    }
    defer rows.Close()

    return s.scanPlugins(rows)
}

func (s *serviceImpl) GetByID(ctx context.Context, id int64) (*models.Plugin, error) {
    s.log.Debug("Getting plugin by ID", "plugin_id", id)

    raw, err := s.queryPluginByID(ctx, id)
    if err != nil {
        return nil, err
    }

    return s.finalizePlugin(raw)
}

// pluginScanRow holds raw scan output including nullable fields.
type pluginScanRow struct {
    plugin        models.Plugin
    site          models.Site
    lastPublished sql.NullString
    lastHash      sql.NullString
}

func (s *serviceImpl) queryPluginByID(ctx context.Context, id int64) (*pluginScanRow, error) {
    row := &pluginScanRow{}
    err := s.scanPluginRow(ctx, row, id)

    if err == sql.ErrNoRows {
        return nil, apperror.New(apperror.ErrNotFound, "plugin not found").WithContext("plugin_id", id)
    }
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get plugin")
    }

    return row, nil
}

func (s *serviceImpl) scanPluginRow(
    ctx context.Context,
    row *pluginScanRow,
    id int64,
) error {
    return s.db.QueryRowContext(ctx, pluginSelectQuery+" WHERE p.Id = ?", id).Scan(
        &row.plugin.ID, &row.plugin.Name, &row.plugin.LocalPath, &row.plugin.RemoteSlug,
        &row.plugin.SiteID, &row.plugin.IsActive, &row.plugin.IsWatching,
        &row.lastPublished, &row.lastHash, &row.plugin.CreatedAt, &row.plugin.UpdatedAt,
        &row.site.ID, &row.site.Name, &row.site.URL,
    )
}

func (s *serviceImpl) finalizePlugin(raw *pluginScanRow) (*models.Plugin, error) {
    if raw.lastPublished.Valid {
        t, _ := time.Parse(time.RFC3339, raw.lastPublished.String)
        raw.plugin.LastPublishedAt = &t
    }
    if raw.lastHash.Valid {
        raw.plugin.LastHash = raw.lastHash.String
    }

    raw.plugin.Site = &raw.site

    return &raw.plugin, nil
}

func (s *serviceImpl) Create(ctx context.Context, input CreateInput) (*models.Plugin, error) {
    s.log.Info("Creating plugin", "name", input.Name, "path", input.LocalPath)

    if err := s.validateCreateInput(ctx, input); err != nil {
        return nil, err
    }
    if err := s.checkDuplicatePlugin(ctx, input); err != nil {
        return nil, err
    }
    if err := s.ValidatePath(ctx, input.LocalPath); err != nil {
        return nil, err
    }

    return s.insertPlugin(ctx, input)
}

func (s *serviceImpl) checkDuplicatePlugin(ctx context.Context, input CreateInput) error {
    if _, err := s.siteService.GetByID(ctx, input.SiteID); err != nil {
        return err
    }

    var exists int
    err := s.db.QueryRowContext(ctx,
        "SELECT 1 FROM Plugins WHERE LocalPath = ? AND SiteId = ?",
        input.LocalPath, input.SiteID,
    ).Scan(&exists)

    if err != sql.ErrNoRows {
        return apperror.New(apperror.ErrDuplicate, "plugin already registered for this site").
            WithContext("path", input.LocalPath).WithContext("site_id", input.SiteID)
    }

    return nil
}

func (s *serviceImpl) insertPlugin(ctx context.Context, input CreateInput) (*models.Plugin, error) {
    hash, _ := s.calculateDirectoryHash(input.LocalPath)

    result, err := s.db.ExecContext(ctx, `
        INSERT INTO Plugins (Name, LocalPath, RemoteSlug, SiteId, IsActive, IsWatching, LastHash, CreatedAt, UpdatedAt)
        VALUES (?, ?, ?, ?, 1, 0, ?, datetime('now'), datetime('now'))
    `, input.Name, input.LocalPath, strings.ToLower(input.RemoteSlug), input.SiteID, hash)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to create plugin")
    }

    id, _ := result.LastInsertId()
    s.log.Info("Plugin created", "plugin_id", id, "name", input.Name)

    return s.GetByID(ctx, id)
}

func (s *serviceImpl) Delete(ctx context.Context, id int64) error {
    s.log.Info("Deleting plugin", "plugin_id", id)

    if _, err := s.GetByID(ctx, id); err != nil {
        return err
    }

    _, err := s.db.ExecContext(ctx, "DELETE FROM Plugins WHERE Id = ?", id)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to delete plugin")
    }

    s.log.Info("Plugin deleted", "plugin_id", id)

    return nil
}
```

### Directory Scanning

```go
// internal/services/plugin/scanner.go
package plugin

import (
    "bufio"
    "context"
    "os"
    "path/filepath"
    "regexp"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

var (
    pluginNameRegex = regexp.MustCompile(`Plugin Name:\s*(.+)`)
    versionRegex    = regexp.MustCompile(`Version:\s*(.+)`)
)

func (s *serviceImpl) ScanDirectory(ctx context.Context, path string) (*DirectoryScan, error) {
    s.log.Debug("Scanning directory", "path", path)

    scan, err := s.validatePluginDir(path)
    hasValidationResult := scan != nil || err != nil

    if hasValidationResult {
    }

    return s.buildDirectoryScan(ctx, path)
}

func (s *serviceImpl) validatePluginDir(path string) (*DirectoryScan, error) {
    scan := &DirectoryScan{Path: path, IsValid: false, Files: []FileInfo{}}

    info, err := os.Stat(path)
    if os.IsNotExist(err) {
        scan.Error = "directory does not exist"

        return scan, nil
    }
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDirRead, "failed to stat directory")
    }
    isFile := !info.IsDir()

    if isFile {
        scan.Error = "path is not a directory"

        return scan, nil
    }

    return nil, nil
}

func (s *serviceImpl) buildDirectoryScan(ctx context.Context, path string) (*DirectoryScan, error) {
    scan := &DirectoryScan{Path: path, Files: []FileInfo{}}

    mainFile, pluginName, version, err := s.findMainPluginFile(path)
    if err != nil {
        scan.Error = err.Error()

        return scan, nil
    }

    scan.IsValid = true
    scan.MainFile = mainFile
    scan.PluginName = pluginName
    scan.Version = version

    return s.collectPluginFiles(path, scan)
}

func (s *serviceImpl) collectPluginFiles(path string, scan *DirectoryScan) (*DirectoryScan, error) {
    err := filepath.Walk(path, func(fp string, info os.FileInfo, err error) error {
        return s.processWalkEntry(path, fp, info, err, scan)
    })
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDirRead, "failed to scan directory")
    }

    s.log.Info("Directory scanned", "path", path, "files", len(scan.Files), "size", scan.TotalSize)

    return scan, nil
}

func (s *serviceImpl) processWalkEntry(
    basePath string,
    filePath string,
    info os.FileInfo,
    walkErr error,
    scan *DirectoryScan,
) error {
    if walkErr != nil {
        return nil
    }

    relPath, _ := filepath.Rel(basePath, filePath)
    if relPath == "." {
        return nil
    }
    if shouldSkipEntry(filepath.Base(filePath), info.IsDir()) {
        return skipOrContinue(info.IsDir())
    }

    appendFileEntry(scan, filePath, relPath, info)

    return nil
}

func appendFileEntry(
    scan *DirectoryScan,
    fullPath string,
    relPath string,
    info os.FileInfo,
) {
    scan.Files = append(scan.Files, buildFileInfo(fullPath, relPath, info))
    isFile := !info.IsDir()

    if isFile {
        scan.TotalSize += info.Size()
    }
}

func shouldSkipEntry(base string, isDir bool) bool {
    return strings.HasPrefix(base, ".") || base == "node_modules" || base == "vendor"
}

func skipOrContinue(isDir bool) error {
    if isDir {
        return filepath.SkipDir
    }

    return nil
}

func buildFileInfo(
    fullPath string,
    relPath string,
    info os.FileInfo,
) FileInfo {
    fi := FileInfo{
        Path: relPath, Size: info.Size(),
        ModifiedAt: info.ModTime(), IsDirectory: info.IsDir(),
    }
    isFile := !info.IsDir()

    if isFile {
        fi.Hash, _ = calculateFileHash(fullPath)
    }

    return fi
}

func (s *serviceImpl) ValidatePath(ctx context.Context, path string) error {
    scan, err := s.ScanDirectory(ctx, path)
    if err != nil {
        return err
    }
    isInvalid := !scan.IsValid

    if isInvalid {
    }

    return nil
}

func (s *serviceImpl) findMainPluginFile(path string) (string, string, string, error) {
    entries, err := os.ReadDir(path)
    if err != nil {
        return "", "", "", err
    }

    return searchPHPHeaders(path, entries)
}

func searchPHPHeaders(dir string, entries []os.DirEntry) (string, string, string, error) {
    for _, entry := range entries {
        isPHP := !entry.IsDir() && strings.HasSuffix(entry.Name(), ".php")

        if !isPHP {
            continue
        }

        name, version := parsePluginHeader(filepath.Join(dir, entry.Name()))
        hasPluginName := name != ""

        if hasPluginName {
            return entry.Name(), name, version, nil
        }
    }

    return "", "", "", apperror.New(apperror.ErrPathInvalid,
        "no valid WordPress plugin file found (missing Plugin Name header)")
}

func parsePluginHeader(filePath string) (string, string) {
    file, err := os.Open(filePath)
    if err != nil {
        return "", ""
    }
    defer file.Close()

    scanner := bufio.NewScanner(file)
    var pluginName, version string

    for lineCount := 0; scanner.Scan() && lineCount < 30; lineCount++ {
        pluginName = extractMatch(pluginNameRegex, scanner.Text(), pluginName)
        version = extractMatch(versionRegex, scanner.Text(), version)
    }

    return pluginName, version
}

func extractMatch(
    re *regexp.Regexp,
    line string,
    current string,
) string {
    if matches := re.FindStringSubmatch(line); len(matches) > 1 {
        return strings.TrimSpace(matches[1])
    }

    return current
}
```

### Hash Calculation

```go
// internal/services/plugin/hasher.go
package plugin

import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "os"
    "path/filepath"
    "sort"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) CalculateHash(ctx context.Context, id int64) (string, error) {
    plugin, err := s.GetByID(ctx, id)
    if err != nil {
        return "", err
    }

    return s.calculateDirectoryHash(plugin.LocalPath)
}

func (s *serviceImpl) UpdateHash(
	ctx context.Context,
	id int64,
	hash string,
) error {
    _, err := s.db.ExecContext(ctx,
        "UPDATE Plugins SET LastHash = ?, UpdatedAt = datetime('now') WHERE Id = ?",
        hash, id,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update plugin hash")
    }

    return nil
}

func (s *serviceImpl) calculateDirectoryHash(path string) (string, error) {
    fileHashes, err := collectFileHashes(path)
    if err != nil {
        return "", apperror.Wrap(err, apperror.ErrDirRead, "failed to walk directory")
    }

    sort.Strings(fileHashes)

    return hashEntries(fileHashes), nil
}

func collectFileHashes(path string) ([]string, error) {
    var hashes []string

    err := filepath.Walk(path, func(fp string, info os.FileInfo, err error) error {
        return appendFileHash(path, fp, info, err, &hashes)
    })

    return hashes, err
}

func appendFileHash(
    basePath string,
    fp string,
    info os.FileInfo,
    walkErr error,
    hashes *[]string,
) error {
    isSkippable := walkErr != nil || info.IsDir() || strings.HasPrefix(filepath.Base(fp), ".")
    if isSkippable {
        return nil
    }

    relPath, _ := filepath.Rel(basePath, fp)
    fileHash, err := calculateFileHash(fp)
    if err != nil {
        return nil
    }

    *hashes = append(*hashes, relPath+":"+fileHash)

    return nil
}

func hashEntries(entries []string) string {
    hasher := sha256.New()
    for _, e := range entries {
        hasher.Write([]byte(e))
    }

    return hex.EncodeToString(hasher.Sum(nil))
}

func calculateFileHash(path string) (string, error) {
    file, err := os.Open(path)
    if err != nil {
        return "", err
    }
    defer file.Close()

    hasher := sha256.New()
    if _, err := io.Copy(hasher, file); err != nil {
        return "", err
    }

    return hex.EncodeToString(hasher.Sum(nil)), nil
}
```

### Watcher Management

```go
// internal/services/plugin/watcher.go
package plugin

import (
    "context"
    
    "wp-plugin-publish/internal/models"
    "wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) SetWatching(
	ctx context.Context,
	id int64,
	watching bool,
) error {
    s.log.Info("Setting plugin watching status", "plugin_id", id, "watching", watching)

    watchingInt := boolToInt(watching)

    _, err := s.db.ExecContext(ctx,
        "UPDATE Plugins SET IsWatching = ?, UpdatedAt = datetime('now') WHERE Id = ?",
        watchingInt, id,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update watching status")
    }

    return nil
}

func boolToInt(b bool) int {
    if b {
        return 1
    }

    return 0
}

func (s *serviceImpl) GetWatchedPlugins(ctx context.Context) ([]models.Plugin, error) {
    s.log.Debug("Getting watched plugins")

    rows, err := s.db.QueryContext(ctx, pluginSelectQuery+" WHERE p.IsWatching = 1 AND p.IsActive = 1 ORDER BY p.Name ASC")
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get watched plugins")
    }
    defer rows.Close()

    return s.scanPlugins(rows)
}

func (s *serviceImpl) UpdateLastPublished(ctx context.Context, id int64) error {
    _, err := s.db.ExecContext(ctx,
        "UPDATE Plugins SET LastPublishedAt = datetime('now'), UpdatedAt = datetime('now') WHERE Id = ?",
        id,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update last published")
    }

    return nil
}
```

### Validation

```go
// internal/services/plugin/validator.go
package plugin

import (
    "context"
    "path/filepath"
    "regexp"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

var slugRegex = regexp.MustCompile(`^[a-z0-9-]+$`)

func (s *serviceImpl) validateCreateInput(ctx context.Context, input CreateInput) error {
    if err := validatePluginName(input.Name); err != nil {
        return err
    }
    if err := validateLocalPath(input.LocalPath); err != nil {
        return err
    }

    return validateRemoteSlug(input.RemoteSlug)
}

func validatePluginName(name string) error {
    isNameEmpty := strings.TrimSpace(name) == ""

    if isNameEmpty {
        return apperror.New(apperror.ErrValidationEmpty, "plugin name is required")
    }
    isNameTooLong := len(name) > 255

    if isNameTooLong {
        return apperror.New(apperror.ErrValidationLength, "plugin name must be 255 characters or less")
    }

    return nil
}

func validateLocalPath(path string) error {
    isPathEmpty := strings.TrimSpace(path) == ""

    if isPathEmpty {
        return apperror.New(apperror.ErrValidationEmpty, "local path is required")
    }
    isRelativePath := !filepath.IsAbs(path)

    if isRelativePath {
        return apperror.New(apperror.ErrValidationPath, "local path must be absolute")
    }
    isPathTooLong := len(path) > 4096

    if isPathTooLong {
        return apperror.New(apperror.ErrValidationLength, "local path must be 4096 characters or less")
    }

    return nil
}

func validateRemoteSlug(slug string) error {
    isSlugEmpty := strings.TrimSpace(slug) == ""

    if isSlugEmpty {
        return apperror.New(apperror.ErrValidationEmpty, "remote slug is required")
    }

    normalized := strings.ToLower(strings.TrimSpace(slug))
    isSlugInvalid := !slugRegex.MatchString(normalized)

    if isSlugInvalid {
        return apperror.New(apperror.ErrValidationFormat,
            "remote slug must be lowercase with only letters, numbers, and hyphens")
    }
    isSlugTooLong := len(slug) > 255

    if isSlugTooLong {
        return apperror.New(apperror.ErrValidationLength, "remote slug must be 255 characters or less")
    }

    return nil
}
```

---

## Error Scenarios

| Scenario | Error Code | HTTP Status |
|----------|------------|-------------|
| Plugin not found | E2005 | 404 |
| Duplicate plugin+site | E2006 | 409 |
| Path not found | E4009 | 400 |
| Invalid plugin directory | E4008 | 400 |
| Invalid slug format | E6006 | 400 |

---

## Next Document

See [06-file-watcher.md](./06-file-watcher.md) for file change detection.
