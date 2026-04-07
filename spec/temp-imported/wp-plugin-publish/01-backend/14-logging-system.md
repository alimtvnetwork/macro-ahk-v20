# 14 — Logging System

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Active

---

## Overview

Every log entry must include:
- **Timestamp** — Configurable format (single source of truth: `config.json` → `logging.timeFormat`)
- **Level** — debug, info, warn, error
- **Message** — Human-readable description
- **File** — Source file name
- **Line** — Line number
- **Context** — Relevant data as key-value pairs

---

## Timestamp Configuration (SINGLE SOURCE OF TRUTH)

The timestamp format is configured in **one place only**: `config.json` → `logging.timeFormat`.

### Default Format

```
2006-01-02 03:04:05 PM
```

This produces output like:

```
[2026-02-04 03:16:26 PM] INFO  main.go:52 - Starting application name=WP Plugin Publish version=1.0.0
```

### Configuration

```json
// config.json
{
  "logging": {
    "level": "info",
    "retentionDays": 7,
    "debugMode": false,
    "timeFormat": "2006-01-02 03:04:05 PM"
  }
}
```

### Go Time Format Reference

| Format String | Output Example |
|---------------|----------------|
| `2006-01-02 03:04:05 PM` | `2026-02-04 03:16:26 PM` (12-hour, default) |
| `2006-01-02 15:04:05` | `2026-02-04 15:16:26` (24-hour) |
| `time.RFC3339` | `2026-02-04T15:16:26+08:00` (ISO8601) |
| `Jan 02 15:04:05` | `Feb 04 15:16:26` |

### Implementation

```go
// backend/cmd/server/main.go
cfg, err := config.Load("config.json")
// ...
log := logger.New(logger.Config{
    Level:      parseLogLevel(cfg.Logging.Level),
    TimeFormat: cfg.Logging.TimeFormat,  // <-- from config
})
```

---

## Logger Implementation

### Core Logger

```go
// internal/logger/logger.go
package logger

type Config struct {
    Level      Level
    Output     io.Writer
    TimeFormat string   // Go time layout string
    NoColor    bool
}

func New(cfg Config) *Logger {
    if cfg.Output == nil {
        cfg.Output = os.Stdout
    }
    if cfg.TimeFormat == "" {
        cfg.TimeFormat = "2006-01-02 03:04:05 PM"  // 12-hour default
    }
    return &Logger{config: cfg}
}
```

### Log Output Format

```
[TIMESTAMP] LEVEL file:line - message key=value...
```

Example:
```
[2026-02-04 03:16:26 PM] INFO  service.go:45 - Starting plugin publish plugin_id=1 site_id=2
```

---

## Log Levels Usage

| Level | When to Use | Example |
|-------|-------------|---------|
| Debug | Development details, variable values | `log.Debug("Hash calculated", "hash", hash)` |
| Info | Normal operations, milestones | `log.Info("Plugin published", "id", id)` |
| Warn | Recoverable issues, deprecations | `log.Warn("Retrying connection", "attempt", 2)` |
| Error | Failures, exceptions | `log.Error("Publish failed", "error", err)` |

---

## Request Logging Middleware

The `Logging` middleware captures **both** the inbound request body (from React) and the outbound response body (from the handler), then persists a rich diagnostic entry to `error.log.txt` for every error response (status ≥ 400).

```go
// internal/api/middleware/middleware.go
func Logging(log *logger.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            requestBodyBytes := captureRequestBody(r)

            rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
            next.ServeHTTP(rw, r)

            logRequest(log, r, rw, time.Since(start))
            persistErrorIfNeeded(r, rw, time.Since(start), requestBodyBytes)
        })
    }
}

func captureRequestBody(r *http.Request) []byte {
    if r.Body == nil {
        return nil
    }

    bodyBytes, _ := io.ReadAll(r.Body)
    r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

    return bodyBytes
}

func logRequest(
	log *logger.Logger,
	r *http.Request,
	rw *responseWriter,
	duration time.Duration,
) {
    log.Info("HTTP request",
        "method", r.Method,
        "path", r.URL.Path,
        "status", rw.statusCode,
        "duration", duration.String(),
    )
}

func persistErrorIfNeeded(
	r *http.Request,
	rw *responseWriter,
	duration time.Duration,
	body []byte,
) {
    isErrorResponse := rw.statusCode >= 400 && ErrorLogDir != ""

    if isErrorResponse {
        appendToErrorLog(r, rw, duration, body)
    }
}
```

### Request Body Capture

The middleware reads `r.Body` into a byte slice **before** the handler runs, then restores it via `io.NopCloser(bytes.NewBuffer(...))` so the handler can read it normally. This ensures the full JSON body sent from React is available for logging without interfering with handler logic.

### Response Body Capture

The `responseWriter` wrapper intercepts `Write()` calls to buffer the response body **only** for error responses (status ≥ 400). Successful responses are not buffered, avoiding unnecessary memory overhead.

```go
func (rw *responseWriter) Write(b []byte) (int, error) {
    if rw.statusCode >= 400 {
        rw.body.Write(b) // capture for error.log.txt
    }
    return rw.ResponseWriter.Write(b)
}
```

---

## Middleware Error Log Persistence

> **Added:** v1.19.5 — Basic format  
> **Updated:** v1.19.6 — Full diagnostic format with envelope parsing

All HTTP error responses (status ≥ 400) are automatically appended to `data/errors/error.log.txt` by the `Logging` middleware. This ensures the Global Error Modal's **Log** tab always has diagnostic content — not just for remote plugin action failures.

### Initialization

The `ErrorLogDir` package-level variable must be set in `main.go` after the errors directory is created:

```go
// backend/cmd/server/main.go
import "wp-plugin-publish/internal/api/middleware"

errorsDir := filepath.Join(filepath.Dir(cfg.DatabasePath), "errors")
os.MkdirAll(errorsDir, 0755)

// Enable middleware-level error logging to error.log.txt
middleware.ErrorLogDir = errorsDir
```

When `ErrorLogDir` is empty (zero value), error-log persistence is disabled.

### Envelope Parsing

The middleware parses the response body as a Universal Response Envelope to extract structured diagnostic data. A lightweight `envelopeForParsing` struct is used to avoid importing the full envelope package:

```go
type envelopeForParsing struct {
    Status struct {
        Code    int    `json:"Code"`
        Message string `json:"Message"`
    } `json:"Status"`
    Errors *struct {
        BackendMessage             string   `json:"BackendMessage"`
        DelegatedServiceErrorStack []string `json:"DelegatedServiceErrorStack"`
        Backend                    []string `json:"Backend"`
    } `json:"Errors"`
    MethodsStack *struct {
        Backend []struct {
            Method     string `json:"Method"`
            File       string `json:"File"`
            LineNumber int    `json:"LineNumber"`
        } `json:"Backend"`
    } `json:"MethodsStack"`
    Attributes *struct {
        RequestedAt        string `json:"RequestedAt"`
        RequestDelegatedAt string `json:"RequestDelegatedAt"`
    } `json:"Attributes"`
}
```

### Log Entry Format (Full Diagnostic)

Each error entry is appended to `error.log.txt` with the following structure:

```
[2026-02-09 01:25:31] HTTP 400 POST FAILED
  Requested To: POST http://localhost:9400/api/v1/sites/1/remote-plugins/disable
  Request Body:
    {
      "slug": "my-plugin"
    }
  Duration: 732.1µs
  Error Code: 400
  Error Message: Plugin slug is required in JSON body
  RequestedAt: 2026-02-09T01:25:31Z
  RequestDelegatedAt: 2026-02-09T01:25:31Z
  Backend Error: [E3004] Plugin operation failed
  Delegated Service Error Stack (PHP):
    #0 PluginManager::disable() at /var/www/html/wp-content/plugins/riseup-asia-uploader/includes/PluginManager.php:145
    #1 RestController::handleDisable() at /var/www/html/wp-content/plugins/riseup-asia-uploader/includes/RestController.php:89
  Go Backend Stack:
    at executeRemotePluginAction service.go:1245
    at DisablePlugin service.go:1180
  Go Methods Stack:
    #0 HandleDisablePlugin at site_handlers.go:234
    #1 executeRemotePluginAction at service.go:1245
  Response Body:
    {"Status":{"IsSuccess":false,"IsFailed":true,"Code":400,...},...}
───────────────────────────────────────────────────────────────────────────────
```

### Field Reference

| Block | Field | Source | Description |
|-------|-------|--------|-------------|
| **Request** | `Requested To` | `r.Method` + `r.Host` + `r.URL.RequestURI()` | Full Go endpoint URL that React called |
| | `Query Params` | `r.URL.RawQuery` | URL query string (omitted if empty) |
| | `Request Body` | `r.Body` (captured pre-handler) | Pretty-printed JSON body from React |
| **Timing** | `Duration` | `time.Since(start)` | Total request processing time |
| **Envelope** | `Error Code` | `Status.Code` | HTTP status from envelope |
| | `Error Message` | `Status.Message` | Human-readable error from envelope |
| | `RequestedAt` | `Attributes.RequestedAt` | When Go received the request |
| | `RequestDelegatedAt` | `Attributes.RequestDelegatedAt` | When Go forwarded to PHP |
| **Errors** | `Backend Error` | `Errors.BackendMessage` | Go-side error message with code |
| | `Delegated Service Error Stack (PHP)` | `Errors.DelegatedServiceErrorStack` | PHP stack trace frames from remote |
| | `Go Backend Stack` | `Errors.Backend` | Go runtime stack trace lines |
| **Debug** | `Go Methods Stack` | `MethodsStack.Backend` | Call chain: Method, File, LineNumber |
| **Response** | `Response Body` | `rw.body` | Full envelope JSON response |

### Conditional Sections

- **Errors block**: Present by default (`includeErrors` defaults to `true` since v1.19.7)
- **MethodsStack block**: Present by default (`includeMethodsStack` defaults to `true` since v1.19.7)
- **Stack traces**: Present by default (`includeStackTrace` defaults to `true` since v1.19.7)
- **RequestDelegatedAt**: Only present for operations that delegate to a remote service (e.g., PHP)
- **Query Params**: Omitted when empty
- **Request Body**: Omitted for GET/DELETE requests with no body

### Go Stack Trace Auto-Capture (v1.19.7+)

All error responses via `respondError()` now use `envelope.ErrorWithStack()` which auto-captures:
1. **Backend trace** (`Errors.Backend`): Go runtime stack frames filtered to `wp-plugin-publish/` namespace
2. **Methods stack** (`MethodsStack.Backend`): Structured `MethodFrame` objects with Method, File, LineNumber

This ensures **every** error — even simple validation failures like "Plugin slug is required" — includes full Go call chain diagnostics in the envelope, visible in the Global Error Modal's Stack, Execution, and Request tabs.

### Truncation

Both request and response bodies exceeding **4,096 bytes** are truncated with a `... (truncated)` suffix to prevent the log file from growing excessively due to large payloads.

### Relationship to Site Service Error Logging

The middleware error log is **complementary** to the existing `logToErrorFile()` in `site/service.go`:

| Source | Scope | Deduplication | Format |
|--------|-------|---------------|--------|
| `middleware.Logging` | **All** HTTP errors (≥ 400) | None (every error logged) | Full diagnostic with envelope parsing |
| `site.logToErrorFile` | Remote plugin action failures only | MD5-based hash suppression | Redefined Log Format with PHP error sessions |

Both write to the same file (`data/errors/error.log.txt`) via append. The middleware provides baseline coverage so that **no error goes unrecorded**, while the site service provides enriched diagnostics for remote operations (PHP error sessions from SQLite, guard rail detection).

---

## Key Requirements

1. **Single source of truth**: Timestamp format MUST be configurable from `config.json` → `logging.timeFormat` only
2. **Default**: 12-hour clock format (`2006-01-02 03:04:05 PM`)
3. **Customizable**: Users can change to 24-hour or any Go time layout
4. **Consistent**: All backend logs use the same format

---

## Session-Based Logging

For operation-specific logs (publish, sync, backup), use the Session Service instead of the global logger. Session logs are:

- Isolated to individual operation files
- Retrievable via REST API
- Correlated with WebSocket events via `sessionId`

### Detailed Stage Context Logging

The publish pipeline requires granular context for upload and activate stages:

```go
type StageContext struct {
    What      string           // What is being processed
    Why       string           // Why this operation is happening
    Where     string           // Target URL/path
    Result    string           // Outcome summary
    InnerData json.RawMessage  // HTTP status, response bodies, etc.
}

// StageInnerData holds the typed fields for StageContext.InnerData
type StageInnerData struct {
    ZipPath    string `json:"zipPath,omitempty"`
    FileCount  int    `json:"fileCount,omitempty"`
    HTTPStatus int    `json:"httpStatus,omitempty"`
    RemoteSlug string `json:"remoteSlug,omitempty"`
}
```

Example log entry:

```
[2026-02-05 01:24:27] [INFO] [upload] Starting upload
    {
      "what": "Plugin ZIP (category-generator.zip, 45.2 KB)",
      "why": "User initiated publish",
      "where": "https://example.com/wp-json/riseup-asia-uploader/v1/upload",
      "result": "Pending",
      "innerData": {
        "zipPath": "/path/to/plugin.zip",
        "fileCount": 23
      }
    }
```

See [17-session-management.md](./17-session-management.md) for full session service documentation.

---

## Next Document

See [02-frontend/20-frontend-overview.md](../02-frontend/20-frontend-overview.md) for React architecture.
