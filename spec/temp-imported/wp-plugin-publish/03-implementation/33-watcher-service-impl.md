# 33 — File Watcher Service Implementation

> **Location:** `spec/wp-plugin-publish/03-implementation/33-watcher-service-impl.md`  
> **Updated:** 2026-02-01  
> **Status:** Implementation Spec

---

## Overview

**Hybrid Mode Implementation**: The File Watcher Service uses an event-driven approach instead of constant polling. Scans are triggered only by:
1. **Git Pull** - Automatic scan after commits are pulled
2. **Manual Trigger** - User clicks "Refresh" button in UI

This is more efficient than polling every N seconds since it only runs when changes are expected.

---

## File Structure

```
backend/internal/services/watcher/
├── service.go      # Main service interface and constructor
├── scanner.go      # Directory scanning with hash comparison
└── types.go        # Types and configuration
```

---

## Design: No Polling Mode

```
┌─────────────────────────────────────────────────────────────┐
│                    Hybrid Watcher Mode                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Trigger Sources:                                            │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Git Pull      │    │  Manual Refresh │                 │
│  │  (auto-trigger) │    │   (UI button)   │                 │
│  └────────┬────────┘    └────────┬────────┘                 │
│           │                       │                          │
│           └───────────┬───────────┘                          │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │   Scan Plugin   │                             │
│              │   Directory     │                             │
│              └────────┬────────┘                             │
│                       │                                      │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │ Detect Changes  │                             │
│              │ (hash compare)  │                             │
│              └────────┬────────┘                             │
│                       │                                      │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │  Broadcast via  │                             │
│              │   WebSocket     │                             │
│              └─────────────────┘                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation: types.go

```go
package watcher

import "time"

// WatcherChangeType represents the type of file change detected by the watcher
type WatcherChangeType string

const (
	WatcherChangeCreated  WatcherChangeType = "created"
	WatcherChangeModified WatcherChangeType = "modified"
	WatcherChangeDeleted  WatcherChangeType = "deleted"
	WatcherChangeRenamed  WatcherChangeType = "renamed"
)

// FileChange represents a detected file modification
type FileChange struct {
	Path       string            `json:"path"`
	ChangeType WatcherChangeType `json:"type"`
	OldPath    string            `json:"oldPath,omitempty"`
	Hash       string            `json:"hash,omitempty"`
	Size       int64             `json:"size,omitempty"`
	ModTime    time.Time         `json:"modTime,omitempty"`
}

// ScanResult contains the outcome of a directory scan
type ScanResult struct {
	PluginID     int64        `json:"pluginId"`
	Path         string       `json:"path"`
	ScanTime     time.Time    `json:"scanTime"`
	DurationMs   int64        `json:"durationMs"`
	FilesScanned int          `json:"filesScanned"`
	Changes      []FileChange `json:"changes"`
	TriggerType  string       `json:"triggerType"` // "git_pull" or "manual"
}

// fileInfo holds cached file metadata for change detection
type fileInfo struct {
	ModTime int64
	Size    int64
	Hash    string
}

// --- Broadcast detail structs (broadcast_details.go) ---

// FileChangeEvent is broadcast when file changes are detected
type FileChangeEvent struct {
	PluginID int64              `json:"pluginId"`
	Changes  []FileChange       `json:"changes"`
	Summary  FileChangeSummary  `json:"summary"`
}

// FileChangeSummary counts changes by type
type FileChangeSummary struct {
	Created  int `json:"created"`
	Modified int `json:"modified"`
	Deleted  int `json:"deleted"`
}

// pluginScanCache stores the last known state of a plugin's files
type pluginScanCache struct {
	pluginID int64
	path     string
	excludes []string
	lastScan map[string]fileInfo
}
```

---

## Implementation: service.go

```go
package watcher

import (
	"context"
	"sync"

	"wp-plugin-publish/internal/database"
	"wp-plugin-publish/internal/logger"
	"wp-plugin-publish/internal/services/plugin"
	syncSvc "wp-plugin-publish/internal/services/sync"
	"wp-plugin-publish/internal/ws"
)

// Service interface for file scanning (no polling - event-driven)
type Service interface {
	// Manual scan - triggered by user clicking refresh
	TriggerScan(ctx context.Context, pluginID int64) (*ScanResult, error)
	
	// Git-triggered scan - called after successful git pull
	ScanAfterGitPull(ctx context.Context, pluginID int64) (*ScanResult, error)
	
	// Batch operations
	ScanAll(ctx context.Context) ([]ScanResult, error)
	
	// Cache management
	InitializeCache(ctx context.Context, pluginID int64) error
	ClearCache(pluginID int64)
	GetCachedPlugins() []int64
}

// Config holds watcher configuration
type Config struct {
	DB            *database.DB
	Logger        *logger.Logger
	PluginService plugin.Service
	SyncService   syncSvc.Service
	WSHub         *ws.Hub
}

type serviceImpl struct {
	db            *database.DB
	log           *logger.Logger
	pluginService plugin.Service
	syncService   syncSvc.Service
	wsHub         *ws.Hub
	cache         map[int64]*pluginScanCache
	mu            sync.RWMutex
}

// New creates a new watcher service (no polling goroutines)
func New(cfg Config) Service {
	return &serviceImpl{
		db:            cfg.DB,
		log:           cfg.Logger,
		pluginService: cfg.PluginService,
		syncService:   cfg.SyncService,
		wsHub:         cfg.WSHub,
		cache:         make(map[int64]*pluginScanCache),
	}
}

// InitializeCache loads the current file state for a plugin
// Call this on app startup or when adding a new plugin
func (s *serviceImpl) InitializeCache(ctx context.Context, pluginID int64) error {
	plugin, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return err
	}

	cache := s.buildNewCache(plugin)
	s.populateCache(cache)
	s.storeCache(pluginID, cache)

	s.log.Info("Initialized file cache", "pluginId", pluginID, "files", len(cache.lastScan))

	return nil
}

func (s *serviceImpl) buildNewCache(plugin *models.Plugin) *pluginScanCache {
	return &pluginScanCache{
		pluginID: plugin.ID,
		path:     plugin.Path,
		excludes: plugin.ExcludePatterns,
		lastScan: make(map[string]fileInfo),
	}
}

func (s *serviceImpl) storeCache(pluginID int64, cache *pluginScanCache) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.cache[pluginID] = cache
}

// TriggerScan performs a manual scan (user clicked refresh)
func (s *serviceImpl) TriggerScan(ctx context.Context, pluginID int64) (*ScanResult, error) {
	return s.performScan(ctx, pluginID, "manual")
}

// ScanAfterGitPull performs a scan after git pull (automatic)
func (s *serviceImpl) ScanAfterGitPull(ctx context.Context, pluginID int64) (*ScanResult, error) {
	return s.performScan(ctx, pluginID, "git_pull")
}

// ScanAll scans all cached plugins
func (s *serviceImpl) ScanAll(ctx context.Context) ([]ScanResult, error) {
	pluginIDs := s.getCachedPluginIDs()

	return s.scanPlugins(ctx, pluginIDs), nil
}

func (s *serviceImpl) getCachedPluginIDs() []int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := make([]int64, 0, len(s.cache))
	for id := range s.cache {
		ids = append(ids, id)
	}

	return ids
}

func (s *serviceImpl) scanPlugins(ctx context.Context, pluginIDs []int64) []ScanResult {
	var results []ScanResult
	for _, id := range pluginIDs {
		result, err := s.TriggerScan(ctx, id)
		isScanFailed := err != nil || result == nil

		if isScanFailed {
			continue
		}
		results = append(results, *result)
	}

	return results
}

func (s *serviceImpl) ClearCache(pluginID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.cache, pluginID)
	s.log.Info("Cleared file cache", "pluginId", pluginID)
}

func (s *serviceImpl) GetCachedPlugins() []int64 {
	return s.getCachedPluginIDs()
}

// --- Scan execution ---

func (s *serviceImpl) performScan(
	ctx context.Context,
	pluginID int64,
	triggerType string,
) (*ScanResult, error) {
	s.log.Info("Scanning plugin", "pluginId", pluginID, "trigger", triggerType)

	cache, err := s.getOrInitCache(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	return s.executeScan(cache, pluginID, triggerType), nil
}

func (s *serviceImpl) getOrInitCache(ctx context.Context, pluginID int64) (*pluginScanCache, error) {
	if cache := s.lookupCache(pluginID); cache != nil {
		return cache, nil
	}

	if err := s.InitializeCache(ctx, pluginID); err != nil {
		return nil, err
	}

	return s.lookupCache(pluginID), nil
}

func (s *serviceImpl) lookupCache(pluginID int64) *pluginScanCache {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.cache[pluginID]
}

func (s *serviceImpl) executeScan(
	cache *pluginScanCache,
	pluginID int64,
	triggerType string,
) *ScanResult {
	startTime := time.Now()
	changes := s.scanAndCompare(cache)

	result := s.buildScanResult(cache, pluginID, triggerType, startTime, changes)

	if len(changes) > 0 {
		s.broadcastChanges(pluginID, changes)
	}

	return result
}

func (s *serviceImpl) buildScanResult(
	cache *pluginScanCache,
	pluginID int64,
	triggerType string,
	startTime time.Time,
	changes []FileChange,
) *ScanResult {
	return &ScanResult{
		PluginID:     pluginID,
		Path:         cache.path,
		ScanTime:     startTime,
		DurationMs:   time.Since(startTime).Milliseconds(),
		FilesScanned: len(cache.lastScan),
		Changes:      changes,
		TriggerType:  triggerType,
	}
}
```

---

## Implementation: scanner.go — Broadcast Helpers

```go
package watcher

import (
	"wp-plugin-publish/internal/models"
	"wp-plugin-publish/internal/ws"
)

// broadcastChanges sends file changes via WebSocket and records them
func (s *serviceImpl) broadcastChanges(pluginID int64, changes []FileChange) {
	summary := s.summarizeChanges(changes)

	s.logChangeSummary(pluginID, summary)
	s.wsHub.Broadcast(ws.EventFileChange, FileChangeEvent{
		PluginID: pluginID,
		Changes:  changes,
		Summary:  summary,
	})

	s.recordChanges(pluginID, changes)
}

func (s *serviceImpl) summarizeChanges(changes []FileChange) FileChangeSummary {
	var summary FileChangeSummary
	for _, c := range changes {
		s.incrementChangeSummary(&summary, c.ChangeType)
	}

	return summary
}

func (s *serviceImpl) incrementChangeSummary(summary *FileChangeSummary, changeType WatcherChangeType) {
	switch changeType {
	case WatcherChangeCreated:
		summary.Created++
	case WatcherChangeModified:
		summary.Modified++
	case WatcherChangeDeleted:
		summary.Deleted++
	}
}

func (s *serviceImpl) logChangeSummary(pluginID int64, summary FileChangeSummary) {
	s.log.Info("File changes detected",
		"pluginId", pluginID,
		"created", summary.Created,
		"modified", summary.Modified,
		"deleted", summary.Deleted,
	)
}

func (s *serviceImpl) recordChanges(pluginID int64, changes []FileChange) {
	for _, c := range changes {
		s.syncService.RecordFileChange(nil, &models.FileChange{
			PluginID:   pluginID,
			FilePath:   c.Path,
			ChangeType: c.ChangeType,
			LocalHash:  c.Hash,
		})
	}
}
```

---

## Implementation: scanner.go — Scanning Logic

```go
package watcher

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Default directories always excluded from scans
var defaultExcludes = []string{"node_modules", "vendor", ".git", ".svn", ".idea", ".vscode"}

// scanDirectory scans a directory and returns detected changes
func (s *serviceImpl) scanDirectory(w *pluginWatcher) []FileChange {
	currentFiles := s.walkPluginDirectory(w)
	changes := s.detectChanges(w, currentFiles)
	w.lastScan = currentFiles

	return changes
}

func (s *serviceImpl) walkPluginDirectory(w *pluginWatcher) map[string]fileInfo {
	currentFiles := make(map[string]fileInfo)

	err := filepath.Walk(w.path, func(path string, info os.FileInfo, err error) error {
		return s.processWatchEntry(w, path, info, err, currentFiles)
	})

	if err != nil {
		s.log.Error("Error scanning directory", "path", w.path, "error", err)
	}

	return currentFiles
}

func (s *serviceImpl) processWatchEntry(
	w *pluginWatcher,
	path string,
	info os.FileInfo,
	err error,
	currentFiles map[string]fileInfo,
) error {
	if err != nil {
		return nil
	}

	relPath, _ := filepath.Rel(w.path, path)
	if relPath == "." {
		return nil
	}

	if info.IsDir() {
		return s.handleWatchDir(path, w.excludes)
	}

	return s.indexFile(path, relPath, info, w.excludes, currentFiles)
}

func (s *serviceImpl) indexFile(
	path string,
	relPath string,
	info os.FileInfo,
	excludes []string,
	currentFiles map[string]fileInfo,
) error {
	if s.isExcluded(filepath.Base(path), excludes) {
		return nil
	}

	hash, _ := s.calculateHash(path)
	currentFiles[relPath] = fileInfo{
		ModTime: info.ModTime().Unix(),
		Size:    info.Size(),
		Hash:    hash,
	}

	return nil
}

func (s *serviceImpl) handleWatchDir(path string, excludes []string) error {
	if s.isExcluded(filepath.Base(path), excludes) {
		return filepath.SkipDir
	}

	return nil
}

// --- Change detection ---

func (s *serviceImpl) detectChanges(w *pluginWatcher, currentFiles map[string]fileInfo) []FileChange {
	changes := s.detectAddedAndModified(w, currentFiles)

	return append(changes, s.detectDeleted(w, currentFiles)...)
}

func (s *serviceImpl) detectAddedAndModified(w *pluginWatcher, currentFiles map[string]fileInfo) []FileChange {
	var changes []FileChange
	for relPath, fi := range currentFiles {
		change := s.classifyFileChange(w, relPath, fi)
		if change != nil {
			changes = append(changes, *change)
		}
	}

	return changes
}

func (s *serviceImpl) detectDeleted(w *pluginWatcher, currentFiles map[string]fileInfo) []FileChange {
	var changes []FileChange
	for path := range w.lastScan {
		if _, exists := currentFiles[path]; exists {
			continue
		}
		changes = append(changes, FileChange{
			Path:       path,
			ChangeType: WatcherChangeDeleted,
		})
	}

	return changes
}

func (s *serviceImpl) classifyFileChange(
	w *pluginWatcher,
	relPath string,
	fi fileInfo,
) *FileChange {
	lastInfo, exists := w.lastScan[relPath]
	if !exists {
		return s.newFileChange(relPath, WatcherChangeCreated, fi)
	}

	if lastInfo.Hash == fi.Hash {
		return nil
	}

	return s.newFileChange(relPath, WatcherChangeModified, fi)
}

func (s *serviceImpl) newFileChange(
	relPath string,
	changeType WatcherChangeType,
	fi fileInfo,
) *FileChange {
	return &FileChange{
		Path:       relPath,
		ChangeType: changeType,
		Hash:       fi.Hash,
		Size:       fi.Size,
		ModTime:    time.Unix(fi.ModTime, 0),
	}
}

// --- Exclusion checks ---

func (s *serviceImpl) isExcluded(name string, excludes []string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}

	return s.isDefaultExclude(name) || s.matchesCustomExclude(name, excludes)
}

func (s *serviceImpl) isDefaultExclude(name string) bool {
	for _, ex := range defaultExcludes {
		if name == ex {
			return true
		}
	}

	return false
}

func (s *serviceImpl) matchesCustomExclude(name string, excludes []string) bool {
	for _, pattern := range excludes {
		if matched, _ := filepath.Match(pattern, name); matched {
			return true
		}
	}

	return false
}

// --- Hashing ---

func (s *serviceImpl) calculateHash(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}
```

---

## WebSocket Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `file:change` | `{pluginId, changes, summary}` | Files changed |
| `watcher:started` | `{pluginId, path}` | Watcher started |
| `watcher:stopped` | `{pluginId}` | Watcher stopped |
| `watcher:error` | `{pluginId, error}` | Scan error |

---

## API Endpoints

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/api/watcher/status` | Get all watchers status |
| POST | `/api/watcher/start/:pluginId` | Start watching plugin |
| POST | `/api/watcher/stop/:pluginId` | Stop watching plugin |
| POST | `/api/watcher/scan/:pluginId` | Trigger manual scan |

---

*See also: [34-git-service-impl.md](34-git-service-impl.md)*
