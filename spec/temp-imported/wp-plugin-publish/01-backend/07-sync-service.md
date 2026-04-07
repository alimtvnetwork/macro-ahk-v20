# 07 – Sync Service

> **Location:** `spec/wp-plugin-publish/01-backend/07-sync-service.md`  
> **Updated:** 2026-02-01

---

## Overview

The Sync Service orchestrates file synchronization between the local development environment and connected WordPress sites. It handles conflict resolution, transfer optimization, and maintains sync state.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sync Service                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ File Watcher │───▶│ Change Queue │───▶│ Sync Engine  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                 │                │
│                           ┌─────────────────────┼─────────────┐ │
│                           ▼                     ▼             ▼ │
│                    ┌──────────┐          ┌──────────┐  ┌──────┐│
│                    │ Site #1  │          │ Site #2  │  │Site N││
│                    └──────────┘          └──────────┘  └──────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Class Definition

```php
<?php
namespace PluginsOnboard\Services;

class SyncService {
    
    /** @var string Current sync status */
    private string $status = 'idle';
    
    /** @var array Active sync operations */
    private array $activeSyncs = [];
    
    /** @var ChangeQueue */
    private ChangeQueue $queue;
    
    /** @var WpRestClient */
    private WpRestClient $client;
    
    /**
     * Sync a plugin to a specific site
     */
    public function syncToSite(
        string $pluginSlug,
        int $siteId,
        array $options = []
    ): SyncResult;
    
    /**
     * Sync a plugin to all connected sites
     */
    public function syncToAll(
        string $pluginSlug,
        array $options = []
    ): array;
    
    /**
     * Sync specific files only
     */
    public function syncFiles(
        string $pluginSlug,
        int $siteId,
        array $files
    ): SyncResult;
    
    /**
     * Get current sync status
     */
    public function getStatus(string $pluginSlug): array;
    
    /**
     * Cancel an active sync operation
     */
    public function cancel(string $syncId): bool;
    
    /**
     * Resolve a sync conflict
     */
    public function resolveConflict(
        string $conflictId,
        string $resolution
    ): bool;
}
```

---

## Sync Modes

### Full Sync

Complete plugin synchronization:

```php
$result = $sync->syncToSite('my-plugin', $siteId, [
    'mode' => 'full',
    'verify_checksums' => true,
    'backup_first' => true
]);
```

### Incremental Sync

Only changed files since last sync:

```php
$result = $sync->syncToSite('my-plugin', $siteId, [
    'mode' => 'incremental',
    'since' => $lastSyncTimestamp
]);
```

### Selective Sync

Specific files only:

```php
$result = $sync->syncFiles('my-plugin', $siteId, [
    'includes/class-core.php',
    'assets/js/main.js'
]);
```

---

## Sync State Machine

```
┌───────┐    start     ┌───────────┐
│ IDLE  │─────────────▶│ PREPARING │
└───────┘              └─────┬─────┘
    ▲                        │
    │                        ▼
    │                  ┌───────────┐
    │    complete      │TRANSFERRING
    │◀─────────────────┤           │
    │                  └─────┬─────┘
    │                        │
    │                        ▼
    │                  ┌───────────┐
    │    verified      │ VERIFYING │
    │◀─────────────────┤           │
    │                  └─────┬─────┘
    │                        │ error
    │                        ▼
    │                  ┌───────────┐
    │    resolved      │ CONFLICT  │
    └──────────────────┤           │
                       └───────────┘
```

### States

| State | Description |
|-------|-------------|
| `IDLE` | No active sync |
| `PREPARING` | Calculating changes, creating manifest |
| `TRANSFERRING` | Uploading files to remote |
| `VERIFYING` | Confirming file integrity |
| `CONFLICT` | Awaiting conflict resolution |
| `FAILED` | Sync failed, rollback initiated |
| `COMPLETE` | Sync successful |

---

## Transfer Protocol

### Manifest Generation

```php
[
    'sync_id' => 'sync_abc123',
    'plugin_slug' => 'my-plugin',
    'timestamp' => 1706745600,
    'files' => [
        [
            'path' => 'includes/class-core.php',
            'hash' => 'abc123...',
            'size' => 4520,
            'action' => 'UPDATE'
        ],
        [
            'path' => 'assets/js/new.js',
            'hash' => 'def456...',
            'size' => 1280,
            'action' => 'CREATE'
        ]
    ],
    'deletions' => [
        'old-file.php'
    ],
    'total_size' => 5800,
    'checksum' => 'manifest_hash...'
]
```

### Transfer Actions

| Action | Description |
|--------|-------------|
| `CREATE` | New file to upload |
| `UPDATE` | Modified file to replace |
| `DELETE` | File to remove from remote |
| `SKIP` | No change needed |

---

## Conflict Resolution

### Conflict Types

```php
const CONFLICT_TYPES = [
    'REMOTE_MODIFIED' => 'Remote file changed since last sync',
    'BOTH_MODIFIED' => 'Both local and remote modified',
    'REMOTE_DELETED' => 'Remote file was deleted',
    'TYPE_MISMATCH' => 'File/directory type mismatch',
    'PERMISSION_DENIED' => 'Cannot write to remote path'
];
```

### Resolution Strategies

| Strategy | Behavior |
|----------|----------|
| `USE_LOCAL` | Overwrite remote with local |
| `USE_REMOTE` | Keep remote, discard local changes |
| `MERGE` | Attempt automatic merge (if supported) |
| `RENAME` | Keep both versions with suffix |
| `SKIP` | Skip this file, continue sync |

### Conflict Data Structure

```php
[
    'conflict_id' => 'conflict_xyz',
    'sync_id' => 'sync_abc123',
    'type' => 'BOTH_MODIFIED',
    'path' => 'includes/class-core.php',
    'local' => [
        'hash' => 'local_hash...',
        'mtime' => 1706745600,
        'size' => 4520
    ],
    'remote' => [
        'hash' => 'remote_hash...',
        'mtime' => 1706745500,
        'size' => 4480
    ],
    'resolutions' => ['USE_LOCAL', 'USE_REMOTE', 'SKIP']
]
```

---

## Sync Result Structure

```php
class SyncResult {
    public string $syncId;
    public string $status;        // 'success' | 'partial' | 'failed'
    public int $filesSynced;
    public int $filesFailed;
    public int $bytesTransferred;
    public float $durationSeconds;
    public array $errors;
    public array $conflicts;
    public ?string $rollbackId;
}
```

---

## Configuration

```php
const SYNC_DEFAULTS = [
    'chunk_size' => 1048576,        // 1MB per chunk
    'max_parallel' => 3,            // concurrent transfers
    'timeout' => 300,               // 5 minutes
    'retry_attempts' => 3,
    'retry_delay' => 1000,          // ms
    'verify_after_sync' => true,
    'backup_before_sync' => true,
    'auto_resolve_conflicts' => false
];
```

---

## Event Emissions

```php
// Sync lifecycle events
'sync:started'        => ['syncId', 'pluginSlug', 'siteId']
'sync:progress'       => ['syncId', 'progress', 'currentFile']
'sync:file_complete'  => ['syncId', 'file', 'status']
'sync:conflict'       => ['syncId', 'conflict']
'sync:complete'       => ['syncId', 'result']
'sync:failed'         => ['syncId', 'error']
'sync:cancelled'      => ['syncId', 'reason']
```

---

## Error Handling

| Error | Code | Recovery |
|-------|------|----------|
| Network timeout | `SYNC_TIMEOUT` | Retry with backoff |
| Auth failure | `SYNC_AUTH_FAILED` | Re-authenticate |
| Disk full | `SYNC_DISK_FULL` | Cancel, notify user |
| Hash mismatch | `SYNC_VERIFY_FAILED` | Re-transfer file |
| Remote error | `SYNC_REMOTE_ERROR` | Log, continue others |

---

## Rollback Support

If sync fails mid-way:

```php
// Automatic rollback
$sync->syncToSite($slug, $siteId, [
    'rollback_on_failure' => true
]);

// Manual rollback
$sync->rollback($syncId);
```

---

*See also: [06-file-watcher.md](06-file-watcher.md), [08-publish-service.md](08-publish-service.md)*