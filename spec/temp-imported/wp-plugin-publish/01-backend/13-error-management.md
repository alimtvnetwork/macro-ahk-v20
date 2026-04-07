# 13 — Error Management

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

Error management is a critical aspect of WP Plugin Publish. All errors must be:

1. **Structured** — Consistent format across the application
2. **Traceable** — Include file, line, function, and stack trace
3. **Categorized** — Use error codes for programmatic handling
4. **Logged** — Persisted to SQLite for UI display
5. **Copyable** — Frontend provides one-click copy for AI debugging

---

## AppError Type

### Definition

```go
// pkg/apperror/error.go
package apperror

import (
    "fmt"
    "runtime"
    "strings"
)

// ErrorContext holds structured context data for an AppError
type ErrorContext struct {
    PluginID   int64  `json:"pluginId,omitempty"`
    PluginName string `json:"pluginName,omitempty"`
    SiteID     int64  `json:"siteId,omitempty"`
    SiteName   string `json:"siteName,omitempty"`
    Endpoint   string `json:"endpoint,omitempty"`
    Action     string `json:"action,omitempty"`
}

// AppError is the standard error type for the application
type AppError struct {
    Code       string        // Error code (e.g., "E1001")
    Message    string        // Human-readable message
    Cause      error         // Underlying error (if any)
    Context    ErrorContext   // Additional context data
    File       string        // Source file where error occurred
    Line       int           // Line number
    Function   string        // Function name
    StackTrace string        // Full stack trace
    Level      string        // "error", "warn", "info"
}

// Error implements the error interface
func (e *AppError) Error() string {
    if e.Cause != nil {
        return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Cause)
    }
    return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *AppError) Unwrap() error {
    return e.Cause
}

// New creates a new AppError with automatic location capture
func New(code string, message string) *AppError {
    return newWithSkip(code, message, nil, 2)
}

// Wrap wraps an existing error with additional context
func Wrap(
	err error,
	code string,
	message string,
) *AppError {
    return newWithSkip(code, message, err, 2)
}

// WithPluginContext adds plugin context to the error
func (e *AppError) WithPluginContext(pluginID int64, pluginName string) *AppError {
    e.Context.PluginID = pluginID
    e.Context.PluginName = pluginName

    return e
}

// WithSiteContext adds site context to the error
func (e *AppError) WithSiteContext(siteID int64, siteName string) *AppError {
    e.Context.SiteID = siteID
    e.Context.SiteName = siteName

    return e
}

// WithLevel sets the error level
func (e *AppError) WithLevel(level string) *AppError {
    e.Level = level
    return e
}

func newWithSkip(
	code string,
	message string,
	cause error,
	skip int,
) *AppError {
    file, line, funcName := callerInfo(skip + 1)

    return &AppError{
        Code:       code,
        Message:    message,
        Cause:      cause,
        Level:      LevelError,
        File:       file,
        Line:       line,
        Function:   funcName,
        StackTrace: captureStackTrace(skip + 1),
    }
}

func callerInfo(skip int) (string, int, string) {
    pc, file, line, ok := runtime.Caller(skip)
    if !ok {
        return "unknown", 0, "unknown"
    }

    return shortenPath(file), line, shortenFuncName(pc)
}

func shortenFuncName(pc uintptr) string {
    fn := runtime.FuncForPC(pc)
    if fn == nil {
        return "unknown"
    }

    name := fn.Name()
    if idx := strings.LastIndex(name, "."); idx >= 0 {
        return name[idx+1:]
    }

    return name
}

func shortenPath(path string) string {
    if idx := strings.LastIndex(path, "/"); idx >= 0 {
        return path[idx+1:]
    }

    return path
}
```

---

## Stack Trace Capture

```go
// pkg/apperror/stack.go
package apperror

import (
    "fmt"
    "runtime"
    "strings"
)

const maxStackDepth = 32

func captureStackTrace(skip int) string {
    pcs := make([]uintptr, maxStackDepth)
    n := runtime.Callers(skip+1, pcs)
    frames := runtime.CallersFrames(pcs[:n])

    return formatFrames(frames)
}

func formatFrames(frames *runtime.Frames) string {
    var sb strings.Builder

    for {
        frame, more := frames.Next()
        appendFrameIfRelevant(&sb, frame)

        if !more {
            break
        }
    }

    return sb.String()
}

func appendFrameIfRelevant(sb *strings.Builder, frame runtime.Frame) {
    isRuntime := strings.Contains(frame.File, "runtime/")
    if isRuntime {
        return
    }

    sb.WriteString(fmt.Sprintf("  at %s\n     %s:%d\n",
        frame.Function, frame.File, frame.Line,
    ))
}
```

---

## Error Codes

Error codes are defined in [66-shared-constants.md](../66-shared-constants.md).

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

### Code Definitions

```go
// pkg/apperror/codes.go
package apperror

// Error level constants
const (
    LevelError = "error"
    LevelWarn  = "warn"
    LevelInfo  = "info"
)

// Error code prefix for category matching
const errPrefixValidation = "E6"

// Configuration errors (E1xxx)
const (
    ErrConfigLoad    = "E1001"  // Failed to load configuration file
    ErrConfigParse   = "E1002"  // Failed to parse configuration
    ErrConfigMissing = "E1003"  // Required configuration missing
    ErrConfigInvalid = "E1004"  // Configuration value invalid
)

// Database errors (E2xxx)
const (
    ErrDatabaseOpen   = "E2001"  // Failed to open database
    ErrDatabaseQuery  = "E2002"  // Query execution failed
    ErrDatabaseExec   = "E2003"  // Statement execution failed
    ErrDatabaseTx     = "E2004"  // Transaction error
    ErrNotFound       = "E2005"  // Record not found
    ErrDuplicate      = "E2006"  // Duplicate record
)

// WordPress API errors (E3xxx)
const (
    ErrWPConnect     = "E3001"  // Failed to connect to WordPress
    ErrWPAuth        = "E3002"  // Authentication failed
    ErrWPAPI         = "E3003"  // API request failed
    ErrWPPlugin      = "E3004"  // Plugin operation failed
    ErrWPUpload      = "E3005"  // File upload failed
    ErrWPActivate    = "E3006"  // Plugin activation failed
    ErrWPDeactivate  = "E3007"  // Plugin deactivation failed
)

// File system errors (E4xxx)
const (
    ErrFileRead     = "E4001"  // Failed to read file
    ErrFileWrite    = "E4002"  // Failed to write file
    ErrFileDelete   = "E4003"  // Failed to delete file
    ErrDirCreate    = "E4004"  // Failed to create directory
    ErrDirRead      = "E4005"  // Failed to read directory
    ErrZipCreate    = "E4006"  // Failed to create zip archive
    ErrZipExtract   = "E4007"  // Failed to extract zip archive
    ErrPathInvalid  = "E4008"  // Invalid file path
    ErrPathNotExist = "E4009"  // Path does not exist
)

// Sync/publish errors (E5xxx)
const (
    ErrSyncCheck      = "E5001"  // Sync check failed
    ErrSyncConflict   = "E5002"  // Sync conflict detected
    ErrPublishFailed  = "E5003"  // Publish operation failed
    ErrBackupFailed   = "E5004"  // Backup creation failed
    ErrRestoreFailed  = "E5005"  // Restore operation failed
    ErrWatcherStart   = "E5006"  // File watcher failed to start
    ErrWatcherEvent   = "E5007"  // File watcher event error
)

// Validation errors (E6xxx)
const (
    ErrValidation      = "E6001"  // Generic validation error
    ErrValidationURL   = "E6002"  // Invalid URL format
    ErrValidationPath  = "E6003"  // Invalid path format
    ErrValidationEmpty = "E6004"  // Required field is empty
)

// Internal errors (E9xxx)
const (
    ErrInternal    = "E9001"  // Unexpected internal error
    ErrPanic       = "E9002"  // Recovered from panic
    ErrNotImpl     = "E9003"  // Feature not implemented
)
```

---

## Error Logging to Database

```go
// internal/logger/db_writer.go
package logger

import (
    "database/sql"
    "encoding/json"
    
    "wp-plugin-publish/pkg/apperror"
)

type DBWriter struct {
    db *sql.DB
}

func NewDBWriter(db *sql.DB) *DBWriter {
    return &DBWriter{db: db}
}

func (w *DBWriter) Write(err *apperror.AppError) error {
    contextJSON, _ := json.Marshal(err.Context)

    return w.insertErrorLog(err, string(contextJSON))
}

func (w *DBWriter) insertErrorLog(err *apperror.AppError, contextJSON string) error {
    _, dbErr := w.db.Exec(`
        INSERT INTO ErrorLogs (Level, Code, Message, Context, StackTrace, File, Line, Function)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
        err.Level, err.Code, err.Message, contextJSON,
        err.StackTrace, err.File, err.Line, err.Function,
    )

    return dbErr
}
```

---

## Error Response Format

### HTTP API Response

```go
// internal/api/handlers/errors.go
type ErrorResponse struct {
    Success bool   `json:"success"`
    Error   Error  `json:"error"`
}

type Error struct {
    Code       string        `json:"code"`
    Message    string        `json:"message"`
    Details    string        `json:"details,omitempty"`
    Context    ErrorContext   `json:"context,omitempty"`
    File       string        `json:"file,omitempty"`
    Line       int           `json:"line,omitempty"`
    Function   string        `json:"function,omitempty"`
    StackTrace string        `json:"stackTrace,omitempty"`
    Timestamp  string        `json:"timestamp"`
}

func WriteError(w http.ResponseWriter, err error) {
    appErr := toAppError(err)
    status := getHTTPStatus(appErr.Code)
    resp := buildErrorResponse(appErr)

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(resp)
}

func toAppError(err error) *apperror.AppError {
    appErr, ok := err.(*apperror.AppError)
    if ok {
        return appErr
    }

    return apperror.Wrap(err, apperror.ErrInternal, "unexpected error")
}

func buildErrorResponse(appErr *apperror.AppError) ErrorResponse {
    return ErrorResponse{
        Success: false,
        Error: Error{
            Code:       appErr.Code,
            Message:    appErr.Message,
            Details:    getErrorDetails(appErr),
            Context:    appErr.Context,
            File:       appErr.File,
            Line:       appErr.Line,
            Function:   appErr.Function,
            StackTrace: appErr.StackTrace,
            Timestamp:  time.Now().UTC().Format(time.RFC3339),
        },
    }
}

func getHTTPStatus(code string) int {
    switch {
    case code == ErrNotFound:
        return http.StatusNotFound
    case code == ErrWPAuth:
        return http.StatusUnauthorized
    case strings.HasPrefix(code, errPrefixValidation):
        return http.StatusBadRequest
    default:
        return http.StatusInternalServerError
    }
}
```

---

## Panic Recovery

```go
// internal/api/middleware/recovery.go
package middleware

import (
    "net/http"
    "runtime/debug"
    
    "wp-plugin-publish/internal/logger"
    "wp-plugin-publish/pkg/apperror"
)

func Recovery(log *logger.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if rec := recover(); rec != nil {
                    err := apperror.New(apperror.ErrPanic, fmt.Sprintf("panic: %v", rec))
                    err.StackTrace = string(debug.Stack())
                    
                    log.Error("Panic recovered", 
                        "error", err,
                        "method", r.Method,
                        "path", r.URL.Path,
                    )
                    
                    WriteError(w, err)
                }
            }()
            next.ServeHTTP(w, r)
        })
    }
}
```

---

## Live Progress Streaming

All long-running operations stream progress via WebSocket to provide real-time feedback.

### WebSocket Events

| Event | Description | Data |
|-------|-------------|------|
| `connection_test_started` | Site connection test begins | `{siteId}` |
| `connection_test_progress` | Step-by-step progress | `{siteId, step, status, message, details}` |
| `connection_test_complete` | Test finished | `{siteId, success}` |
| `sync_started` | Sync check begins | `{pluginId, siteId}` |
| `sync_progress` | Scan/compare progress | `{pluginId, siteId, step, progress, message}` |
| `sync_complete` | Sync finished | `{pluginId, siteId, inSync}` |
| `publish_started` | Publish pipeline begins | `{pluginId, siteId}` |
| `publish_progress` | Stage progress | `{pluginId, siteId, step, progress, message}` |
| `publish_complete` | Publish finished | `{pluginId, siteId, success}` |

### Progress Event Structure

```json
{
  "type": "connection_test_progress",
  "data": {
    "siteId": 1,
    "step": "auth_check",
    "status": "success",
    "message": "Authenticated as admin (ID: 1)",
    "details": {
      "userId": 1,
      "roles": ["administrator"]
    }
  },
  "timestamp": "2026-02-04T01:00:00Z"
}
```

### Connection Test Steps

The WordPress connection test performs multiple validation steps:

1. **dns_check** — Can we reach the site URL?
2. **rest_api_check** — Is `/wp-json/` accessible?
3. **auth_check** — Valid username + application password?
4. **plugin_access_check** — Can user manage plugins?
5. **write_test** — Create/delete a draft post (non-destructive verification)

### Testing Command Equivalent

The backend test is equivalent to:

```bash
# Test authentication via POST (WordPress REST API)
curl -v \
  -u 'username:app_password' \
  -X POST 'https://site.com/wp-json/wp/v2/posts' \
  -H 'Content-Type: application/json' \
  -d '{"title":"WP Plugin Publish Test","content":"testing auth","status":"draft"}'
```

### Connection Result

```go
type ConnectionInfo struct {
    Connected        bool     `json:"connected"`
    Username         string   `json:"username"`
    WPVersion        string   `json:"wpVersion,omitempty"`
    SiteName         string   `json:"siteName,omitempty"`
    SiteDescription  string   `json:"siteDescription,omitempty"`
    UserID           int      `json:"userId,omitempty"`
    UserDisplayName  string   `json:"userDisplayName,omitempty"`
    UserRoles        []string `json:"userRoles,omitempty"`
    CanManagePlugins bool     `json:"canManagePlugins"`
    CanWritePosts    bool     `json:"canWritePosts"`
}
```

---

## Frontend Error Display

The React frontend receives error responses and displays them in an Error Console modal. See [24-error-console.md](../02-frontend/24-error-console.md) for UI implementation.

### Error Store (`src/stores/errorStore.ts`)

The Zustand-based error store provides:

1. **`captureError(apiError, meta?)`** — Captures API errors with request context
2. **`captureException(error, context?)`** — Captures JS exceptions with stack trace
3. **`openErrorModal(error)`** — Opens the detailed error modal

### Usage Pattern

```typescript
import { useErrorStore } from "@/stores/errorStore";

const { captureError, captureException, openErrorModal } = useErrorStore();

// For API errors
if (response.error) {
  const captured = captureError(response.error, { 
    endpoint: "/sites", 
    method: "POST",
    requestBody: { ...data, password: "***" }
  });
  toast.error(response.error.message, {
    action: { label: "View Details", onClick: () => openErrorModal(captured) }
  });
}

// For exceptions
catch (error) {
  const captured = captureException(error, { context: "site creation" });
  toast.error("Operation failed", {
    action: { label: "Details", onClick: () => openErrorModal(captured) }
  });
}
```

### Copy-to-Clipboard Format

```
=== WP Plugin Publish Error ===
Timestamp: 2026-02-01T10:30:00Z
Code: E3002
Message: Authentication failed
Details: WordPress returned 401 Unauthorized

Context:
  site_url: https://example.com
  username: admin

Location: auth.go:45 in validateCredentials

Stack Trace:
  at validateCredentials
     internal/wordpress/auth.go:45
  at TestConnection
     internal/services/site/service.go:78
  at handleTestConnection
     internal/api/handlers/sites.go:112
```

---

## Error Handling Best Practices

### DO

```go
// ✅ Wrap errors with context
if err := db.Query(...); err != nil {
    return apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to fetch sites")
        .WithContext("limit", limit)
        .WithContext("offset", offset)
}

// ✅ Use specific error codes
if site == nil {
    return apperror.New(apperror.ErrNotFound, "site not found")
        .WithContext("site_id", siteID)
}

// ✅ Validate early
isUrlEmpty := url == ""

if isUrlEmpty {
    return apperror.New(apperror.ErrValidationEmpty, "site URL is required")
}

// ✅ Stream progress for long operations
s.broadcastProgress(pluginID, siteID, "packaging", 30, "Building package...")
```

### DON'T

```go
// ❌ Don't swallow errors
result, _ := doSomething()  // Never ignore errors

// ❌ Don't use generic messages
return fmt.Errorf("error occurred")  // Too vague

// ❌ Don't log and return
log.Error(err)
return err  // Double logging
```

---

## Session-Based Error Logging

### Integration with Session Service

All errors that occur during session-tracked operations are automatically logged to the session file:

```go
// In publish service
sessionService.Log(sessionID, apperror.LevelError, "upload", "Upload failed", SessionUploadFailedDetails{
    URL:        uploadURL,
    HTTPStatus: resp.StatusCode,
    Response:   truncateString(string(body), 2000),
    Error:      err.Error(),
})
```

### Frontend Session Tab

The GlobalErrorModal includes a "Session" tab when `sessionId` is present in the captured error:

```typescript
interface CapturedError {
  // ... existing fields
  sessionId?: string;
  sessionType?: 'publish' | 'sync' | 'backup' | 'connect';
}

// Capture with session context
captureError(error, {
  sessionId: result.sessionId,
  sessionType: 'publish',
  pluginId: 3,
  siteId: 1
});
```

### Session Logs Tab Component

The `SessionLogsTab` component:

1. Fetches logs from `/api/v1/sessions/{id}/logs`
2. Provides syntax highlighting for stages, errors, warnings
3. Includes Copy, Download, and Refresh buttons
4. Shows session metadata (ID, type, duration)

See [17-session-management.md](./17-session-management.md) for full session service documentation.

---

## Next Document

See [14-logging-system.md](./14-logging-system.md) for detailed logging implementation.
