# Database Snapshot System Specification

**Version:** 1.0.0  
**Created:** 2026-02-06  
**Status:** Draft

---

## 1. Overview

The Database Snapshot System provides automated and on-demand MySQL database backups stored as portable SQLite files. It integrates with third-party backup solutions (WP Reset, Updraft) when available, or uses a native SQLite-based backup engine as fallback.

### 1.1 Key Features

- **Third-party Integration**: Leverages WP Reset or Updraft for full site snapshots when installed
- **Native SQLite Engine**: Custom MySQL → SQLite export when no third-party available
- **Configurable Scope**: Select all tables, content tables, or specific tables per snapshot
- **WP-Cron Scheduling**: All operations run via WordPress Cron (even "snapshot now")
- **Retention Policies**: Configurable by days or snapshot count
- **Import/Export**: ZIP-compressed SQLite files for portability
- **Full Restore**: Truncate and restore MySQL tables from SQLite snapshots

---

## 2. Folder Structure

```
wp-content/uploads/riseup-asia-uploader/
├── riseup-asia-uploader.db          # Main plugin SQLite database
├── logs/
│   ├── log.txt                       # Activity log
│   ├── error.txt                     # Error log
│   └── fatal-errors.log              # Fatal error captures
├── temp/                             # Temporary extraction folder
└── snapshots/                        # Snapshot storage
    ├── manifest.json                 # Index of all snapshots
    ├── 001_2026-02-06_143022.sqlite  # Individual snapshot files
    ├── 001_2026-02-06_143022.zip     # Compressed export
    ├── 002_2026-02-07_000000.sqlite
    └── ...
```

### 2.1 Naming Convention

```
{sequence}_{YYYY-MM-DD}_{HHmmss}.sqlite
```

| Component | Description |
|-----------|-------------|
| `sequence` | Zero-padded 3-digit incremental number (001, 002, ...) |
| `YYYY-MM-DD` | Date in ISO format |
| `HHmmss` | Time in 24-hour format |

**Example**: `007_2026-02-06_143022.sqlite`

---

## 3. Third-Party Detection

### 3.1 Supported Providers

| Provider | Detection Method | Integration Type |
|----------|------------------|------------------|
| **WP Reset** | `class_exists('WP_Reset')` | Full site snapshot via API |
| **Updraft Plus** | `class_exists('UpdraftPlus')` | Database backup via hooks |
| **Native** | Fallback | MySQL → SQLite export |

### 3.2 Provider Priority

1. Check user preference in settings (if explicitly set)
2. Detect WP Reset → use if available
3. Detect Updraft → use if available  
4. Fallback to Native SQLite engine

### 3.3 Detection Class

```php
class SnapshotProviderDetector {
    const PROVIDER_WP_RESET = 'wp_reset';
    const PROVIDER_UPDRAFT = 'updraft';
    const PROVIDER_NATIVE = 'native';
    
    public function detectAvailableProviders(): array;
    public function getPreferredProvider(): string;
    public function getProviderInstance(): SnapshotProviderInterface;
}
```

---

## 4. Native SQLite Snapshot Engine

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Snapshot Request                          │
│              (API call or scheduled cron)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Schedule Cron Event                         │
│           wp_schedule_single_event('riseup_snapshot')        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cron Job Executes                           │
│                                                              │
│  1. Lock: Create .lock file to prevent concurrent runs      │
│  2. Log: "Starting snapshot {sequence} at {timestamp}"      │
│  3. Create: New SQLite database file                        │
│  4. Loop: For each selected table                           │
│     a. Log: "Exporting table {name} ({row_count} rows)"     │
│     b. Read: Fetch MySQL table structure                    │
│     c. Create: Mirror table in SQLite                       │
│     d. Export: Batch insert rows (1000 per batch)           │
│     e. Log: "Completed {name} in {duration}ms"              │
│  5. Finalize: Write metadata to snapshot                    │
│  6. Log: "Snapshot complete: {file_size}, {table_count}"    │
│  7. Unlock: Remove .lock file                               │
│  8. Cleanup: Apply retention policy                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Table Scope Options

| Scope | Tables Included |
|-------|-----------------|
| `all` | All tables in database (including non-WP) |
| `wordpress` | Core WP tables: posts, postmeta, comments, terms, options, users, usermeta |
| `content` | Posts, postmeta, comments, commentmeta, terms, termmeta, term_relationships, term_taxonomy |
| `custom` | User-selected tables from settings |

### 4.3 MySQL to SQLite Type Mapping

| MySQL Type | SQLite Type |
|------------|-------------|
| `INT`, `BIGINT`, `TINYINT`, `SMALLINT` | `INTEGER` |
| `VARCHAR`, `TEXT`, `LONGTEXT`, `MEDIUMTEXT` | `TEXT` |
| `DECIMAL`, `FLOAT`, `DOUBLE` | `REAL` |
| `BLOB`, `LONGBLOB`, `MEDIUMBLOB` | `BLOB` |
| `DATE`, `DATETIME`, `TIMESTAMP` | `TEXT` (ISO 8601) |
| `BOOLEAN` | `INTEGER` (0/1) |

### 4.4 Batch Processing

- **Batch Size**: 1000 rows per INSERT
- **Memory Limit**: Check `memory_get_usage()` before each batch
- **Timeout Prevention**: Use `set_time_limit(0)` for cron execution
- **Progress Tracking**: Store progress in `wp_options` for UI display

---

## 5. WP-Cron Integration

### 5.1 Custom Schedules

```php
add_filter('cron_schedules', function($schedules) {
    $schedules['riseup_daily'] = array(
        'interval' => DAY_IN_SECONDS,
        'display' => 'Once Daily'
    );
    $schedules['riseup_weekly'] = array(
        'interval' => WEEK_IN_SECONDS,
        'display' => 'Once Weekly'
    );
    $schedules['riseup_monthly'] = array(
        'interval' => MONTH_IN_SECONDS,
        'display' => 'Once Monthly'
    );
    return $schedules;
});
```

### 5.2 Cron Hooks

| Hook | Description |
|------|-------------|
| `riseup_snapshot_scheduled` | Recurring scheduled snapshot |
| `riseup_snapshot_immediate` | One-time immediate snapshot |
| `riseup_snapshot_cleanup` | Retention policy enforcement |
| `riseup_snapshot_table_{table}` | Individual table export (parallel) |

### 5.3 Immediate Snapshot Flow

Even "Snapshot Now" uses cron to prevent request timeouts:

```php
// API receives "snapshot now" request
public function handleSnapshotNow() {
    // Schedule for 5 seconds from now
    $scheduled = wp_schedule_single_event(
        time() + 5,
        'riseup_snapshot_immediate',
        array('tables' => $this->getSelectedTables())
    );
    
    return array(
        'success' => true,
        'message' => 'Snapshot scheduled',
        'scheduled_at' => date('c', time() + 5)
    );
}
```

### 5.4 Parallel Table Processing

For large databases, tables can be exported in parallel cron jobs:

```php
public function scheduleParallelExport(array $tables): void {
    foreach ($tables as $index => $table) {
        wp_schedule_single_event(
            time() + ($index * 2), // Stagger by 2 seconds
            'riseup_snapshot_table',
            array('snapshot_id' => $this->snapshotId, 'table' => $table)
        );
    }
}
```

---

## 6. Logging Requirements

### 6.1 Log Levels

| Level | Usage |
|-------|-------|
| `DEBUG` | Detailed row counts, batch progress |
| `INFO` | Stage start/complete, file creation |
| `WARN` | Memory warnings, slow tables |
| `ERROR` | Failures, exceptions |

### 6.2 Required Log Points

Every snapshot operation MUST log:

1. **Start**: Timestamp, trigger source, selected tables
2. **Provider**: Which provider being used (WP Reset/Updraft/Native)
3. **Per-Table**: Table name, row count, start/end time, bytes written
4. **Progress**: Every 10% completion milestone
5. **Errors**: Full stack trace, table being processed, row offset
6. **Complete**: Total duration, file size, table count, path

### 6.3 Log Format

```
[2026-02-06 14:30:22] [INFO] [SNAPSHOT] Starting snapshot 007
[2026-02-06 14:30:22] [INFO] [SNAPSHOT] Provider: native
[2026-02-06 14:30:22] [INFO] [SNAPSHOT] Tables selected: 12
[2026-02-06 14:30:22] [DEBUG] [SNAPSHOT] Exporting: wp_posts (2,547 rows)
[2026-02-06 14:30:23] [DEBUG] [SNAPSHOT] wp_posts: batch 1/3 complete
[2026-02-06 14:30:24] [DEBUG] [SNAPSHOT] wp_posts: batch 2/3 complete
[2026-02-06 14:30:25] [INFO] [SNAPSHOT] wp_posts complete (1.2MB, 3.1s)
[2026-02-06 14:30:45] [INFO] [SNAPSHOT] Snapshot 007 complete
[2026-02-06 14:30:45] [INFO] [SNAPSHOT] Path: /snapshots/007_2026-02-06_143022.sqlite
[2026-02-06 14:30:45] [INFO] [SNAPSHOT] Size: 15.7MB, Duration: 23.4s
```

---

## 7. Retention Policy

### 7.1 Configuration Options

```php
array(
    'retention_type' => 'days',    // 'days' | 'count' | 'none'
    'retention_days' => 30,        // Days to keep snapshots
    'retention_count' => 10,       // Max snapshots to keep
    'cleanup_schedule' => 'daily'  // When to run cleanup
)
```

### 7.2 Cleanup Logic

```php
public function applyRetentionPolicy() {
    $settings = $this->getSettings();
    $snapshots = $this->listSnapshots();
    
    match ($settings['retention_type']) {
        'days'  => $this->deleteSnapshotsOlderThan($snapshots, $settings['retention_days']),
        'count' => $this->deleteSnapshotsBeyondLimit($snapshots, $settings['retention_count']),
        default => null,
    };
}

private function deleteSnapshotsOlderThan(array $snapshots, int $days): void {
    $cutoff = strtotime("-{$days} days");

    foreach ($snapshots as $snapshot) {
        if ($snapshot['created_at'] < $cutoff) {
            $this->deleteSnapshot($snapshot['id']);
        }
    }
}

private function deleteSnapshotsBeyondLimit(array $snapshots, int $limit): void {
    usort($snapshots, fn($a, $b) => $b['created_at'] <=> $a['created_at']);
    $toDelete = array_slice($snapshots, $limit);

    foreach ($toDelete as $snapshot) {
        $this->deleteSnapshot($snapshot['id']);
    }
}
```

---

## 8. Import/Export

### 8.1 Export Process

1. Locate snapshot SQLite file
2. Create ZIP archive with snapshot + metadata JSON
3. Stream to client with `application/zip` content type

### 8.2 Import Process

1. Receive ZIP upload
2. Validate ZIP structure (must contain .sqlite file)
3. Extract to temp directory
4. Validate SQLite integrity (`PRAGMA integrity_check`)
5. Move to snapshots directory
6. Update manifest.json
7. Log import details

### 8.3 Export Metadata

Each ZIP includes `metadata.json`:

```json
{
    "version": "1.0.0",
    "created_at": "2026-02-06T14:30:22Z",
    "source_site": "https://example.com",
    "wp_version": "6.4.2",
    "tables": ["wp_posts", "wp_postmeta", "..."],
    "table_counts": {"wp_posts": 2547, "wp_postmeta": 15234},
    "total_rows": 45678,
    "provider": "native"
}
```

---

## 9. Restore Process

### 9.1 Full Restore Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Restore Request                           │
│                  POST /snapshots/{id}/restore                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Pre-Restore Validation                       │
│  1. Verify snapshot exists and is valid                     │
│  2. Check user has restore permissions                      │
│  3. Verify MySQL connection is writable                     │
│  4. Log: "Restore initiated for snapshot {id}"              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Create Pre-Restore Backup                     │
│  (Automatic safety snapshot before destructive operation)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Table-by-Table Restore                      │
│                                                              │
│  For each table in snapshot:                                 │
│  1. Log: "Restoring table {name}"                           │
│  2. BEGIN TRANSACTION                                        │
│  3. TRUNCATE MySQL table (or DELETE FROM for safety)        │
│  4. Read rows from SQLite                                   │
│  5. Batch INSERT into MySQL (1000 rows per batch)           │
│  6. COMMIT                                                   │
│  7. Log: "Restored {row_count} rows to {name}"              │
│                                                              │
│  On any error:                                               │
│  - ROLLBACK current table                                    │
│  - Log error with full context                               │
│  - Offer to restore from pre-restore backup                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Post-Restore                              │
│  1. Flush WordPress caches                                   │
│  2. Log: "Restore complete: {table_count} tables"           │
│  3. Return success response                                  │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Selective Restore

Users can restore specific tables only:

```php
POST /snapshots/{id}/restore
{
    "tables": ["wp_posts", "wp_postmeta"],
    "mode": "selective"
}
```

### 9.3 Safety Mechanisms

1. **Pre-Restore Backup**: Always create a snapshot before restoring
2. **Transaction Wrapping**: Each table restore is atomic
3. **Rollback Option**: If restore fails mid-way, offer rollback to pre-restore state
4. **Confirmation Required**: API requires explicit `confirm: true` parameter

---

## 10. REST API Endpoints

### 10.1 Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/snapshots` | List all snapshots |
| `POST` | `/snapshots/schedule` | Schedule a snapshot |
| `GET` | `/snapshots/{id}` | Get snapshot details |
| `DELETE` | `/snapshots/{id}` | Delete a snapshot |
| `POST` | `/snapshots/{id}/restore` | Restore from snapshot |
| `GET` | `/snapshots/{id}/export` | Download as ZIP |
| `POST` | `/snapshots/import` | Upload and import |
| `GET` | `/snapshots/settings` | Get snapshot settings |
| `PUT` | `/snapshots/settings` | Update snapshot settings |
| `GET` | `/snapshots/providers` | List available providers |
| `GET` | `/snapshots/tables` | List available tables |

### 10.2 Request/Response Examples

#### Schedule Snapshot

```http
POST /wp-json/riseup-asia-uploader/v1/snapshots/schedule
Content-Type: application/json

{
    "trigger": "immediate",  // "immediate" | "daily" | "weekly" | "monthly"
    "tables": ["wp_posts", "wp_postmeta", "wp_options"],
    "scope": "custom"  // "all" | "wordpress" | "content" | "custom"
}
```

Response:

```json
{
    "success": true,
    "data": {
        "snapshot_id": "007",
        "scheduled_at": "2026-02-06T14:30:27Z",
        "status": "scheduled",
        "tables": ["wp_posts", "wp_postmeta", "wp_options"]
    }
}
```

#### List Snapshots

```http
GET /wp-json/riseup-asia-uploader/v1/snapshots
```

Response:

```json
{
    "success": true,
    "data": {
        "snapshots": [
            {
                "id": "007",
                "filename": "007_2026-02-06_143022.sqlite",
                "created_at": "2026-02-06T14:30:22Z",
                "size": 16482304,
                "tables": 12,
                "rows": 45678,
                "provider": "native",
                "status": "complete"
            }
        ],
        "total": 7,
        "settings": {
            "retention_type": "days",
            "retention_days": 30
        }
    }
}
```

---

## 11. Database Schema

### 11.1 Snapshots Table

Added to plugin's SQLite database:

```sql
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence INTEGER NOT NULL,
    filename TEXT NOT NULL UNIQUE,
    filepath TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT DEFAULT 'pending',  -- pending, running, complete, failed
    provider TEXT NOT NULL,          -- wp_reset, updraft, native
    scope TEXT NOT NULL,             -- all, wordpress, content, custom
    tables_json TEXT,                -- JSON array of table names
    table_counts_json TEXT,          -- JSON object {table: count}
    total_rows INTEGER,
    file_size INTEGER,
    duration_ms INTEGER,
    triggered_by TEXT,               -- api, cron, manual
    error_message TEXT,
    metadata_json TEXT               -- Additional metadata
);

CREATE INDEX idx_snapshots_created ON snapshots(created_at DESC);
CREATE INDEX idx_snapshots_status ON snapshots(status);
```

### 11.2 Snapshot Progress Table

For tracking in-progress snapshots:

```sql
CREATE TABLE IF NOT EXISTS snapshot_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    table_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',   -- pending, running, complete, failed
    rows_total INTEGER,
    rows_exported INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);
```

---

## 12. Settings Schema

### 12.1 Options Table Entry

Stored in WordPress options as `riseup_snapshot_settings`:

```php
array(
    // Provider
    'preferred_provider' => 'auto',  // auto, wp_reset, updraft, native
    
    // Scheduling
    'schedule_enabled' => false,
    'schedule_frequency' => 'daily',  // daily, weekly, monthly
    'schedule_time' => '03:00',       // 24-hour format, server time
    'schedule_day' => 1,              // Day of week (1-7) or month (1-28)
    
    // Scope
    'default_scope' => 'wordpress',
    'custom_tables' => array(),       // For scope = custom
    
    // Retention
    'retention_type' => 'days',       // days, count, none
    'retention_days' => 30,
    'retention_count' => 10,
    
    // Safety
    'pre_restore_backup' => true,
    'require_restore_confirm' => true,
    
    // Limits
    'max_snapshot_size_mb' => 500,
    'batch_size' => 1000,
)
```

---

## 13. Admin UI Wireframe

### 13.1 Snapshots Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Riseup Asia Uploader > Database Snapshots                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Provider: [Native SQLite ▾]    [Snapshot Now]       │   │
│  │                                                      │   │
│  │ Schedule: [✓] Enabled  [Daily ▾] at [03:00 ▾]       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Table Selection ───────────────────────────────────┐   │
│  │ Scope: ( ) All Tables  (•) WordPress Core           │   │
│  │        ( ) Content Only  ( ) Custom Selection       │   │
│  │                                                      │   │
│  │ [Select Tables...] (when Custom selected)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Snapshots ─────────────────────────────────────────┐   │
│  │ ID   │ Date       │ Size   │ Tables │ Status │ Actions  │
│  │──────┼────────────┼────────┼────────┼────────┼──────────│
│  │ 007  │ 2026-02-06 │ 15.7MB │ 12     │ ✓      │ ⬇ 🔄 🗑  │
│  │ 006  │ 2026-02-05 │ 15.2MB │ 12     │ ✓      │ ⬇ 🔄 🗑  │
│  │ 005  │ 2026-02-04 │ 14.8MB │ 12     │ ✓      │ ⬇ 🔄 🗑  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Retention Policy ──────────────────────────────────┐   │
│  │ Keep snapshots for: [30 ▾] days                     │   │
│  │ Or keep last: [10 ▾] snapshots                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Import Snapshot]  [Save Settings]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 13.2 Action Icons

| Icon | Action |
|------|--------|
| ⬇ | Export/Download ZIP |
| 🔄 | Restore from snapshot |
| 🗑 | Delete snapshot |

---

## 14. Error Handling

### 14.1 Error Codes

| Code | Description |
|------|-------------|
| `SNAPSHOT_LOCK_EXISTS` | Another snapshot is in progress |
| `SNAPSHOT_NOT_FOUND` | Requested snapshot doesn't exist |
| `SNAPSHOT_CORRUPT` | SQLite integrity check failed |
| `SNAPSHOT_TOO_LARGE` | Exceeds max_snapshot_size_mb |
| `RESTORE_FAILED` | Restore operation failed mid-way |
| `RESTORE_PERMISSION` | Insufficient permissions to restore |
| `IMPORT_INVALID_ZIP` | Uploaded file is not valid ZIP |
| `IMPORT_MISSING_SQLITE` | ZIP doesn't contain .sqlite file |
| `PROVIDER_NOT_AVAILABLE` | Selected provider not installed |
| `TABLE_NOT_FOUND` | Selected table doesn't exist |
| `MYSQL_CONNECTION_FAILED` | Cannot connect to MySQL |
| `SQLITE_WRITE_FAILED` | Cannot write to snapshots directory |

### 14.2 Error Response Format

```json
{
    "success": false,
    "error": {
        "code": "SNAPSHOT_LOCK_EXISTS",
        "message": "Another snapshot operation is in progress",
        "details": {
            "lock_file": "/snapshots/.lock",
            "locked_at": "2026-02-06T14:30:00Z",
            "locked_by": "cron"
        }
    }
}
```

---

## 15. Security Considerations

### 15.1 Access Control

- All snapshot endpoints require authentication
- Restore operations require `manage_options` capability
- Export downloads use nonce verification

### 15.2 File Security

- Snapshots directory protected with `.htaccess`:
  ```
  Order Deny,Allow
  Deny from all
  ```
- Direct file access only through authenticated API

### 15.3 Data Sensitivity

- Snapshots may contain sensitive data (user passwords, API keys in options)
- Exports should be treated as confidential
- Consider encryption for stored snapshots (future enhancement)

---

## 16. Performance Considerations

### 16.1 Large Database Handling

- Batch processing (1000 rows) to limit memory
- Progress stored in database for resumability
- Parallel table export via staggered cron jobs

### 16.2 Disk Space

- Monitor available space before snapshot
- Warn if < 2x expected snapshot size available
- ZIP compression reduces storage by ~60-80%

### 16.3 MySQL Impact

- Use `SELECT ... LIMIT/OFFSET` for batching
- Consider `mysqldump` integration for very large tables (future)
- Run during low-traffic periods (scheduled snapshots)

---

## 17. Implementation Phases

| Phase | Description | Priority |
|-------|-------------|----------|
| **19** | Third-Party Detection | HIGH |
| **20** | Native SQLite Engine | HIGH |
| **21** | WP-Cron Scheduling | HIGH |
| **22** | Retention & Cleanup | MEDIUM |
| **23** | Import/Export/Restore | MEDIUM |
| **24** | REST API Endpoints | HIGH |
| **25** | Admin Dashboard UI | MEDIUM |

---

*Specification Version: 1.0.0*  
*Last Updated: 2026-02-06*
