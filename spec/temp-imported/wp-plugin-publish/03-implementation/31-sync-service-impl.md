# 31 — Sync Service Implementation

> **Location:** `spec/wp-plugin-publish/03-implementation/31-sync-service-impl.md`  
> **Updated:** 2026-02-01  
> **Status:** Implementation Spec

---

## Overview

Complete Go implementation for the Sync Service. This service compares local plugin files with remote WordPress installations and manages file change detection.

---

## File Structure

```
backend/internal/services/sync/
├── service.go      # Main service interface and constructor
├── check.go        # Sync checking operations
├── compare.go      # Local vs remote file comparison
├── changes.go      # File change management
└── types.go        # Input/output types
```

---

## Implementation: types.go

```go
package sync

import "time"

// SyncStatusType represents the sync check result status
type SyncStatusType string

const (
	SyncStatusSynced  SyncStatusType = "synced"
	SyncStatusPending SyncStatusType = "pending"
	SyncStatusError   SyncStatusType = "error"
)

// ChangeType represents the type of file change detected
type ChangeType string

const (
	ChangeTypeAdded    ChangeType = "added"
	ChangeTypeModified ChangeType = "modified"
	ChangeTypeDeleted  ChangeType = "deleted"
)

// SyncResult represents the result of a sync check
type SyncResult struct {
	PluginID      int64          `json:"pluginId"`
	SiteID        int64          `json:"siteId"`
	PluginName    string         `json:"pluginName"`
	SiteName      string         `json:"siteName"`
	Status        SyncStatusType `json:"status"`
	TotalFiles    int            `json:"totalFiles"`
	ChangedFiles  int            `json:"changedFiles"`
	AddedFiles    int            `json:"addedFiles"`
	ModifiedFiles int            `json:"modifiedFiles"`
	DeletedFiles  int            `json:"deletedFiles"`
	Changes       []FileChange   `json:"changes"`
	CheckedAt     time.Time      `json:"checkedAt"`
	Error         string         `json:"error,omitempty"`
}

// FileChange represents a detected file difference
type FileChange struct {
	Path        string     `json:"path"`
	ChangeType  ChangeType `json:"type"`
	LocalHash   string     `json:"localHash,omitempty"`
	RemoteHash  string     `json:"remoteHash,omitempty"`
	LocalSize   int64      `json:"localSize,omitempty"`
	RemoteSize  int64      `json:"remoteSize,omitempty"`
	LocalMTime  time.Time  `json:"localMTime,omitempty"`
	RemoteMTime time.Time  `json:"remoteMTime,omitempty"`
}

// SyncOptions configures sync behavior
type SyncOptions struct {
	IncludeUntracked bool `json:"includeUntracked"`
	ForceFullCheck   bool `json:"forceFullCheck"`
}

// BatchSyncResult holds results for multiple sites
type BatchSyncResult struct {
	PluginID int64        `json:"pluginId"`
	Results  []SyncResult `json:"results"`
	Summary  SyncSummary  `json:"summary"`
}

// SyncSummary aggregates sync status across sites
type SyncSummary struct {
	TotalSites    int `json:"totalSites"`
	SyncedSites   int `json:"syncedSites"`
	PendingSites  int `json:"pendingSites"`
	ErrorSites    int `json:"errorSites"`
	TotalChanges  int `json:"totalChanges"`
}

// --- Broadcast detail structs (broadcast_details.go) ---

// SyncStartedEvent is broadcast when a sync check begins
type SyncStartedEvent struct {
	PluginID int64 `json:"pluginId"`
	SiteID   int64 `json:"siteId"`
}

// SyncCompleteEvent is broadcast when a sync check completes
type SyncCompleteEvent struct {
	PluginID     int64  `json:"pluginId"`
	SiteID       int64  `json:"siteId"`
	Status       string `json:"status"`
	ChangedFiles int    `json:"changedFiles"`
}
```

---

## Implementation: service.go

```go
package sync

import (
	"context"

	"wp-plugin-publish/internal/database"
	"wp-plugin-publish/internal/logger"
	"wp-plugin-publish/internal/models"
	"wp-plugin-publish/internal/services/plugin"
	"wp-plugin-publish/internal/wordpress"
	"wp-plugin-publish/internal/ws"
)

// Service interface for sync operations
type Service interface {
	// Sync checking
	CheckSync(ctx context.Context, pluginID, siteID int64) (*SyncResult, error)
	CheckAllSites(ctx context.Context, pluginID int64) (*BatchSyncResult, error)
	CheckAllPlugins(ctx context.Context) ([]SyncResult, error)

	// File change management
	GetFileChanges(ctx context.Context, pluginID, siteID int64) ([]models.FileChange, error)
	RecordFileChange(ctx context.Context, change *models.FileChange) error
	MarkSynced(ctx context.Context, pluginID, siteID int64, files []string) error
	ClearChanges(ctx context.Context, pluginID int64) error
}

// Config holds sync service configuration
type Config struct {
	DB              *database.DB
	Logger          *logger.Logger
	PluginService   plugin.Service
	WPClientFactory func(url, user, pass string) *wordpress.Client
	WSHub           *ws.Hub
}

type serviceImpl struct {
	db              *database.DB
	log             *logger.Logger
	pluginService   plugin.Service
	wpClientFactory func(url, user, pass string) *wordpress.Client
	wsHub           *ws.Hub
}

// New creates a new sync service
func New(cfg Config) Service {
	return &serviceImpl{
		db:              cfg.DB,
		log:             cfg.Logger,
		pluginService:   cfg.PluginService,
		wpClientFactory: cfg.WPClientFactory,
		wsHub:           cfg.WSHub,
	}
}
```

---

## Implementation: check.go

```go
package sync

import (
	"context"
	"time"

	"wp-plugin-publish/internal/models"
	"wp-plugin-publish/internal/services/plugin"
	"wp-plugin-publish/internal/ws"
	"wp-plugin-publish/pkg/apperror"
)

// --- SQL constants ---

const siteSelectForSync = `
	SELECT Id, Name, Url, Username, PasswordEncrypted
	FROM Sites WHERE Id = ?
`

const remoteSlugForSync = `
	SELECT RemoteSlug FROM PluginMappings
	WHERE PluginId = ? AND SiteId = ?
`

const updateSyncStatusQuery = `
	UPDATE PluginMappings
	SET SyncStatus = ?, UpdatedAt = datetime('now')
	WHERE PluginId = ? AND SiteId = ?
`

const allMappingsQuery = `SELECT PluginId, SiteId FROM PluginMappings`

// --- CheckSync entry point ---

func (s *serviceImpl) CheckSync(
	ctx context.Context,
	pluginID int64,
	siteID int64,
) (*SyncResult, error) {
	s.log.Info("Checking sync status", "pluginId", pluginID, "siteId", siteID)
	s.broadcastSyncStarted(pluginID, siteID)

	result := s.newSyncResult(pluginID, siteID)

	return s.executeCheckSync(ctx, result, pluginID, siteID)
}

func (s *serviceImpl) newSyncResult(pluginID, siteID int64) *SyncResult {
	return &SyncResult{
		PluginID:  pluginID,
		SiteID:    siteID,
		CheckedAt: time.Now(),
		Changes:   []FileChange{},
	}
}

func (s *serviceImpl) broadcastSyncStarted(pluginID, siteID int64) {
	s.wsHub.Broadcast(ws.EventSyncStarted, SyncStartedEvent{
		PluginID: pluginID,
		SiteID:   siteID,
	})
}

func (s *serviceImpl) executeCheckSync(
	ctx context.Context,
	result *SyncResult,
	pluginID int64,
	siteID int64,
) (*SyncResult, error) {
	if err := s.populateSyncContext(ctx, result, pluginID, siteID); err != nil {
		return result, err
	}

	localScan, err := s.scanLocalPlugin(ctx, result)
	if err != nil {
		return result, err
	}

	s.analyzeSyncChanges(ctx, result, localScan)
	s.updateMappingSyncStatus(ctx, string(result.Status), pluginID, siteID)
	s.broadcastSyncComplete(result)

	return result, nil
}

func (s *serviceImpl) scanLocalPlugin(ctx context.Context, result *SyncResult) (*plugin.ScanResult, error) {
	localScan, err := s.pluginService.ScanDirectory(ctx, result.pluginPath)
	if err != nil {
		return nil, s.setSyncError(result, err.Error(), err)
	}

	result.TotalFiles = localScan.FileCount

	return localScan, nil
}

// --- Context loading ---

func (s *serviceImpl) populateSyncContext(
	ctx context.Context,
	result *SyncResult,
	pluginID int64,
	siteID int64,
) error {
	if err := s.loadSyncPlugin(ctx, result, pluginID); err != nil {
		return err
	}

	if err := s.loadSyncSite(ctx, result, siteID); err != nil {
		return err
	}

	return s.loadSyncRemoteSlug(ctx, result, pluginID, siteID)
}

func (s *serviceImpl) loadSyncPlugin(
	ctx context.Context,
	result *SyncResult,
	pluginID int64,
) error {
	p, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return s.setSyncError(result, err.Error(), err)
	}

	result.PluginName = p.Name
	result.pluginPath = p.Path

	return nil
}

func (s *serviceImpl) loadSyncSite(
	ctx context.Context,
	result *SyncResult,
	siteID int64,
) error {
	var site models.Site
	err := s.db.QueryRowContext(ctx, siteSelectForSync, siteID).Scan(
		&site.ID, &site.Name, &site.URL, &site.Username, &site.PasswordEncrypted,
	)

	if err != nil {
		return s.setSyncError(result, "site not found", apperror.New(apperror.ErrNotFound, "site not found"))
	}

	result.SiteName = site.Name
	result.site = site

	return nil
}

func (s *serviceImpl) loadSyncRemoteSlug(
	ctx context.Context,
	result *SyncResult,
	pluginID int64,
	siteID int64,
) error {
	var remoteSlug string
	err := s.db.QueryRowContext(ctx, remoteSlugForSync, pluginID, siteID).Scan(&remoteSlug)

	if err != nil {
		return s.setSyncError(result, "plugin not mapped to site", apperror.New(apperror.ErrNotFound, "mapping not found"))
	}

	result.remoteSlug = remoteSlug

	return nil
}

func (s *serviceImpl) setSyncError(
	result *SyncResult,
	msg string,
	err error,
) error {
	result.Status = SyncStatusError
	result.Error = msg

	return err
}

// --- Change analysis ---

func (s *serviceImpl) analyzeSyncChanges(
	ctx context.Context,
	result *SyncResult,
	localScan *plugin.ScanResult,
) {
	wpClient := s.wpClientFactory(result.site.URL, result.site.Username, string(result.site.PasswordEncrypted))
	remoteFiles, err := wpClient.GetPluginFiles(ctx, result.remoteSlug)

	if err != nil {
		s.log.Warn("Could not fetch remote files", "error", err)
		s.markAllFilesAsAdded(result, localScan.Files)

		return
	}

	s.computeSyncDiff(result, localScan.Files, remoteFiles)
}

func (s *serviceImpl) computeSyncDiff(
	result *SyncResult,
	localFiles []plugin.FileInfo,
	remoteFiles []wordpress.RemoteFile,
) {
	result.Changes = s.compareFiles(localFiles, remoteFiles)
	s.tallySyncChanges(result)
	result.ChangedFiles = len(result.Changes)
	result.Status = s.resolveSyncStatus(result.ChangedFiles)
}

func (s *serviceImpl) resolveSyncStatus(changedFiles int) SyncStatusType {
	if changedFiles > 0 {
		return SyncStatusPending
	}

	return SyncStatusSynced
}

func (s *serviceImpl) markAllFilesAsAdded(result *SyncResult, files []plugin.FileInfo) {
	for _, f := range files {
		if f.IsDirectory {
			continue
		}

		result.Changes = append(result.Changes, s.newAddedChange(f))
		result.AddedFiles++
	}

	result.ChangedFiles = result.AddedFiles
	result.Status = SyncStatusPending
}

func (s *serviceImpl) newAddedChange(f plugin.FileInfo) FileChange {
	return FileChange{
		Path:       f.Path,
		ChangeType: ChangeTypeAdded,
		LocalHash:  f.Hash,
		LocalSize:  f.Size,
		LocalMTime: f.ModifiedAt,
	}
}

func (s *serviceImpl) tallySyncChanges(result *SyncResult) {
	for _, c := range result.Changes {
		switch c.ChangeType {
		case ChangeTypeAdded:
			result.AddedFiles++
		case ChangeTypeModified:
			result.ModifiedFiles++
		case ChangeTypeDeleted:
			result.DeletedFiles++
		}
	}
}

func (s *serviceImpl) updateMappingSyncStatus(
	ctx context.Context,
	status string,
	pluginID, siteID int64,
) {
	s.db.ExecContext(ctx, updateSyncStatusQuery, status, pluginID, siteID)
}

func (s *serviceImpl) broadcastSyncComplete(result *SyncResult) {
	s.wsHub.Broadcast(ws.EventSyncComplete, SyncCompleteEvent{
		PluginID:     result.PluginID,
		SiteID:       result.SiteID,
		Status:       string(result.Status),
		ChangedFiles: result.ChangedFiles,
	})
}

// --- Batch operations ---

func (s *serviceImpl) CheckAllSites(
	ctx context.Context,
	pluginID int64,
) (*BatchSyncResult, error) {
	s.log.Info("Checking sync for all sites", "pluginId", pluginID)

	mappings, err := s.pluginService.GetMappings(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	return s.checkMappings(ctx, pluginID, mappings), nil
}

func (s *serviceImpl) checkMappings(
	ctx context.Context,
	pluginID int64,
	mappings []models.PluginMapping,
) *BatchSyncResult {
	batch := &BatchSyncResult{
		PluginID: pluginID,
		Results:  make([]SyncResult, 0, len(mappings)),
		Summary:  SyncSummary{TotalSites: len(mappings)},
	}

	for _, m := range mappings {
		s.checkSingleMapping(ctx, batch, pluginID, m.SiteID)
	}

	return batch
}

func (s *serviceImpl) checkSingleMapping(
	ctx context.Context,
	batch *BatchSyncResult,
	pluginID, siteID int64,
) {
	result, err := s.CheckSync(ctx, pluginID, siteID)
	if err != nil {
		batch.Summary.ErrorSites++
		batch.Results = append(batch.Results, *result)

		return
	}

	s.classifyBatchResult(batch, result)
	batch.Results = append(batch.Results, *result)
}

func (s *serviceImpl) classifyBatchResult(batch *BatchSyncResult, result *SyncResult) {
	switch result.Status {
	case SyncStatusSynced:
		batch.Summary.SyncedSites++
	case SyncStatusPending:
		batch.Summary.PendingSites++
	default:
		batch.Summary.ErrorSites++
	}

	batch.Summary.TotalChanges += result.ChangedFiles
}

func (s *serviceImpl) CheckAllPlugins(ctx context.Context) ([]SyncResult, error) {
	s.log.Info("Checking sync for all plugins")

	mappings, err := s.loadAllMappings(ctx)
	if err != nil {
		return nil, err
	}

	return s.checkAllMappingPairs(ctx, mappings), nil
}

func (s *serviceImpl) loadAllMappings(ctx context.Context) ([][2]int64, error) {
	rows, err := s.db.QueryContext(ctx, allMappingsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mappings [][2]int64
	for rows.Next() {
		var pluginID, siteID int64
		rows.Scan(&pluginID, &siteID)
		mappings = append(mappings, [2]int64{pluginID, siteID})
	}

	return mappings, nil
}

func (s *serviceImpl) checkAllMappingPairs(ctx context.Context, mappings [][2]int64) []SyncResult {
	var results []SyncResult
	for _, m := range mappings {
		result, _ := s.CheckSync(ctx, m[0], m[1])
		if result != nil {
			results = append(results, *result)
		}
	}

	return results
}
```

---

## Implementation: compare.go

```go
package sync

import (
	"wp-plugin-publish/internal/services/plugin"
	"wp-plugin-publish/internal/wordpress"
)

// compareFiles compares local files with remote files and returns differences
func (s *serviceImpl) compareFiles(local []plugin.FileInfo, remote []wordpress.RemoteFile) []FileChange {
	remoteMap := buildRemoteMap(remote)
	localPaths := make(map[string]bool)

	changes := s.findLocalChanges(local, remoteMap, localPaths)

	return append(changes, s.findDeletedFiles(remote, localPaths)...)
}

func (s *serviceImpl) findLocalChanges(
	local []plugin.FileInfo,
	remoteMap map[string]wordpress.RemoteFile,
	localPaths map[string]bool,
) []FileChange {
	var changes []FileChange
	for _, lf := range local {
		if lf.IsDirectory {
			continue
		}

		localPaths[lf.Path] = true
		change := s.compareLocalFile(lf, remoteMap)
		if change != nil {
			changes = append(changes, *change)
		}
	}

	return changes
}

func buildRemoteMap(remote []wordpress.RemoteFile) map[string]wordpress.RemoteFile {
	m := make(map[string]wordpress.RemoteFile)
	for _, f := range remote {
		m[f.Path] = f
	}

	return m
}

func (s *serviceImpl) compareLocalFile(lf plugin.FileInfo, remoteMap map[string]wordpress.RemoteFile) *FileChange {
	rf, exists := remoteMap[lf.Path]
	if !exists {
		return s.newAddedChange(lf)
	}
	if lf.Hash == rf.Hash {
		return nil
	}

	return s.newModifiedChange(lf, rf)
}

func (s *serviceImpl) newAddedChange(lf plugin.FileInfo) *FileChange {
	return &FileChange{
		Path:       lf.Path,
		ChangeType: ChangeTypeAdded,
		LocalHash:  lf.Hash,
		LocalSize:  lf.Size,
		LocalMTime: lf.ModifiedAt,
	}
}

func (s *serviceImpl) newModifiedChange(lf plugin.FileInfo, rf wordpress.RemoteFile) *FileChange {
	return &FileChange{
		Path:        lf.Path,
		ChangeType:  ChangeTypeModified,
		LocalHash:   lf.Hash,
		RemoteHash:  rf.Hash,
		LocalSize:   lf.Size,
		RemoteSize:  rf.Size,
		LocalMTime:  lf.ModifiedAt,
		RemoteMTime: rf.ModifiedAt,
	}
}

func (s *serviceImpl) findDeletedFiles(remote []wordpress.RemoteFile, localPaths map[string]bool) []FileChange {
	var changes []FileChange
	for _, rf := range remote {
		if localPaths[rf.Path] {
			continue
		}

		changes = append(changes, s.newDeletedChange(rf))
	}

	return changes
}

func (s *serviceImpl) newDeletedChange(rf wordpress.RemoteFile) FileChange {
	return FileChange{
		Path:        rf.Path,
		ChangeType:  ChangeTypeDeleted,
		RemoteHash:  rf.Hash,
		RemoteSize:  rf.Size,
		RemoteMTime: rf.ModifiedAt,
	}
}
```

---

## Implementation: changes.go

```go
package sync

import (
	"context"
	"database/sql"
	"time"

	"wp-plugin-publish/internal/models"
	"wp-plugin-publish/pkg/apperror"
)

// --- SQL constants ---

const fileChangesQuery = `
	SELECT Id, PluginId, FilePath, ChangeType, LocalHash, RemoteHash,
	       LocalModifiedAt, DetectedAt, SyncedAt
	FROM FileChanges
	WHERE PluginId = ? AND SyncedAt IS NULL
	ORDER BY DetectedAt DESC
`

const insertFileChangeQuery = `
	INSERT INTO FileChanges (PluginId, FilePath, ChangeType, LocalHash, LocalModifiedAt, DetectedAt)
	VALUES (?, ?, ?, ?, ?, datetime('now'))
`

const updateFileChangeQuery = `
	UPDATE FileChanges
	SET ChangeType = ?, LocalHash = ?, LocalModifiedAt = ?, DetectedAt = datetime('now')
	WHERE Id = ?
`

const existingChangeQuery = `
	SELECT Id FROM FileChanges
	WHERE PluginId = ? AND FilePath = ? AND SyncedAt IS NULL
`

const markSyncedQuery = `
	UPDATE FileChanges
	SET SyncedAt = datetime('now')
	WHERE PluginId = ? AND FilePath = ? AND SyncedAt IS NULL
`

const updateMappingAfterSyncQuery = `
	UPDATE PluginMappings
	SET SyncStatus = 'synced', LastSyncAt = datetime('now'), UpdatedAt = datetime('now')
	WHERE PluginId = ? AND SiteId = ?
`

// --- GetFileChanges ---

func (s *serviceImpl) GetFileChanges(
	ctx context.Context,
	pluginID int64,
	siteID int64,
) ([]models.FileChange, error) {
	rows, err := s.db.QueryContext(ctx, fileChangesQuery, pluginID)
	if err != nil {
		return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get file changes")
	}
	defer rows.Close()

	return s.scanFileChangeRows(rows)
}

func (s *serviceImpl) scanFileChangeRows(rows *sql.Rows) ([]models.FileChange, error) {
	var changes []models.FileChange
	for rows.Next() {
		c, err := s.scanSingleFileChange(rows)
		if err != nil {
			continue
		}

		changes = append(changes, c)
	}

	return changes, nil
}

func (s *serviceImpl) scanSingleFileChange(rows *sql.Rows) (models.FileChange, error) {
	var c models.FileChange
	var localModAt, syncedAt sql.NullString

	err := rows.Scan(
		&c.ID, &c.PluginID, &c.FilePath, &c.ChangeType,
		&c.LocalHash, &c.RemoteHash, &localModAt, &c.DetectedAt, &syncedAt,
	)

	if err != nil {
		return c, err
	}

	s.parseFileChangeDates(&c, localModAt, syncedAt)

	return c, nil
}

func (s *serviceImpl) parseFileChangeDates(
	c *models.FileChange,
	localModAt, syncedAt sql.NullString,
) {
	if localModAt.Valid {
		t, _ := time.Parse(time.RFC3339, localModAt.String)
		c.LocalModifiedAt = &t
	}

	if syncedAt.Valid {
		t, _ := time.Parse(time.RFC3339, syncedAt.String)
		c.SyncedAt = &t
	}
}

// --- RecordFileChange ---

func (s *serviceImpl) RecordFileChange(ctx context.Context, change *models.FileChange) error {
	var existingID int64
	err := s.db.QueryRowContext(ctx, existingChangeQuery, change.PluginID, change.FilePath).Scan(&existingID)

	if err == sql.ErrNoRows {
		return s.insertFileChange(ctx, change)
	}

	if err != nil {
		return err
	}

	return s.updateFileChange(ctx, change, existingID)
}

func (s *serviceImpl) insertFileChange(ctx context.Context, change *models.FileChange) error {
	_, err := s.db.ExecContext(ctx, insertFileChangeQuery,
		change.PluginID, change.FilePath, change.ChangeType, change.LocalHash, change.LocalModifiedAt,
	)

	return err
}

func (s *serviceImpl) updateFileChange(
	ctx context.Context,
	change *models.FileChange,
	existingID int64,
) error {
	_, err := s.db.ExecContext(ctx, updateFileChangeQuery,
		change.ChangeType, change.LocalHash, change.LocalModifiedAt, existingID,
	)

	return err
}

// --- MarkSynced ---

func (s *serviceImpl) MarkSynced(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	files []string,
) error {
	s.log.Info("Marking files as synced", "pluginId", pluginID, "siteId", siteID, "files", len(files))

	if err := s.markFilesAsSynced(ctx, pluginID, files); err != nil {
		return err
	}

	return s.updateMappingAfterSync(ctx, pluginID, siteID)
}

func (s *serviceImpl) markFilesAsSynced(
	ctx context.Context,
	pluginID int64,
	files []string,
) error {
	for _, path := range files {
		_, err := s.db.ExecContext(ctx, markSyncedQuery, pluginID, path)
		if err != nil {
			return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to mark file synced")
		}
	}

	return nil
}

func (s *serviceImpl) updateMappingAfterSync(
	ctx context.Context,
	pluginID, siteID int64,
) error {
	_, err := s.db.ExecContext(ctx, updateMappingAfterSyncQuery, pluginID, siteID)

	return err
}

// --- ClearChanges ---

func (s *serviceImpl) ClearChanges(ctx context.Context, pluginID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM FileChanges WHERE PluginId = ?`, pluginID)

	return err
}
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS FileChanges (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PluginId INTEGER NOT NULL,
    FilePath TEXT NOT NULL,
    ChangeType TEXT NOT NULL, -- added, modified, deleted
    LocalHash TEXT,
    RemoteHash TEXT,
    LocalModifiedAt TEXT,
    DetectedAt TEXT NOT NULL,
    SyncedAt TEXT,
    FOREIGN KEY (PluginId) REFERENCES Plugins(Id)
);

CREATE INDEX IF NOT EXISTS idx_changes_plugin ON FileChanges(PluginId);
CREATE INDEX IF NOT EXISTS idx_changes_synced ON FileChanges(SyncedAt);
```

---

## API Endpoints

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/api/sync/check/:pluginId/:siteId` | Check sync status |
| GET | `/api/sync/check/:pluginId` | Check all sites for plugin |
| GET | `/api/sync/check` | Check all mappings |
| GET | `/api/sync/changes/:pluginId/:siteId` | Get file changes |
| POST | `/api/sync/mark-synced` | Mark files as synced |

---

*See also: [32-publish-service-impl.md](32-publish-service-impl.md)*
