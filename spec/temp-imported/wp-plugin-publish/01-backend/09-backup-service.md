# 09 – Backup Service

> **Location:** `spec/wp-plugin-publish/01-backend/09-backup-service.md`  
> **Updated:** 2026-02-01

---

## Overview

The Backup Service creates and manages point-in-time snapshots of plugins for rollback support. It handles local and remote backups, retention policies, and restoration operations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backup Service                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐            │
│  │  Snapshot  │───▶│   Store    │───▶│  Restore   │            │
│  └────────────┘    └────────────┘    └────────────┘            │
│        │                 │                 │                    │
│        ▼                 ▼                 ▼                    │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐            │
│  │Compression │    │ Retention  │    │   Verify   │            │
│  └────────────┘    └────────────┘    └────────────┘            │
│                                                                  │
│  Storage Backends:                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Local   │  │   S3     │  │   GCS    │  │  Remote  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Class Definition

```php
<?php
namespace PluginsOnboard\Services;

class BackupService {
    
    /** @var StorageBackend */
    private StorageBackend $storage;
    
    /** @var Compression */
    private Compression $compression;
    
    /**
     * Create a backup of a plugin
     */
    public function create(
        string $pluginSlug,
        array $options = []
    ): BackupResult;
    
    /**
     * Create a remote backup (from WordPress site)
     */
    public function createRemote(
        string $pluginSlug,
        int $siteId
    ): BackupResult;
    
    /**
     * Restore a plugin from backup
     */
    public function restore(
        string $backupId,
        array $options = []
    ): RestoreResult;
    
    /**
     * Restore to a remote site
     */
    public function restoreToSite(
        string $backupId,
        int $siteId
    ): RestoreResult;
    
    /**
     * List available backups
     */
    public function list(
        ?string $pluginSlug = null,
        ?int $siteId = null
    ): array;
    
    /**
     * Delete a backup
     */
    public function delete(string $backupId): bool;
    
    /**
     * Apply retention policy
     */
    public function prune(): PruneResult;
    
    /**
     * Verify backup integrity
     */
    public function verify(string $backupId): VerifyResult;
}
```

---

## Backup Types

| Type | Trigger | Contents |
|------|---------|----------|
| `AUTO_PRE_SYNC` | Before sync | Full plugin state |
| `AUTO_PRE_PUBLISH` | Before publish | Full plugin + version |
| `MANUAL` | User request | Full plugin state |
| `SCHEDULED` | Cron job | Full plugin state |
| `INCREMENTAL` | Change detection | Changed files only |

---

## Backup Structure

```
backups/
└── my-plugin/
    └── 2024-01-31_120000_v1.2.0/
        ├── backup.zip
        ├── manifest.json
        ├── checksums.json
        └── metadata.json
```

### Manifest Format

```json
{
  "backup_id": "bkp_abc123",
  "plugin_slug": "my-plugin",
  "version": "1.2.0",
  "type": "AUTO_PRE_PUBLISH",
  "source": "local",
  "site_id": null,
  "created_at": "2024-01-31T12:00:00Z",
  "files_count": 45,
  "total_size": 524288,
  "compressed_size": 128000,
  "checksum": "sha256:abc123...",
  "retention_until": "2024-02-07T12:00:00Z"
}
```

---

## Backup Options

```php
[
    // Content
    'include_vendor' => false,
    'include_node_modules' => false,
    'include_build' => true,
    'exclude_patterns' => ['*.log', '*.tmp'],
    
    // Compression
    'compression' => 'gzip',      // gzip | zip | none
    'compression_level' => 6,     // 1-9
    
    // Storage
    'storage' => 'local',         // local | s3 | gcs | remote
    'encrypt' => false,
    
    // Retention
    'retention_days' => 7,
    'label' => 'Pre-publish backup',
    
    // Metadata
    'include_db_snapshot' => false,
    'capture_site_state' => true
]
```

---

## Retention Policies

### Default Policy

```php
const RETENTION_DEFAULTS = [
    'max_backups_per_plugin' => 10,
    'max_age_days' => 30,
    'min_keep' => 3,              // Always keep at least 3
    'keep_versions' => true,      // Keep one per version
];
```

### Policy Rules

| Rule | Description |
|------|-------------|
| Age-based | Delete backups older than `max_age_days` |
| Count-based | Keep only `max_backups_per_plugin` |
| Version-based | Keep at least one backup per version |
| Minimum | Always keep `min_keep` most recent |
| Manual | Manual backups exempt from auto-prune |

### Pruning Logic

```php
public function prune(): PruneResult {
    $deleted = [];
    
    foreach ($this->getAllPlugins() as $slug) {
        $backups = $this->list($slug);
        
        // Sort by date descending
        usort($backups, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
        
        // Apply rules
        foreach ($backups as $i => $backup) {
            if ($this->shouldDelete($backup, $i)) {
                $this->delete($backup['id']);
                $deleted[] = $backup['id'];
            }
        }
    }
    
    return new PruneResult($deleted);
}
```

---

## Storage Backends

### Local Storage

```php
class LocalStorage implements StorageBackend {
    private string $basePath;
    
    public function store(string $path, string $content): bool;
    public function retrieve(string $path): string;
    public function delete(string $path): bool;
    public function exists(string $path): bool;
    public function getUrl(string $path): string;
}
```

### S3-Compatible Storage

```php
class S3Storage implements StorageBackend {
    private string $bucket;
    private string $region;
    private S3Client $client;
    
    // Same interface as LocalStorage
}
```

---

## Restore Process

### Restore Steps

1. **Verify Backup**: Check integrity and compatibility
2. **Create Safety Backup**: Backup current state
3. **Extract Files**: Decompress and validate
4. **Apply Files**: Copy to destination
5. **Verify Restore**: Check file integrity
6. **Cleanup**: Remove temporary files

### Restore Options

```php
[
    'backup_current' => true,     // Create safety backup first
    'verify_before' => true,      // Verify backup integrity
    'verify_after' => true,       // Verify restored files
    'activate' => true,           // Activate plugin after restore
    'clear_cache' => true,        // Clear WP caches
    'run_migrations' => false     // Run DB migrations
]
```

---

## Result Structures

### BackupResult

```php
class BackupResult {
    public string $backupId;
    public string $status;           // 'success' | 'failed'
    public string $path;
    public int $originalSize;
    public int $compressedSize;
    public int $filesCount;
    public float $durationSeconds;
    public ?string $error;
}
```

### RestoreResult

```php
class RestoreResult {
    public string $backupId;
    public string $status;           // 'success' | 'failed'
    public ?string $safetyBackupId;
    public int $filesRestored;
    public float $durationSeconds;
    public ?string $error;
    public array $warnings;
}
```

---

## Event Emissions

```php
// Backup events
'backup:started'    => ['backupId', 'pluginSlug', 'type']
'backup:progress'   => ['backupId', 'progress', 'currentFile']
'backup:complete'   => ['backupId', 'result']
'backup:failed'     => ['backupId', 'error']

// Restore events
'restore:started'   => ['backupId', 'target']
'restore:progress'  => ['backupId', 'progress']
'restore:complete'  => ['backupId', 'result']
'restore:failed'    => ['backupId', 'error']

// Maintenance events
'backup:pruned'     => ['deletedIds', 'freedBytes']
```

---

## Error Handling

| Error | Code | Recovery |
|-------|------|----------|
| Disk full | `BKP_DISK_FULL` | Free space, retry |
| Backup not found | `BKP_NOT_FOUND` | List available backups |
| Corrupted backup | `BKP_CORRUPTED` | Delete, create new |
| Version mismatch | `BKP_VERSION_MISMATCH` | Force restore or abort |
| Permission denied | `BKP_PERMISSION_DENIED` | Check file permissions |
| Storage error | `BKP_STORAGE_ERROR` | Check storage config |

---

## Scheduled Backups

```php
// WP-Cron integration
add_action('plugins_onboard_scheduled_backup', function() {
    $backupService = new BackupService();
    
    foreach (getWatchedPlugins() as $slug) {
        $backupService->create($slug, [
            'type' => 'SCHEDULED',
            'retention_days' => 7
        ]);
    }
    
    $backupService->prune();
});

// Schedule: daily at 3 AM
wp_schedule_event(
    strtotime('today 3:00'),
    'daily',
    'plugins_onboard_scheduled_backup'
);
```

---

*See also: [07-sync-service.md](07-sync-service.md), [08-publish-service.md](08-publish-service.md)*