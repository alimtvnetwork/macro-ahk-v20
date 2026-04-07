# 66 — Shared Constants

> **Parent:** [00-overview.md](./00-overview.md)  
> **Status:** Draft  
> **Purpose:** Single Source of Truth (SSOT) for all constants, enums, and error codes

---

## Error Codes

### Code Structure

```
E{category}{number}

Categories:
- E1xxx: Configuration errors
- E2xxx: Database errors
- E3xxx: WordPress API errors
- E4xxx: File system errors
- E5xxx: Sync/publish errors
- E6xxx: Validation errors
- E9xxx: Internal/unexpected errors
```

### Configuration Errors (E1xxx)

| Code | Name | Description |
|------|------|-------------|
| E1001 | ErrConfigLoad | Failed to load configuration file |
| E1002 | ErrConfigParse | Failed to parse configuration JSON |
| E1003 | ErrConfigMissing | Required configuration field missing |
| E1004 | ErrConfigInvalid | Configuration value is invalid |

### Database Errors (E2xxx)

| Code | Name | Description |
|------|------|-------------|
| E2001 | ErrDatabaseOpen | Failed to open SQLite database |
| E2002 | ErrDatabaseQuery | Query execution failed |
| E2003 | ErrDatabaseExec | Statement execution failed |
| E2004 | ErrDatabaseTx | Transaction error |
| E2005 | ErrNotFound | Record not found |
| E2006 | ErrDuplicate | Duplicate record (unique constraint) |

### WordPress API Errors (E3xxx)

| Code | Name | Description |
|------|------|-------------|
| E3001 | ErrWPConnect | Failed to connect to WordPress site |
| E3002 | ErrWPAuth | Authentication failed (invalid credentials) |
| E3003 | ErrWPAPI | WordPress REST API request failed |
| E3004 | ErrWPPlugin | Plugin operation failed |
| E3005 | ErrWPUpload | File upload to WordPress failed |
| E3006 | ErrWPActivate | Plugin activation failed |
| E3007 | ErrWPDeactivate | Plugin deactivation failed |
| E3008 | ErrWPVersion | WordPress version incompatible |

### File System Errors (E4xxx)

| Code | Name | Description |
|------|------|-------------|
| E4001 | ErrFileRead | Failed to read file |
| E4002 | ErrFileWrite | Failed to write file |
| E4003 | ErrFileDelete | Failed to delete file |
| E4004 | ErrDirCreate | Failed to create directory |
| E4005 | ErrDirRead | Failed to read directory |
| E4006 | ErrZipCreate | Failed to create zip archive |
| E4007 | ErrZipExtract | Failed to extract zip archive |
| E4008 | ErrPathInvalid | Invalid file path |
| E4009 | ErrPathNotExist | Path does not exist |
| E4010 | ErrPermission | Permission denied |

### Sync/Publish Errors (E5xxx)

| Code | Name | Description |
|------|------|-------------|
| E5001 | ErrSyncCheck | Sync comparison check failed |
| E5002 | ErrSyncConflict | Conflict between local and remote |
| E5003 | ErrPublishFailed | Publish operation failed |
| E5004 | ErrBackupFailed | Backup creation failed |
| E5005 | ErrRestoreFailed | Restore from backup failed |
| E5006 | ErrWatcherStart | File watcher failed to start |
| E5007 | ErrWatcherEvent | File watcher event error |
| E5008 | ErrHashMismatch | File hash verification failed |

### Validation Errors (E6xxx)

| Code | Name | Description |
|------|------|-------------|
| E6001 | ErrValidation | Generic validation error |
| E6002 | ErrValidationURL | Invalid URL format |
| E6003 | ErrValidationPath | Invalid path format |
| E6004 | ErrValidationEmpty | Required field is empty |
| E6005 | ErrValidationLength | Field exceeds max length |
| E6006 | ErrValidationFormat | Invalid format |

### Internal Errors (E9xxx)

| Code | Name | Description |
|------|------|-------------|
| E9001 | ErrInternal | Unexpected internal error |
| E9002 | ErrPanic | Recovered from panic |
| E9003 | ErrNotImpl | Feature not implemented |
| E9004 | ErrTimeout | Operation timed out |

---

## Enums

### SyncRecordOperation

| Value | Description |
|-------|-------------|
| `check` | Sync comparison check |
| `publish_single` | Single file publish |
| `publish_full` | Full plugin zip publish |

### SyncRecordStatus

| Value | Description |
|-------|-------------|
| `pending` | Operation queued |
| `in_progress` | Operation running |
| `completed` | Operation succeeded |
| `failed` | Operation failed |

### FileChangeType

| Value | Description |
|-------|-------------|
| `created` | New file created |
| `modified` | Existing file modified |
| `deleted` | File deleted |
| `renamed` | File renamed |

### LogLevel

| Value | Description |
|-------|-------------|
| `debug` | Detailed development info |
| `info` | Normal operational messages |
| `warn` | Warning conditions |
| `error` | Error conditions |

---

## WebSocket Events

### Client → Server

| Event | Description | Payload |
|-------|-------------|---------|
| `subscribe_plugin` | Subscribe to plugin updates | `{ pluginId: number }` |
| `unsubscribe_plugin` | Unsubscribe from plugin | `{ pluginId: number }` |

### Server → Client

| Event | Description | Payload |
|-------|-------------|---------|
| `file_change` | Local file changed | `{ pluginId, filePath, changeType }` |
| `sync_started` | Sync operation started | `{ pluginId, operation }` |
| `sync_progress` | Sync progress update | `{ pluginId, progress, total }` |
| `sync_complete` | Sync operation finished | `{ pluginId, status, filesChanged }` |
| `error` | Error occurred | `ErrorLog` object |
| `connection_test` | Site connection result | `{ siteId, success, error? }` |

---

## HTTP Status Mapping

| Error Code Prefix | HTTP Status |
|-------------------|-------------|
| E2005 (NotFound) | 404 Not Found |
| E3002 (Auth) | 401 Unauthorized |
| E6xxx (Validation) | 400 Bad Request |
| E3xxx (WP API) | 502 Bad Gateway |
| E9xxx (Internal) | 500 Internal Server Error |
| Default | 500 Internal Server Error |

---

## Configuration Defaults

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `8080` | HTTP server port |
| `watch_debounce_ms` | `500` | File watcher debounce time |
| `backup_retention_days` | `30` | Days to keep backups |
| `max_backups_per_plugin` | `10` | Maximum backups per plugin |
| `temp_directory` | `.temp` | Temporary file directory |
| `backup_directory` | `backups` | Backup storage directory |
| `log_level` | `info` | Minimum log level |

---

## Database Constraints

| Constraint | Value | Description |
|------------|-------|-------------|
| `site_url_max_length` | 2048 | Maximum URL length |
| `plugin_name_max_length` | 255 | Maximum plugin name length |
| `path_max_length` | 4096 | Maximum file path length |
| `error_message_max_length` | 1000 | Maximum error message length |
| `stack_trace_max_length` | 10000 | Maximum stack trace length |

---

## Go Constants File

```go
// pkg/apperror/codes.go
package apperror

// Error code constants - see 66-shared-constants.md for full documentation

// Configuration errors (E1xxx)
const (
    ErrConfigLoad    = "E1001"
    ErrConfigParse   = "E1002"
    ErrConfigMissing = "E1003"
    ErrConfigInvalid = "E1004"
)

// Database errors (E2xxx)
const (
    ErrDatabaseOpen  = "E2001"
    ErrDatabaseQuery = "E2002"
    ErrDatabaseExec  = "E2003"
    ErrDatabaseTx    = "E2004"
    ErrNotFound      = "E2005"
    ErrDuplicate     = "E2006"
)

// ... (see full list in error codes section)
```

---

## TypeScript Constants File

```typescript
// src/lib/constants.ts

// Error codes
export const ErrorCodes = {
  // Configuration (E1xxx)
  CONFIG_LOAD: 'E1001',
  CONFIG_PARSE: 'E1002',
  CONFIG_MISSING: 'E1003',
  CONFIG_INVALID: 'E1004',
  
  // Database (E2xxx)
  DATABASE_OPEN: 'E2001',
  DATABASE_QUERY: 'E2002',
  DATABASE_EXEC: 'E2003',
  DATABASE_TX: 'E2004',
  NOT_FOUND: 'E2005',
  DUPLICATE: 'E2006',
  
  // ... (see full list in error codes section)
} as const;

// Sync operations
export const SyncOperation = {
  CHECK: 'check',
  PUBLISH_SINGLE: 'publish_single',
  PUBLISH_FULL: 'publish_full',
} as const;

// Sync statuses
export const SyncStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

// File change types
export const FileChangeType = {
  CREATED: 'created',
  MODIFIED: 'modified',
  DELETED: 'deleted',
  RENAMED: 'renamed',
} as const;

// Log levels
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
```

---

## Validation Rules

### Site URL
- Must be valid HTTP/HTTPS URL
- Must not have trailing slash
- Maximum 2048 characters

### Plugin Local Path
- Must be absolute path
- Must exist on filesystem
- Must be a directory
- Maximum 4096 characters

### Plugin Remote Slug
- Must be lowercase
- May contain hyphens
- No spaces allowed
- Maximum 255 characters

### Application Password
- Must be 24 characters (WP format: xxxx xxxx xxxx xxxx xxxx xxxx)
- Spaces optional in input (normalized internally)

---

*This file is the SSOT. Update this when adding new constants, error codes, or enums.*
