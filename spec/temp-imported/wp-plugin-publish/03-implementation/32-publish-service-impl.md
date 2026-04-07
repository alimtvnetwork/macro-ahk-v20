# 32 — Publish Service Implementation

> **Location:** `spec/wp-plugin-publish/03-implementation/32-publish-service-impl.md`  
> **Updated:** 2026-02-01  
> **Status:** Implementation Spec

---

## Overview

Complete Go implementation for the Publish Service. This service manages plugin publishing to WordPress sites, including validation, packaging, upload, and activation.

---

## File Structure

```
backend/internal/services/publish/
├── service.go      # Main service interface and constructor
├── pipeline.go     # Publishing pipeline orchestration
├── packager.go     # ZIP file creation
├── uploader.go     # File upload to WordPress
└── types.go        # Input/output types
```

---

## Implementation: types.go

```go
package publish

import "time"

// StageStatusType represents the status of a pipeline stage
type StageStatusType string

const (
	StageStatusPending StageStatusType = "pending"
	StageStatusRunning StageStatusType = "running"
	StageStatusSuccess StageStatusType = "success"
	StageStatusFailed  StageStatusType = "failed"
	StageStatusSkipped StageStatusType = "skipped"
)

// ActivationStatusType represents plugin activation state after publish
type ActivationStatusType string

const (
	ActivationActive   ActivationStatusType = "active"
	ActivationInactive ActivationStatusType = "inactive"
	ActivationError    ActivationStatusType = "error"
)

// PublishOptions configures the publish operation
type PublishOptions struct {
	Mode         string   `json:"mode"`         // "full" or "selected"
	Files        []string `json:"files"`        // files to publish (for selected mode)
	CreateBackup bool     `json:"createBackup"` // backup before publishing
	Activate     bool     `json:"activate"`     // activate plugin after publish
	DryRun       bool     `json:"dryRun"`       // validate without publishing
}

// PublishResult represents the outcome of a publish operation
type PublishResult struct {
	PublishID        string               `json:"publishId"`
	Success          bool                 `json:"success"`
	PluginID         int64                `json:"pluginId"`
	SiteID           int64                `json:"siteId"`
	FilesUploaded    int                  `json:"filesUploaded"`
	BytesTransferred int64                `json:"bytesTransferred"`
	BackupID         *int64               `json:"backupId,omitempty"`
	ActivationStatus ActivationStatusType `json:"activationStatus"`
	Duration         int64                `json:"duration"`
	Stages           []StageResult        `json:"stages"`
	Error            string               `json:"error,omitempty"`
}

// StageResult tracks individual pipeline stage outcomes
type StageResult struct {
	Name     string          `json:"name"`
	Status   StageStatusType `json:"status"`
	Duration int64           `json:"duration"`
	Error    string          `json:"error,omitempty"`
}

// PackageInfo describes a created plugin package
type PackageInfo struct {
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	FileCount int       `json:"fileCount"`
	Checksum  string    `json:"checksum"`
	CreatedAt time.Time `json:"createdAt"`
}

// --- Broadcast detail structs (broadcast_details.go) ---

// PublishStartedEvent is broadcast when a publish operation begins
type PublishStartedEvent struct {
	PublishID string `json:"publishId"`
	PluginID  int64  `json:"pluginId"`
	SiteID    int64  `json:"siteId"`
	Mode      string `json:"mode"`
}

// PublishCompleteEvent is broadcast when a publish operation completes
type PublishCompleteEvent struct {
	PublishID     string `json:"publishId"`
	PluginID      int64  `json:"pluginId"`
	SiteID        int64  `json:"siteId"`
	Success       bool   `json:"success"`
	FilesUploaded int    `json:"filesUploaded"`
}

// PublishProgressEvent is broadcast during publish stage transitions
type PublishProgressEvent struct {
	Stage    string          `json:"stage"`
	Status   StageStatusType `json:"status"`
	Duration int64           `json:"duration,omitempty"`
}

// PublishFailedEvent is broadcast when a publish operation fails
type PublishFailedEvent struct {
	PublishID string `json:"publishId"`
	Stage     string `json:"stage"`
	Error     string `json:"error"`
}
```

---

## Implementation: service.go

```go
package publish

import (
	"context"

	"wp-plugin-publish/internal/database"
	"wp-plugin-publish/internal/logger"
	"wp-plugin-publish/internal/services/backup"
	"wp-plugin-publish/internal/services/plugin"
	"wp-plugin-publish/internal/services/sync"
	"wp-plugin-publish/internal/wordpress"
	"wp-plugin-publish/internal/ws"
)

// Service interface for publish operations
type Service interface {
	// Publishing
	Publish(ctx context.Context, pluginID, siteID int64, opts PublishOptions) (*PublishResult, error)
	PublishToAll(ctx context.Context, pluginID int64, opts PublishOptions) ([]PublishResult, error)

	// Packaging
	CreatePackage(ctx context.Context, pluginID int64, files []string) (*PackageInfo, error)

	// History
	GetHistory(ctx context.Context, pluginID int64, siteID *int64) ([]PublishResult, error)

	// Rollback
	Rollback(ctx context.Context, pluginID, siteID, backupID int64) (*PublishResult, error)
}

// Config holds publish service configuration
type Config struct {
	DB              *database.DB
	Logger          *logger.Logger
	PluginService   plugin.Service
	BackupService   *backup.Service
	SyncService     sync.Service
	WPClientFactory func(url, user, pass string) *wordpress.Client
	TempDir         string
	WSHub           *ws.Hub
}

type serviceImpl struct {
	db              *database.DB
	log             *logger.Logger
	pluginService   plugin.Service
	backupService   *backup.Service
	syncService     sync.Service
	wpClientFactory func(url, user, pass string) *wordpress.Client
	tempDir         string
	wsHub           *ws.Hub
}

// New creates a new publish service
func New(cfg Config) Service {
	return &serviceImpl{
		db:              cfg.DB,
		log:             cfg.Logger,
		pluginService:   cfg.PluginService,
		backupService:   cfg.BackupService,
		syncService:     cfg.SyncService,
		wpClientFactory: cfg.WPClientFactory,
		tempDir:         cfg.TempDir,
		wsHub:           cfg.WSHub,
	}
}
```

---

## Implementation: pipeline.go

```go
package publish

import (
	"context"
	"fmt"
	"time"

	"wp-plugin-publish/internal/models"
	"wp-plugin-publish/internal/ws"
	"wp-plugin-publish/pkg/apperror"

	"github.com/google/uuid"
)

// publishContext holds resolved data for a single publish operation
type publishContext struct {
	publishID  string
	plugin     *models.Plugin
	site       models.Site
	remoteSlug string
	startTime  time.Time
}

// --- SQL constants ---

const siteSelectQuery = `
	SELECT Id, Name, Url, Username, PasswordEncrypted
	FROM Sites WHERE Id = ?
`

const remotSlugSelectQuery = `
	SELECT RemoteSlug FROM PluginMappings
	WHERE PluginId = ? AND SiteId = ?
`

const updateMappingSyncQuery = `
	UPDATE PluginMappings
	SET LastSyncAt = datetime('now'), SyncStatus = ?, UpdatedAt = datetime('now')
	WHERE PluginId = ? AND SiteId = ?
`

// --- Publish entry point ---

func (s *serviceImpl) Publish(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	opts PublishOptions,
) (*PublishResult, error) {
	result := s.newPublishResult(pluginID, siteID)
	pctx, err := s.loadPublishContext(ctx, pluginID, siteID, result.PublishID)

	if err != nil {
		return s.failPublish(result, "validate", err)
	}

	s.broadcastPublishStarted(pctx, opts.Mode)

	return s.executePipeline(ctx, pctx, result, opts)
}

func (s *serviceImpl) newPublishResult(pluginID, siteID int64) *PublishResult {
	return &PublishResult{
		PublishID: uuid.New().String()[:8],
		PluginID:  pluginID,
		SiteID:    siteID,
		Stages:    make([]StageResult, 0),
	}
}

func (s *serviceImpl) loadPublishContext(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	publishID string,
) (*publishContext, error) {
	pctx := &publishContext{
		publishID: publishID,
		startTime: time.Now(),
	}

	s.log.Info("Starting publish", "publishId", publishID, "pluginId", pluginID, "siteId", siteID)

	var err error
	pctx.plugin, err = s.pluginService.GetByID(ctx, pluginID)

	if err != nil {
		return nil, err
	}

	return pctx, s.loadSiteAndSlug(ctx, pluginID, siteID, pctx)
}

func (s *serviceImpl) loadSiteAndSlug(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	pctx *publishContext,
) error {
	err := s.db.QueryRowContext(ctx, siteSelectQuery, siteID).Scan(
		&pctx.site.ID, &pctx.site.Name, &pctx.site.URL,
		&pctx.site.Username, &pctx.site.PasswordEncrypted,
	)

	if err != nil {
		return apperror.New(apperror.ErrNotFound, "site not found")
	}

	return s.loadRemoteSlug(ctx, pluginID, siteID, pctx)
}

func (s *serviceImpl) loadRemoteSlug(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	pctx *publishContext,
) error {
	err := s.db.QueryRowContext(ctx, remotSlugSelectQuery, pluginID, siteID).Scan(&pctx.remoteSlug)

	if err != nil {
		return apperror.New(apperror.ErrNotFound, "plugin not mapped to site")
	}

	return nil
}

// --- Pipeline execution ---

func (s *serviceImpl) executePipeline(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) (*PublishResult, error) {
	if err := s.runPreUploadStages(ctx, pctx, result, opts); err != nil {
		return result, err
	}

	if opts.DryRun {
		return s.finalizeDryRun(result, pctx.startTime), nil
	}

	return s.runUploadAndFinalize(ctx, pctx, result, opts)
}

func (s *serviceImpl) runPreUploadStages(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) error {
	if err := s.runValidateStage(ctx, pctx, result); err != nil {
		return err
	}

	s.runOptionalBackup(ctx, pctx, result, opts)

	return s.runPackageStage(ctx, pctx, result, opts)
}

func (s *serviceImpl) runValidateStage(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
) error {
	stage := s.runStage("validate", func() error {
		return s.pluginService.ValidatePath(ctx, pctx.plugin.Path)
	})
	result.Stages = append(result.Stages, stage)

	if stage.Status == StageStatusFailed {
		return s.setFailure(result, "validate", stage.Error, pctx.startTime)
	}

	return nil
}

func (s *serviceImpl) runOptionalBackup(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) {
	if !opts.CreateBackup {
		return
	}

	stage := s.runStage("backup", func() error {
		return s.captureBackup(ctx, pctx, result)
	})
	result.Stages = append(result.Stages, stage)

	if stage.Status == StageStatusFailed {
		s.log.Warn("Backup failed, continuing publish", "error", stage.Error)
	}
}

func (s *serviceImpl) captureBackup(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
) error {
	backup, err := s.backupService.CreateFromRemote(ctx, pctx.plugin.ID, result.SiteID)
	if err != nil {
		return err
	}

	result.BackupID = &backup.ID

	return nil
}

func (s *serviceImpl) runPackageStage(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) error {
	stage := s.runStage("package", func() error {
		return s.capturePackageInfo(ctx, pctx, result, opts)
	})
	result.Stages = append(result.Stages, stage)

	if stage.Status == StageStatusFailed {
		return s.setFailure(result, "package", stage.Error, pctx.startTime)
	}

	return nil
}

func (s *serviceImpl) capturePackageInfo(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) error {
	pkg, err := s.CreatePackage(ctx, pctx.plugin.ID, opts.Files)
	if err != nil {
		return err
	}

	result.FilesUploaded = pkg.FileCount
	result.BytesTransferred = pkg.Size

	return nil
}

func (s *serviceImpl) runUploadAndFinalize(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) (*PublishResult, error) {
	if err := s.runUploadStage(ctx, pctx, result); err != nil {
		return result, err
	}

	s.resolveActivation(ctx, pctx, result, opts)
	s.finalizePublish(ctx, pctx, result, opts)

	return result, nil
}

func (s *serviceImpl) runUploadStage(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
) error {
	wpClient := s.wpClientFactory(pctx.site.URL, pctx.site.Username, string(pctx.site.PasswordEncrypted))

	stage := s.runStage("upload", func() error {
		return s.uploadPackage(ctx, wpClient, "", pctx.remoteSlug)
	})
	result.Stages = append(result.Stages, stage)

	if stage.Status == StageStatusFailed {
		return s.setFailure(result, "upload", stage.Error, pctx.startTime)
	}

	return nil
}

func (s *serviceImpl) resolveActivation(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) {
	if !opts.Activate {
		result.ActivationStatus = ActivationInactive

		return
	}

	wpClient := s.wpClientFactory(pctx.site.URL, pctx.site.Username, string(pctx.site.PasswordEncrypted))
	stage := s.runStage("activate", func() error {
		return wpClient.ActivatePlugin(ctx, pctx.remoteSlug)
	})
	result.Stages = append(result.Stages, stage)
	result.ActivationStatus = s.activationStatusFromStage(stage)
}

func (s *serviceImpl) activationStatusFromStage(stage StageResult) ActivationStatusType {
	if stage.Status == StageStatusFailed {
		return ActivationError
	}

	return ActivationActive
}

func (s *serviceImpl) finalizePublish(
	ctx context.Context,
	pctx *publishContext,
	result *PublishResult,
	opts PublishOptions,
) {
	hasFiles := len(opts.Files) > 0

	if hasFiles {
		s.syncService.MarkSynced(ctx, pctx.plugin.ID, result.SiteID, opts.Files)
	}

	s.db.ExecContext(ctx, updateMappingSyncQuery, string(sync.SyncStatusSynced), pctx.plugin.ID, result.SiteID)

	result.Success = true
	result.Duration = time.Since(pctx.startTime).Milliseconds()

	s.broadcastPublishComplete(pctx, result)
	s.log.Info("Publish complete", "publishId", pctx.publishID, "duration", result.Duration)
}

func (s *serviceImpl) finalizeDryRun(result *PublishResult, startTime time.Time) *PublishResult {
	result.Success = true
	result.Duration = time.Since(startTime).Milliseconds()

	return result
}

// --- Stage runner ---

func (s *serviceImpl) runStage(name string, fn func() error) StageResult {
	start := time.Now()
	s.broadcastStageProgress(name, StageStatusRunning, 0)

	err := fn()
	duration := time.Since(start).Milliseconds()
	stage := s.buildStageResult(name, err, duration)

	s.broadcastStageProgress(name, stage.Status, duration)

	return stage
}

func (s *serviceImpl) buildStageResult(
	name string,
	err error,
	duration int64,
) StageResult {
	if err != nil {
		return StageResult{Name: name, Status: StageStatusFailed, Error: err.Error(), Duration: duration}
	}

	return StageResult{Name: name, Status: StageStatusSuccess, Duration: duration}
}

func (s *serviceImpl) broadcastStageProgress(
	stage string,
	status StageStatusType,
	duration int64,
) {
	s.wsHub.Broadcast(ws.EventPublishProgress, PublishProgressEvent{
		Stage:    stage,
		Status:   status,
		Duration: duration,
	})
}

// --- Failure helpers ---

func (s *serviceImpl) failPublish(
	result *PublishResult,
	stage string,
	err error,
) (*PublishResult, error) {
	result.Success = false
	result.Error = err.Error()

	s.wsHub.Broadcast(ws.EventPublishFailed, PublishFailedEvent{
		PublishID: result.PublishID,
		Stage:     stage,
		Error:     err.Error(),
	})

	return result, err
}

func (s *serviceImpl) setFailure(
	result *PublishResult,
	stage string,
	errMsg string,
	startTime time.Time,
) error {
	result.Success = false
	result.Error = errMsg
	result.Duration = time.Since(startTime).Milliseconds()

	s.wsHub.Broadcast(ws.EventPublishFailed, PublishFailedEvent{
		PublishID: result.PublishID,
		Stage:     stage,
		Error:     errMsg,
	})

	return fmt.Errorf("%s", errMsg)
}

// --- Broadcast helpers ---

func (s *serviceImpl) broadcastPublishStarted(pctx *publishContext, mode string) {
	s.wsHub.Broadcast(ws.EventPublishStarted, PublishStartedEvent{
		PublishID: pctx.publishID,
		PluginID:  pctx.plugin.ID,
		SiteID:    pctx.site.ID,
		Mode:      mode,
	})
}

func (s *serviceImpl) broadcastPublishComplete(pctx *publishContext, result *PublishResult) {
	s.wsHub.Broadcast(ws.EventPublishComplete, PublishCompleteEvent{
		PublishID:     pctx.publishID,
		PluginID:      pctx.plugin.ID,
		SiteID:        pctx.site.ID,
		Success:       true,
		FilesUploaded: result.FilesUploaded,
	})
}

// --- PublishToAll, GetHistory, Rollback ---

func (s *serviceImpl) PublishToAll(
	ctx context.Context,
	pluginID int64,
	opts PublishOptions,
) ([]PublishResult, error) {
	mappings, err := s.pluginService.GetMappings(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	return s.publishToMappings(ctx, pluginID, opts, mappings)
}

func (s *serviceImpl) publishToMappings(
	ctx context.Context,
	pluginID int64,
	opts PublishOptions,
	mappings []models.PluginMapping,
) []PublishResult {
	results := make([]PublishResult, 0, len(mappings))
	for _, m := range mappings {
		result, _ := s.Publish(ctx, pluginID, m.SiteID, opts)
		results = append(results, *result)
	}

	return results
}

func (s *serviceImpl) GetHistory(
	ctx context.Context,
	pluginID int64,
	siteID *int64,
) ([]PublishResult, error) {
	// TODO: Query publish history from database
	return []PublishResult{}, nil
}

func (s *serviceImpl) Rollback(
	ctx context.Context,
	pluginID int64,
	siteID int64,
	backupID int64,
) (*PublishResult, error) {
	// TODO: Implement rollback using backup
	return nil, apperror.New(apperror.ErrNotImplemented, "rollback not yet implemented")
}
```

---

## Implementation: packager.go

```go
package publish

import (
	"archive/zip"
	"context"
	"crypto/md5"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) CreatePackage(
	ctx context.Context,
	pluginID int64,
	files []string,
) (*PackageInfo, error) {
	s.log.Info("Creating package", "pluginId", pluginID, "files", len(files))

	plugin, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	zipPath := filepath.Join(s.tempDir, fmt.Sprintf("plugin_%d_%d.zip", pluginID, time.Now().Unix()))

	filesToPackage, err := s.resolveFilesToPackage(plugin, files)
	if err != nil {
		return nil, err
	}

	return s.writeZipPackage(plugin, zipPath, filesToPackage)
}

func (s *serviceImpl) resolveFilesToPackage(plugin *models.Plugin, files []string) ([]string, error) {
	hasSpecificFiles := len(files) > 0

	if hasSpecificFiles {
		return files, nil
	}

	return s.collectPluginFiles(plugin)
}

func (s *serviceImpl) collectPluginFiles(plugin *models.Plugin) ([]string, error) {
	var filesToPackage []string

	err := filepath.Walk(plugin.Path, func(path string, info os.FileInfo, err error) error {
		return s.filterPluginFile(plugin, path, info, err, &filesToPackage)
	})

	if err != nil {
		return nil, apperror.Wrap(err, apperror.ErrDirRead, "failed to walk plugin directory")
	}

	return filesToPackage, nil
}

func (s *serviceImpl) filterPluginFile(
	plugin *models.Plugin,
	path string,
	info os.FileInfo,
	err error,
	filesToPackage *[]string,
) error {
	isSkippable := err != nil || info.IsDir()

	if isSkippable {
		return nil
	}

	base := filepath.Base(path)

	if s.shouldSkipFile(base, plugin.ExcludePatterns) {
		return nil
	}

	relPath, _ := filepath.Rel(plugin.Path, path)
	*filesToPackage = append(*filesToPackage, relPath)

	return nil
}

func (s *serviceImpl) shouldSkipFile(base string, excludePatterns []string) bool {
	if strings.HasPrefix(base, ".") {
		return true
	}

	return s.isFileExcluded(base, excludePatterns)
}

func (s *serviceImpl) isFileExcluded(base string, excludes []string) bool {
	for _, exclude := range excludes {
		if matched, _ := filepath.Match(exclude, base); matched {
			return true
		}
	}

	return false
}

func (s *serviceImpl) writeZipPackage(
	plugin *models.Plugin,
	zipPath string,
	filesToPackage []string,
) (*PackageInfo, error) {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return nil, apperror.Wrap(err, apperror.ErrFileWrite, "failed to create zip file")
	}
	defer zipFile.Close()

	hash := md5.New()
	stats := s.writeFilesToZip(zipFile, hash, plugin.Path, filesToPackage)

	return s.buildPackageInfo(zipPath, stats, hash)
}

func (s *serviceImpl) writeFilesToZip(
	zipFile *os.File,
	hash io.Writer,
	pluginPath string,
	filesToPackage []string,
) zipStats {
	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	pluginDirName := filepath.Base(pluginPath)

	return s.addFilesToZip(zipWriter, hash, pluginPath, pluginDirName, filesToPackage)
}

func (s *serviceImpl) buildPackageInfo(
	zipPath string,
	stats zipStats,
	hash *md5.Hash,
) (*PackageInfo, error) {
	zipInfo, _ := os.Stat(zipPath)

	pkg := &PackageInfo{
		Path:      zipPath,
		Size:      zipInfo.Size(),
		FileCount: stats.fileCount,
		Checksum:  hex.EncodeToString(hash.Sum(nil)),
		CreatedAt: time.Now(),
	}

	s.log.Info("Package created", "path", zipPath, "size", pkg.Size, "files", stats.fileCount)

	return pkg, nil
}

type zipStats struct {
	totalSize int64
	fileCount int
}

func (s *serviceImpl) addFilesToZip(
	zipWriter *zip.Writer,
	hash io.Writer,
	pluginPath string,
	pluginDirName string,
	filesToPackage []string,
) zipStats {
	var stats zipStats
	for _, relPath := range filesToPackage {
		written := s.addSingleFileToZip(zipWriter, hash, pluginPath, pluginDirName, relPath)
		if written < 0 {
			continue
		}
		stats.totalSize += written
		stats.fileCount++
	}

	return stats
}

func (s *serviceImpl) addSingleFileToZip(
	zipWriter *zip.Writer,
	hash io.Writer,
	pluginPath string,
	pluginDirName string,
	relPath string,
) int64 {
	header, err := s.createZipHeader(pluginPath, pluginDirName, relPath)
	if err != nil {
		return -1
	}

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return -1
	}

	return s.copyFileToZip(filepath.Join(pluginPath, relPath), writer, hash)
}

func (s *serviceImpl) createZipHeader(
	pluginPath, pluginDirName, relPath string,
) (*zip.FileHeader, error) {
	fullPath := filepath.Join(pluginPath, relPath)

	header, err := s.fileInfoHeader(fullPath)
	if err != nil {
		return nil, err
	}

	header.Name = filepath.Join(pluginDirName, relPath)
	header.Method = zip.Deflate

	return header, nil
}

func (s *serviceImpl) fileInfoHeader(fullPath string) (*zip.FileHeader, error) {
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	return zip.FileInfoHeader(info)
}

func (s *serviceImpl) copyFileToZip(
	fullPath string,
	writer io.Writer,
	hash io.Writer,
) int64 {
	file, err := os.Open(fullPath)
	if err != nil {
		return -1
	}
	defer file.Close()

	multiWriter := io.MultiWriter(writer, hash)
	written, _ := io.Copy(multiWriter, file)

	return written
}
```

---

## Implementation: uploader.go

```go
package publish

import (
	"context"
	"os"

	"wp-plugin-publish/internal/wordpress"
	"wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) uploadPackage(
	ctx context.Context,
	client *wordpress.Client,
	zipPath string,
	remoteSlug string,
) error {
	s.log.Info("Uploading package", "path", zipPath, "slug", remoteSlug)

	data, err := s.readPackageFile(zipPath)
	if err != nil {
		return err
	}

	if err := client.UploadPlugin(ctx, remoteSlug, data); err != nil {
		return apperror.Wrap(err, apperror.ErrRemoteUpload, "failed to upload to WordPress")
	}

	os.Remove(zipPath)
	s.log.Info("Package uploaded successfully", "slug", remoteSlug)

	return nil
}

func (s *serviceImpl) readPackageFile(zipPath string) ([]byte, error) {
	data, err := os.ReadFile(zipPath)
	if err != nil {
		return nil, apperror.Wrap(err, apperror.ErrFileRead, "failed to read package")
	}

	return data, nil
}
```

---

## API Endpoints

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/publish/:pluginId/:siteId` | Publish to single site |
| POST | `/api/publish/:pluginId` | Publish to all mapped sites |
| GET | `/api/publish/history/:pluginId` | Get publish history |
| POST | `/api/publish/rollback` | Rollback to backup |

---

*See also: [33-watcher-service-impl.md](33-watcher-service-impl.md)*
