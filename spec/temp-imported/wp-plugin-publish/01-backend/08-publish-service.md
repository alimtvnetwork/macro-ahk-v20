# 08 – Publish Service

> **Location:** `spec/wp-plugin-publish/01-backend/08-publish-service.md`  
> **Updated:** 2026-02-01

---

## Overview

The Publish Service manages the complete plugin publishing workflow, from preparation through activation on remote WordPress sites. It coordinates with Sync, Backup, and Validation services.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Publish Service                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐ │
│  │  Validate  │──▶│   Build    │──▶│  Transfer  │──▶│  Activate  │ │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘ │
│        │                │                │                │         │
│        ▼                ▼                ▼                ▼         │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐ │
│  │   Linter   │   │  Packager  │   │   Upload   │   │  Verify    │ │
│  └────────────┘   └────────────┘   └────────────┘   └────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Class Definition

```php
<?php
namespace PluginsOnboard\Services;

class PublishService {
    
    /** @var SyncService */
    private SyncService $sync;
    
    /** @var BackupService */
    private BackupService $backup;
    
    /** @var PluginValidator */
    private PluginValidator $validator;
    
    /**
     * Publish a plugin to a specific site
     */
    public function publish(
        string $pluginSlug,
        int $siteId,
        array $options = []
    ): PublishResult;
    
    /**
     * Publish to multiple sites
     */
    public function publishToAll(
        string $pluginSlug,
        array $siteIds = [],
        array $options = []
    ): array;
    
    /**
     * Create a release package
     */
    public function package(
        string $pluginSlug,
        string $version
    ): PackageResult;
    
    /**
     * Validate plugin before publish
     */
    public function validate(string $pluginSlug): ValidationResult;
    
    /**
     * Rollback to previous version
     */
    public function rollback(
        string $pluginSlug,
        int $siteId,
        ?string $version = null
    ): RollbackResult;
    
    /**
     * Get publish history
     */
    public function getHistory(
        string $pluginSlug,
        ?int $siteId = null
    ): array;
}
```

---

## Publishing Pipeline

### Stage 1: Validation

```php
$validation = $this->validate($pluginSlug);

// Checks performed:
// - Plugin header validity
// - PHP syntax check
// - WordPress coding standards (optional)
// - Security scan (optional)
// - Version increment check
```

### Stage 2: Build

```php
// Optional build steps
$buildSteps = [
    'compile_assets' => true,    // Sass, TypeScript, etc.
    'minify_js' => true,
    'minify_css' => true,
    'generate_pot' => true,      // Translation template
    'update_readme' => true
];
```

### Stage 3: Package

```php
$package = $this->package($pluginSlug, $version);

// Creates ZIP with:
// - All plugin files
// - Manifest file
// - Checksums file
// - Version metadata
```

### Stage 4: Transfer

```php
// Upload package to remote site
$transfer = $this->transfer($package, $siteId);

// Options:
// - Chunked upload for large files
// - Resume support
// - Integrity verification
```

### Stage 5: Activate

```php
// Remote operations:
// 1. Extract package
// 2. Run pre-activation hooks
// 3. Activate plugin
// 4. Run post-activation hooks
// 5. Verify activation
```

---

## Publish Options

```php
[
    // Pre-publish
    'validate' => true,
    'backup_first' => true,
    'dry_run' => false,
    
    // Build
    'build_assets' => true,
    'minify' => true,
    'source_maps' => false,
    
    // Transfer
    'force_full_sync' => false,
    'verify_checksums' => true,
    
    // Activation
    'activate_after_publish' => true,
    'clear_cache' => true,
    'run_migrations' => true,
    
    // Rollback
    'rollback_on_failure' => true,
    'keep_backup_days' => 7
]
```

---

## Publish State Machine

```
┌─────────┐
│ PENDING │
└────┬────┘
     │ start
     ▼
┌──────────────┐
│  VALIDATING  │──────────▶ FAILED
└──────┬───────┘
       │ valid
       ▼
┌──────────────┐
│   BUILDING   │──────────▶ FAILED
└──────┬───────┘
       │ built
       ▼
┌──────────────┐
│  PACKAGING   │──────────▶ FAILED
└──────┬───────┘
       │ packaged
       ▼
┌──────────────┐
│ TRANSFERRING │──────────▶ FAILED
└──────┬───────┘
       │ transferred
       ▼
┌──────────────┐
│  ACTIVATING  │──────────▶ FAILED ──▶ ROLLING_BACK
└──────┬───────┘
       │ activated
       ▼
┌──────────────┐
│  VERIFYING   │──────────▶ FAILED ──▶ ROLLING_BACK
└──────┬───────┘
       │ verified
       ▼
┌──────────────┐
│   COMPLETE   │
└──────────────┘
```

---

## Package Structure

```
my-plugin-1.2.0.zip
├── my-plugin/
│   ├── my-plugin.php
│   ├── includes/
│   ├── assets/
│   ├── languages/
│   └── readme.txt
├── manifest.json
├── checksums.json
└── metadata.json
```

### Manifest Format

```json
{
  "plugin_slug": "my-plugin",
  "version": "1.2.0",
  "wp_requires": "5.8",
  "wp_tested": "6.4",
  "php_requires": "7.4",
  "created_at": "2024-01-31T12:00:00Z",
  "files_count": 45,
  "total_size": 524288,
  "checksum": "sha256:abc123..."
}
```

---

## Publish Result Structure

```php
class PublishResult {
    public string $publishId;
    public string $status;          // 'success' | 'failed' | 'rolled_back'
    public string $pluginSlug;
    public string $version;
    public int $siteId;
    public array $stages;           // Status per stage
    public float $durationSeconds;
    public ?string $error;
    public ?string $rollbackId;
    public array $warnings;
}
```

### Stage Results

```php
'stages' => [
    'validate' => ['status' => 'success', 'duration' => 1.2],
    'build' => ['status' => 'success', 'duration' => 5.4],
    'package' => ['status' => 'success', 'duration' => 2.1],
    'transfer' => ['status' => 'success', 'duration' => 8.7],
    'activate' => ['status' => 'success', 'duration' => 1.5],
    'verify' => ['status' => 'success', 'duration' => 0.8]
]
```

---

## Event Emissions

```php
// Publish lifecycle
'publish:started'       => ['publishId', 'pluginSlug', 'siteId', 'version']
'publish:stage_start'   => ['publishId', 'stage']
'publish:stage_complete'=> ['publishId', 'stage', 'result']
'publish:progress'      => ['publishId', 'stage', 'progress']
'publish:complete'      => ['publishId', 'result']
'publish:failed'        => ['publishId', 'stage', 'error']
'publish:rollback'      => ['publishId', 'reason']
```

---

## Validation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| Valid plugin header | Error | Must have Name, Version |
| PHP syntax | Error | All PHP files must parse |
| Version increment | Warning | Should be > current |
| Readme exists | Warning | readme.txt recommended |
| No debug code | Warning | No var_dump, error_log |
| Security headers | Warning | Prevent direct access |

---

## Error Handling

| Error | Code | Recovery |
|-------|------|----------|
| Validation failed | `PUB_VALIDATION_FAILED` | Fix issues, retry |
| Build failed | `PUB_BUILD_FAILED` | Check build config |
| Package failed | `PUB_PACKAGE_FAILED` | Check disk space |
| Transfer failed | `PUB_TRANSFER_FAILED` | Retry, check network |
| Activation failed | `PUB_ACTIVATION_FAILED` | Rollback, check logs |
| Remote error | `PUB_REMOTE_ERROR` | Check site status |

---

## Partial Publish Failure Recovery (Multi-Site)

When publishing a plugin to multiple sites via `publishToAll`, some sites may succeed while others fail. This creates a **partial deployment state** that requires careful recovery.

### Failure Scenarios

| Scenario | Example | Impact |
|----------|---------|--------|
| **Network failure** | Site B is unreachable mid-deploy | Sites A,C have new version; Site B has old version |
| **Auth failure** | Site C's app password was rotated | Sites A,B succeed; Site C returns 401 |
| **Activation crash** | Plugin activates on A,B but crashes on C due to missing PHP extension | Sites A,B active; Site C rolled back to previous version |
| **Timeout** | Site D is slow; upload times out at 60s | Sites A,B,C succeed; Site D in unknown state |
| **Disk full** | Remote site runs out of space during ZIP extraction | Upload appears to succeed but plugin files are corrupted |

### Recovery Architecture

```
publishToAll(plugin, [siteA, siteB, siteC])
    │
    ├── siteA: ✅ SUCCESS (v1.36.1 active)
    ├── siteB: ❌ FAILED  (PUB_TRANSFER_FAILED - network timeout)
    └── siteC: ❌ FAILED  (PUB_ACTIVATION_FAILED - rolled back to v1.36.0)
    │
    ▼
BulkPublishResult {
    total: 3,
    succeeded: [siteA],
    failed: [
        { siteId: siteB, stage: "transfer", error: "timeout", canRetry: true },
        { siteId: siteC, stage: "activate", error: "fatal PHP error", canRetry: false, rolledBack: true }
    ],
    partialFailure: true
}
```

### Recovery Strategies

#### Strategy 1: Automatic Retry with Exponential Backoff

For transient failures (network timeouts, 502/503 errors):

```
Retry Policy:
  maxRetries: 3
  initialDelay: 2s
  maxDelay: 30s
  backoffMultiplier: 2
  retryableErrors: [PUB_TRANSFER_FAILED, PUB_REMOTE_ERROR]
  nonRetryableErrors: [PUB_VALIDATION_FAILED, PUB_ACTIVATION_FAILED]
```

The publish service automatically retries `PUB_TRANSFER_FAILED` errors up to 3 times before marking a site as failed. Activation failures are never auto-retried because they may indicate a fundamental incompatibility.

#### Strategy 2: Manual Selective Retry

The UI presents failed sites with a "Retry Failed" button that re-runs the pipeline only for failed sites:

```
User Action: "Retry Failed Sites"
    │
    ├── Re-runs publish pipeline ONLY for siteB, siteC
    ├── Skips siteA (already succeeded)
    └── Uses same publish options (version, activate flag, etc.)
```

**Implementation:** The `BulkPublishResult` is persisted in the publish history table with per-site stage results, allowing the retry to pick up exactly where each site failed.

#### Strategy 3: Rollback All on Partial Failure

For critical deployments where version consistency across all sites is mandatory:

```
Publish Options:
  rollback_all_on_partial_failure: true
```

When enabled:
1. If **any** site fails, rollback **all** succeeded sites to their previous version
2. This ensures all sites remain on the same version
3. The user is notified with a detailed report of what was rolled back and why

**Use case:** Plugins that communicate between sites (e.g., multisite sync plugins) where mixed versions could cause data corruption.

#### Strategy 4: Version Verification Post-Deploy

After all publish operations complete (including retries), the system can run a verification pass:

```
Verification Pass:
  For each target site:
    1. GET /wp-json/riseup-asia-uploader/v1/plugins/{slug}
    2. Compare remote version with expected version
    3. Flag mismatches as "version_drift"
```

This catches edge cases where:
- The upload succeeded but activation silently failed
- A cache layer is serving stale version information
- The plugin was manually downgraded between publish and verification

### UI Presentation

The publish history dashboard shows multi-site results with per-site status:

```
┌─────────────────────────────────────────────────────────────┐
│  Publish: my-plugin v1.36.1 → 3 sites                      │
│  Status: ⚠️ Partial Failure (2/3 succeeded)                │
├─────────────────────────────────────────────────────────────┤
│  ✅ site-a.example.com    v1.36.1 active     0.8s          │
│  ❌ site-b.example.com    TRANSFER_FAILED    timeout 60s   │
│  ⚠️ site-c.example.com    ROLLED BACK v1.36.0  crash       │
├─────────────────────────────────────────────────────────────┤
│  [Retry Failed]  [Rollback All]  [View Logs]               │
└─────────────────────────────────────────────────────────────┘
```

### WebSocket Events for Partial Failures

```
publish:site_complete  → { publishId, siteId, status: "success", version }
publish:site_failed    → { publishId, siteId, stage, error, canRetry, rolledBack }
publish:bulk_complete  → { publishId, total, succeeded, failed, partialFailure }
```

### Data Persistence

All partial failure states are persisted to the `publish_history` SQLite table:

| Column | Type | Description |
|--------|------|-------------|
| `publish_id` | TEXT | Unique publish operation ID |
| `site_id` | INTEGER | Target site |
| `stage_reached` | TEXT | Last completed stage |
| `status` | TEXT | success / failed / rolled_back |
| `error_message` | TEXT | Failure reason |
| `can_retry` | BOOLEAN | Whether retry is safe |
| `rolled_back_to` | TEXT | Previous version if rolled back |
| `retry_count` | INTEGER | Number of retry attempts |

---

## Version History

```php
// Get publish history
$history = $publish->getHistory('my-plugin', $siteId);

// Returns:
[
    [
        'version' => '1.2.0',
        'published_at' => '2024-01-31T12:00:00Z',
        'status' => 'success',
        'can_rollback' => true
    ],
    [
        'version' => '1.1.0',
        'published_at' => '2024-01-15T10:00:00Z',
        'status' => 'success',
        'can_rollback' => true
    ]
]
```

---

*See also: [07-sync-service.md](07-sync-service.md), [09-backup-service.md](09-backup-service.md)*