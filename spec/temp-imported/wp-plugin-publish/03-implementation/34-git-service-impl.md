# 34 — Git & Build Service Implementation

> **Location:** `spec/wp-plugin-publish/03-implementation/34-git-service-impl.md`  
> **Updated:** 2026-02-01  
> **Status:** Implementation Spec

---

## Overview

Complete Go implementation for Git operations and PowerShell build script execution. This service handles Git pull operations and custom build commands for plugins.

---

## File Structure

```
backend/internal/services/git/
├── service.go      # Main service interface and constructor
├── pull.go         # Git pull operations
├── build.go        # PowerShell/script execution
└── types.go        # Types and configuration
```

---

## Implementation: types.go

```go
package git

import "time"

// PullResult represents the outcome of a git pull operation
type PullResult struct {
	PluginID    int64     `json:"pluginId"`
	PluginName  string    `json:"pluginName"`
	Success     bool      `json:"success"`
	Branch      string    `json:"branch"`
	CommitHash  string    `json:"commitHash,omitempty"`
	CommitMsg   string    `json:"commitMsg,omitempty"`
	FilesChanged int      `json:"filesChanged"`
	Insertions  int       `json:"insertions"`
	Deletions   int       `json:"deletions"`
	Duration    int64     `json:"duration"` // milliseconds
	Output      string    `json:"output,omitempty"`
	Error       string    `json:"error,omitempty"`
	PulledAt    time.Time `json:"pulledAt"`
}

// BuildResult represents the outcome of a build command
type BuildResult struct {
	PluginID   int64     `json:"pluginId"`
	PluginName string    `json:"pluginName"`
	Success    bool      `json:"success"`
	Command    string    `json:"command"`
	ExitCode   int       `json:"exitCode"`
	Output     string    `json:"output"`
	Error      string    `json:"error,omitempty"`
	Duration   int64     `json:"duration"` // milliseconds
	BuiltAt    time.Time `json:"builtAt"`
}

// BatchPullResult holds results for multiple plugins
type BatchPullResult struct {
	Results   []PullResult `json:"results"`
	Succeeded int          `json:"succeeded"`
	Failed    int          `json:"failed"`
	Duration  int64        `json:"duration"`
}

// PluginGitConfig holds git configuration for a plugin
type PluginGitConfig struct {
	PluginID     int64  `json:"pluginId"`
	GitEnabled   bool   `json:"gitEnabled"`
	Branch       string `json:"branch"`
	BuildEnabled bool   `json:"buildEnabled"`
	BuildCommand string `json:"buildCommand"`
}

// --- Broadcast detail structs (broadcast_details.go) ---

// GitPullStartedEvent is broadcast when a git pull begins
type GitPullStartedEvent struct {
	PluginID   int64  `json:"pluginId"`
	PluginName string `json:"pluginName"`
}

// GitPullFailedEvent is broadcast when a git pull fails
type GitPullFailedEvent struct {
	PluginID int64  `json:"pluginId"`
	Error    string `json:"error"`
}

// GitPullCompleteEvent is broadcast when a git pull succeeds
type GitPullCompleteEvent struct {
	PluginID     int64  `json:"pluginId"`
	Success      bool   `json:"success"`
	FilesChanged int    `json:"filesChanged"`
	CommitHash   string `json:"commitHash"`
}

// GitPullAllCompleteEvent is broadcast when a batch pull finishes
type GitPullAllCompleteEvent struct {
	Succeeded int   `json:"succeeded"`
	Failed    int   `json:"failed"`
	Duration  int64 `json:"duration"`
}

// BuildStartedEvent is broadcast when a build begins
type BuildStartedEvent struct {
	PluginID   int64  `json:"pluginId"`
	PluginName string `json:"pluginName"`
	Command    string `json:"command"`
}

// BuildFailedEvent is broadcast when a build fails
type BuildFailedEvent struct {
	PluginID int64  `json:"pluginId"`
	Error    string `json:"error"`
	ExitCode int    `json:"exitCode"`
}

// BuildCompleteEvent is broadcast when a build succeeds
type BuildCompleteEvent struct {
	PluginID int64 `json:"pluginId"`
	Success  bool  `json:"success"`
	Duration int64 `json:"duration"`
}
```

---

## Implementation: service.go

```go
package git

import (
	"context"
	"sync"

	"wp-plugin-publish/internal/database"
	"wp-plugin-publish/internal/logger"
	"wp-plugin-publish/internal/services/plugin"
	"wp-plugin-publish/internal/ws"
)

// Service interface for git and build operations
type Service interface {
	// Git operations
	Pull(ctx context.Context, pluginID int64) (*PullResult, error)
	PullAll(ctx context.Context) (*BatchPullResult, error)
	GetStatus(ctx context.Context, pluginID int64) (*GitStatus, error)

	// Build operations
	Build(ctx context.Context, pluginID int64) (*BuildResult, error)
	PullAndBuild(ctx context.Context, pluginID int64) (*PullResult, *BuildResult, error)
	PullAndBuildAll(ctx context.Context) ([]PullResult, []BuildResult, error)

	// Configuration
	GetConfig(ctx context.Context, pluginID int64) (*PluginGitConfig, error)
	UpdateConfig(ctx context.Context, config PluginGitConfig) error
}

// GitStatus represents current git repository status
type GitStatus struct {
	PluginID     int64  `json:"pluginId"`
	IsRepo       bool   `json:"isRepo"`
	Branch       string `json:"branch"`
	CommitHash   string `json:"commitHash"`
	CommitMsg    string `json:"commitMsg"`
	HasChanges   bool   `json:"hasChanges"`
	Ahead        int    `json:"ahead"`
	Behind       int    `json:"behind"`
}

// Config holds git service configuration
type Config struct {
	DB             *database.DB
	Logger         *logger.Logger
	PluginService  plugin.Service
	WatcherService watcher.Service  // Added for hybrid mode
	WSHub          *ws.Hub
	DefaultBranch  string
	Timeout        int // seconds
}

type serviceImpl struct {
	db             *database.DB
	log            *logger.Logger
	pluginService  plugin.Service
	watcherService watcher.Service  // Added for hybrid mode
	wsHub          *ws.Hub
	defaultBranch  string
	timeout        int
	mu             sync.Mutex
}

// New creates a new git service
func New(cfg Config) Service {
	applyConfigDefaults(&cfg)

	return &serviceImpl{
		db:             cfg.DB,
		log:            cfg.Logger,
		pluginService:  cfg.PluginService,
		watcherService: cfg.WatcherService,
		wsHub:          cfg.WSHub,
		defaultBranch:  cfg.DefaultBranch,
		timeout:        cfg.Timeout,
	}
}

func applyConfigDefaults(cfg *Config) {
	if cfg.DefaultBranch == "" {
		cfg.DefaultBranch = "main"
	}

	if cfg.Timeout == 0 {
		cfg.Timeout = 60
	}
}
```

---

## Implementation: pull.go

```go
package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"wp-plugin-publish/internal/ws"
	"wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) Pull(ctx context.Context, pluginID int64) (*PullResult, error) {
	startTime := time.Now()
	s.log.Info("Starting git pull", "pluginId", pluginID)

	plugin, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	result := newPullResult(pluginID, plugin.Name)
	s.broadcastPullStarted(pluginID, plugin.Name)

	return s.executePullAndFinalize(ctx, plugin, result, startTime)
}

func (s *serviceImpl) executePullAndFinalize(
	ctx context.Context,
	plugin *Plugin,
	result *PullResult,
	startTime time.Time,
) (*PullResult, error) {
	if err := s.executePull(ctx, plugin, result); err != nil {
		result.Duration = time.Since(startTime).Milliseconds()

		return result, err
	}

	result.Duration = time.Since(startTime).Milliseconds()
	s.handlePostPull(ctx, result.PluginID, result)

	return result, nil
}

func newPullResult(pluginID int64, pluginName string) *PullResult {
	return &PullResult{
		PluginID:   pluginID,
		PluginName: pluginName,
		PulledAt:   time.Now(),
	}
}

func (s *serviceImpl) executePull(
	ctx context.Context,
	plugin *Plugin,
	result *PullResult,
) error {
	if err := s.validateGitRepo(plugin.Path); err != nil {
		result.Success = false
		result.Error = err.Error()

		return err
	}

	return s.fetchBranchAndPull(plugin, result)
}

func (s *serviceImpl) validateGitRepo(path string) error {
	gitDir := filepath.Join(path, ".git")
	isRepoMissing := !dirExists(gitDir)

	if isRepoMissing {
		return apperror.New(apperror.ErrGitNotRepo, "directory is not a git repository")
	}

	return nil
}

func (s *serviceImpl) fetchBranchAndPull(plugin *Plugin, result *PullResult) error {
	branch, err := s.runGitCommand(plugin.Path, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		result.Success = false
		result.Error = err.Error()

		return err
	}

	result.Branch = strings.TrimSpace(branch)

	return s.runPullAndParse(plugin, result)
}

func (s *serviceImpl) runPullAndParse(plugin *Plugin, result *PullResult) error {
	output, err := s.runGitCommand(plugin.Path, "pull", "origin", result.Branch)
	result.Output = output

	if err != nil {
		return s.recordPullFailure(result, err)
	}

	result.Success = true
	s.parseGitOutput(output, result)
	s.populateCommitInfo(plugin.Path, result)

	return nil
}

func (s *serviceImpl) recordPullFailure(result *PullResult, err error) error {
	result.Success = false
	result.Error = err.Error()
	s.broadcastPullFailed(result.PluginID, result.Error)

	return err
}

func (s *serviceImpl) populateCommitInfo(path string, result *PullResult) {
	commitHash, _ := s.runGitCommand(path, "rev-parse", "--short", "HEAD")
	result.CommitHash = strings.TrimSpace(commitHash)

	commitMsg, _ := s.runGitCommand(path, "log", "-1", "--format=%s")
	result.CommitMsg = strings.TrimSpace(commitMsg)
}

func (s *serviceImpl) handlePostPull(
	ctx context.Context,
	pluginID int64,
	result *PullResult,
) {
	s.triggerPostPullScan(ctx, pluginID, result)

	s.wsHub.Broadcast(ws.EventGitPullComplete, GitPullCompleteEvent{
		PluginID:     pluginID,
		Success:      true,
		FilesChanged: result.FilesChanged,
		CommitHash:   result.CommitHash,
	})

	s.log.Info("Git pull complete",
		"pluginId", pluginID,
		"filesChanged", result.FilesChanged,
		"duration", result.Duration,
	)
}

func (s *serviceImpl) triggerPostPullScan(
	ctx context.Context,
	pluginID int64,
	result *PullResult,
) {
	hasChanges := result.FilesChanged > 0 && s.watcherService != nil

	if hasChanges {
		s.log.Info("Git pull detected changes, triggering file scan", "pluginId", pluginID)
		scanResult, _ := s.watcherService.ScanAfterGitPull(ctx, pluginID)

		hasScanChanges := scanResult != nil && len(scanResult.Changes) > 0

		if hasScanChanges {
			s.log.Info("File scan complete", "changes", len(scanResult.Changes))
		}
	}
}

func (s *serviceImpl) broadcastPullStarted(pluginID int64, pluginName string) {
	s.wsHub.Broadcast(ws.EventGitPullStarted, GitPullStartedEvent{
		PluginID:   pluginID,
		PluginName: pluginName,
	})
}

func (s *serviceImpl) broadcastPullFailed(pluginID int64, errMsg string) {
	s.wsHub.Broadcast(ws.EventGitPullFailed, GitPullFailedEvent{
		PluginID: pluginID,
		Error:    errMsg,
	})
}

func (s *serviceImpl) PullAll(ctx context.Context) (*BatchPullResult, error) {
	startTime := time.Now()
	s.log.Info("Starting git pull for all plugins")

	plugins, err := s.pluginService.List(ctx)
	if err != nil {
		return nil, err
	}

	batch := s.pullEachPlugin(ctx, plugins)
	batch.Duration = time.Since(startTime).Milliseconds()

	s.broadcastPullAllComplete(batch)

	return batch, nil
}

func (s *serviceImpl) pullEachPlugin(ctx context.Context, plugins []Plugin) *BatchPullResult {
	batch := &BatchPullResult{
		Results: make([]PullResult, 0),
	}

	for _, p := range plugins {
		gitDir := filepath.Join(p.Path, ".git")
		isRepoMissing := !dirExists(gitDir)

		if isRepoMissing {
			continue
		}

		s.appendPullResult(ctx, p.ID, batch)
	}

	return batch
}

func (s *serviceImpl) appendPullResult(
	ctx context.Context,
	pluginID int64,
	batch *BatchPullResult,
) {
	result, _ := s.Pull(ctx, pluginID)
	if result == nil {
		return
	}

	batch.Results = append(batch.Results, *result)

	if result.Success {
		batch.Succeeded++
	} else {
		batch.Failed++
	}
}

func (s *serviceImpl) broadcastPullAllComplete(batch *BatchPullResult) {
	s.wsHub.Broadcast(ws.EventGitPullAllComplete, GitPullAllCompleteEvent{
		Succeeded: batch.Succeeded,
		Failed:    batch.Failed,
		Duration:  batch.Duration,
	})
}

func (s *serviceImpl) GetStatus(ctx context.Context, pluginID int64) (*GitStatus, error) {
	plugin, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	return s.buildGitStatus(pluginID, plugin.Path), nil
}

func (s *serviceImpl) buildGitStatus(pluginID int64, path string) *GitStatus {
	status := &GitStatus{PluginID: pluginID}

	gitDir := filepath.Join(path, ".git")
	isRepoMissing := !dirExists(gitDir)

	if isRepoMissing {
		status.IsRepo = false

		return status
	}

	status.IsRepo = true
	s.populateGitStatus(path, status)

	return status
}

func (s *serviceImpl) populateGitStatus(path string, status *GitStatus) {
	branch, _ := s.runGitCommand(path, "rev-parse", "--abbrev-ref", "HEAD")
	status.Branch = strings.TrimSpace(branch)

	hash, _ := s.runGitCommand(path, "rev-parse", "--short", "HEAD")
	status.CommitHash = strings.TrimSpace(hash)

	msg, _ := s.runGitCommand(path, "log", "-1", "--format=%s")
	status.CommitMsg = strings.TrimSpace(msg)

	diffOutput, _ := s.runGitCommand(path, "status", "--porcelain")
	status.HasChanges = len(strings.TrimSpace(diffOutput)) > 0

	s.populateAheadBehind(path, status)
}

func (s *serviceImpl) populateAheadBehind(path string, status *GitStatus) {
	s.runGitCommand(path, "fetch", "origin", status.Branch)

	aheadBehind, _ := s.runGitCommand(path, "rev-list", "--left-right", "--count",
		fmt.Sprintf("%s...origin/%s", status.Branch, status.Branch))

	parts := strings.Fields(aheadBehind)
	if len(parts) >= 2 {
		status.Ahead, _ = strconv.Atoi(parts[0])
		status.Behind, _ = strconv.Atoi(parts[1])
	}
}

// runGitCommand executes a git command in the specified directory
func (s *serviceImpl) runGitCommand(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir

	return s.captureCommandOutput(cmd)
}

func (s *serviceImpl) captureCommandOutput(cmd *exec.Cmd) (string, error) {
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return stderr.String(), apperror.Wrap(err, apperror.ErrGitCommand, stderr.String())
	}

	return stdout.String(), nil
}

// parseGitOutput extracts statistics from git pull output
func (s *serviceImpl) parseGitOutput(output string, result *PullResult) {
	// Parse "X files changed, Y insertions(+), Z deletions(-)"
	re := regexp.MustCompile(`(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?`)
	matches := re.FindStringSubmatch(output)

	if len(matches) < 2 {
		return
	}

	result.FilesChanged, _ = strconv.Atoi(matches[1])
	s.parseOptionalGitStats(matches, result)
}

func (s *serviceImpl) parseOptionalGitStats(matches []string, result *PullResult) {
	if len(matches) >= 3 {
		result.Insertions, _ = strconv.Atoi(matches[2])
	}

	if len(matches) >= 4 {
		result.Deletions, _ = strconv.Atoi(matches[3])
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	isPathExists := err == nil && info.IsDir()

	return isPathExists
}

func (s *serviceImpl) handleBuildFailure(
	result *BuildResult,
	err error,
	stderrOutput string,
	pluginID int64,
) (*BuildResult, error) {
	result.Success = false
	result.Error = stderrOutput
	result.ExitCode = extractExitCode(err)

	s.wsHub.Broadcast(ws.EventBuildFailed, BuildFailedEvent{
		PluginID: pluginID,
		Error:    result.Error,
		ExitCode: result.ExitCode,
	})

	return result, apperror.Wrap(err, apperror.ErrBuildFailed, result.Error)
}

func extractExitCode(err error) int {
	exitErr, ok := err.(*exec.ExitError)
	if !ok {
		return -1
	}

	return exitErr.ExitCode()
}
```

---

## Implementation: build.go

```go
package git

import (
	"bytes"
	"context"
	"os/exec"
	"runtime"
	"time"

	"wp-plugin-publish/internal/ws"
	"wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) Build(ctx context.Context, pluginID int64) (*BuildResult, error) {
	startTime := time.Now()
	s.log.Info("Starting build", "pluginId", pluginID)

	plugin, config, err := s.loadBuildContext(ctx, pluginID)
	if err != nil {
		return nil, err
	}

	result := s.newBuildResult(pluginID, plugin.Name, config.BuildCommand)
	s.broadcastBuildStarted(pluginID, plugin.Name, config.BuildCommand)

	return s.executeBuild(ctx, plugin, config, result, startTime)
}

func (s *serviceImpl) loadBuildContext(ctx context.Context, pluginID int64) (*Plugin, *PluginGitConfig, error) {
	plugin, err := s.pluginService.GetByID(ctx, pluginID)
	if err != nil {
		return nil, nil, err
	}

	config, err := s.GetConfig(ctx, pluginID)
	buildNotConfigured := err != nil || !config.BuildEnabled || config.BuildCommand == ""

	if buildNotConfigured {
		return nil, nil, apperror.New(apperror.ErrBuildNotConfigured, "build not configured for this plugin")
	}

	return plugin, config, nil
}

func (s *serviceImpl) newBuildResult(
	pluginID int64,
	pluginName, command string,
) *BuildResult {
	return &BuildResult{
		PluginID:   pluginID,
		PluginName: pluginName,
		Command:    command,
		BuiltAt:    time.Now(),
	}
}

func (s *serviceImpl) broadcastBuildStarted(
	pluginID int64,
	pluginName, command string,
) {
	s.wsHub.Broadcast(ws.EventBuildStarted, BuildStartedEvent{
		PluginID:   pluginID,
		PluginName: pluginName,
		Command:    command,
	})
}

func (s *serviceImpl) executeBuild(
	ctx context.Context,
	plugin *Plugin,
	config *PluginGitConfig,
	result *BuildResult,
	startTime time.Time,
) (*BuildResult, error) {
	cmd := s.createBuildCommand(ctx, config.BuildCommand)
	cmd.Dir = plugin.Path

	stdout, stderr := s.runBuildCommand(cmd, result, startTime)

	if result.Success {
		s.broadcastBuildComplete(result.PluginID, result.Duration)

		return result, nil
	}

	return s.handleBuildFailure(result, fmt.Errorf("%s", stderr), stderr, result.PluginID)
}

func (s *serviceImpl) createBuildCommand(ctx context.Context, command string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.CommandContext(ctx, "powershell", "-ExecutionPolicy", "Bypass", "-File", command)
	}

	return exec.CommandContext(ctx, "bash", "-c", command)
}

func (s *serviceImpl) runBuildCommand(
	cmd *exec.Cmd,
	result *BuildResult,
	startTime time.Time,
) (string, string) {
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	result.Duration = time.Since(startTime).Milliseconds()
	result.Output = stdout.String()

	isCommandSuccess := err == nil

	if isCommandSuccess {
		result.Success = true
		result.ExitCode = 0
	}

	return stdout.String(), stderr.String()
}

func (s *serviceImpl) broadcastBuildComplete(pluginID int64, duration int64) {
	s.wsHub.Broadcast(ws.EventBuildComplete, BuildCompleteEvent{
		PluginID: pluginID,
		Success:  true,
		Duration: duration,
	})

	s.log.Info("Build complete", "pluginId", pluginID, "duration", duration)
}

func (s *serviceImpl) PullAndBuild(ctx context.Context, pluginID int64) (*PullResult, *BuildResult, error) {
	s.log.Info("Starting pull and build", "pluginId", pluginID)

	pullResult, err := s.Pull(ctx, pluginID)
	if err != nil {
		return pullResult, nil, err
	}

	shouldBuild := pullResult.Success && pullResult.FilesChanged > 0
	isSkippable := !shouldBuild

	if isSkippable {
		return pullResult, nil, nil
	}

	buildResult, err := s.Build(ctx, pluginID)

	return pullResult, buildResult, err
}

func (s *serviceImpl) PullAndBuildAll(ctx context.Context) ([]PullResult, []BuildResult, error) {
	s.log.Info("Starting pull and build for all plugins")

	plugins, err := s.pluginService.List(ctx)
	if err != nil {
		return nil, nil, err
	}

	return s.pullAndBuildEachPlugin(ctx, plugins)
}

func (s *serviceImpl) pullAndBuildEachPlugin(ctx context.Context, plugins []Plugin) ([]PullResult, []BuildResult, error) {
	var pullResults []PullResult
	var buildResults []BuildResult

	for _, p := range plugins {
		s.appendPullAndBuildResult(ctx, p.ID, &pullResults, &buildResults)
	}

	return pullResults, buildResults, nil
}

func (s *serviceImpl) appendPullAndBuildResult(
	ctx context.Context,
	pluginID int64,
	pullResults *[]PullResult,
	buildResults *[]BuildResult,
) {
	pullResult, buildResult, _ := s.PullAndBuild(ctx, pluginID)

	if pullResult != nil {
		*pullResults = append(*pullResults, *pullResult)
	}

	if buildResult != nil {
		*buildResults = append(*buildResults, *buildResult)
	}
}

const gitConfigSelectQuery = `
	SELECT GitEnabled, GitBranch, BuildEnabled, BuildCommand
	FROM PluginGitConfig
	WHERE PluginId = ?
`

func (s *serviceImpl) GetConfig(ctx context.Context, pluginID int64) (*PluginGitConfig, error) {
	var config PluginGitConfig
	config.PluginID = pluginID

	err := s.db.QueryRowContext(ctx, gitConfigSelectQuery, pluginID).Scan(
		&config.GitEnabled, &config.Branch, &config.BuildEnabled, &config.BuildCommand,
	)

	if err != nil {
		return s.defaultGitConfig(pluginID), nil
	}

	return &config, nil
}

func (s *serviceImpl) defaultGitConfig(pluginID int64) *PluginGitConfig {
	return &PluginGitConfig{
		PluginID:     pluginID,
		GitEnabled:   true,
		Branch:       s.defaultBranch,
		BuildEnabled: false,
	}
}

func (s *serviceImpl) UpdateConfig(ctx context.Context, config PluginGitConfig) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO PluginGitConfig (PluginId, GitEnabled, GitBranch, BuildEnabled, BuildCommand, UpdatedAt)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
	`, config.PluginID, config.GitEnabled, config.Branch, config.BuildEnabled, config.BuildCommand)

	return err
}
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS PluginGitConfig (
    PluginId INTEGER PRIMARY KEY,
    GitEnabled INTEGER DEFAULT 1,
    GitBranch TEXT DEFAULT 'main',
    BuildEnabled INTEGER DEFAULT 0,
    BuildCommand TEXT,
    UpdatedAt TEXT NOT NULL,
    FOREIGN KEY (PluginId) REFERENCES Plugins(Id)
);
```

---

## WebSocket Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `git:pull:started` | `{pluginId, pluginName}` | Pull started |
| `git:pull:complete` | `{pluginId, success, filesChanged}` | Pull finished |
| `git:pull:failed` | `{pluginId, error}` | Pull error |
| `git:pullall:complete` | `{succeeded, failed, duration}` | Batch pull done |
| `build:started` | `{pluginId, command}` | Build started |
| `build:complete` | `{pluginId, success, duration}` | Build finished |
| `build:failed` | `{pluginId, error, exitCode}` | Build error |

---

## API Endpoints

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/api/git/pull/:pluginId` | Pull single plugin |
| POST | `/api/git/pull-all` | Pull all plugins |
| GET | `/api/git/status/:pluginId` | Get git status |
| POST | `/api/git/build/:pluginId` | Run build command |
| POST | `/api/git/pull-build/:pluginId` | Pull then build |
| POST | `/api/git/pull-build-all` | Pull & build all |
| GET | `/api/git/config/:pluginId` | Get git config |
| PUT | `/api/git/config/:pluginId` | Update git config |

---

*See also: [35-implementation-plan.md](35-implementation-plan.md)*
