# Go `apperror` Package Specification

> **Version:** 1.1.0  
> **Updated:** 2026-02-20  
> **Package:** `backend/pkg/apperror`

---

## Overview

The `apperror` package provides **structured application errors with mandatory stack traces** and **generic result wrappers** for all service-level returns. Every error created through this package automatically captures a stack trace at the point of creation. No error is ever swallowed or lost.

### Package Files

| File | Purpose | Target Lines |
|------|---------|--------------|
| `stack_trace.go` | StackFrame, StackTrace capture & formatting | ≤300 |
| `error.go` | AppError struct & constructors (New, Wrap) | ≤300 |
| `error_diagnostic.go` | ErrorDiagnostic struct & typed setters | ≤400 |
| `error_values.go` | Values map & WithValue/WithValues setters | ≤150 |
| `clipboard.go` | AI-friendly error report formatting | ≤200 |
| `match.go` | Error matching utilities | ≤50 |
| `codes.go` | Error code constants | ≤200 |
| `result.go` | Result[T] — single value wrapper | ≤150 |
| `result_slice.go` | ResultSlice[T] — collection wrapper | ≤150 |
| `result_map.go` | ResultMap[K, V] — associative map wrapper | ≤150 |

---

## 1. StackTrace

### 1.1 StackFrame

```go
type StackFrame struct {
    Function string `json:"function"`
    File     string `json:"file"`
    Line     int    `json:"line"`
}
```

**Methods:**
- `String() string` — formats as `"function\n      file:line"`

### 1.2 StackTrace Type

```go
type StackTrace struct {
    Frames        []StackFrame `json:"frames"`
    PreviousTrace string       `json:"previousTrace,omitempty"`
}
```

**Fields:**
- `Frames` — ordered list of captured stack frames
- `PreviousTrace` — when two stack traces are merged (e.g., re-wrapping an error), the original trace is stored here as a formatted string

### 1.3 Capture Functions

```go
// CaptureStack captures a stack trace, skipping `skip` caller frames.
// Maximum 18 frames are captured by default.
func CaptureStack(skip int) StackTrace

// CaptureStackN captures a stack trace with a custom max frame depth.
func CaptureStackN(skip int, maxFrames int) StackTrace
```

**Rules:**
- Default max frames: **18** (sufficient for most call chains)
- `skip` parameter: number of frames to skip from the top
  - `New()` and `Wrap()` use `skip=2` (skip `runtime.Callers` + constructor)
  - `FailWrap()`, `FailSliceWrap()`, `FailMapWrap()` use `skip=3` (skip wrapper + `Wrap` + `runtime.Callers`)
- Runtime frame filtering uses `strings.HasPrefix(fn, "runtime.")` (NOT `Contains`) to avoid false positives with domain functions

### 1.4 StackTrace Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `String()` | `string` | Full formatted multi-line trace including `PreviousTrace` |
| `CallerLine()` | `string` | Top frame as `"file:line"` — compact single line |
| `FinalLine()` | `string` | Bottom frame as `"file:line"` — deepest origin point |
| `IsEmpty()` | `bool` | True if no frames captured |
| `Depth()` | `int` | Number of captured frames |
| `HasPrevious()` | `bool` | True if a previous trace exists from merging |

### 1.5 Merging Behavior

When an `AppError` is re-wrapped (wrapping an error that already has a `StackTrace`), the original trace is preserved:

```go
// Original error with trace at line 42
original := apperror.New("E5001", "file not found")

// Re-wrapping preserves the original trace in PreviousTrace
wrapped := apperror.Wrap(original, "E5002", "upload failed")
// wrapped.Stack.HasPrevious() == true
// wrapped.Stack.PreviousTrace contains the original trace
```

---

## 2. AppError

### 2.1 Struct

```go
type AppError struct {
    Code       string            `json:"code"`
    Message    string            `json:"message"`
    Details    string            `json:"details,omitempty"`
    Values     map[string]string `json:"values,omitempty"`
    Diagnostic ErrorDiagnostic   `json:"diagnostic,omitempty"`
    Stack      StackTrace        `json:"stack"`
    Cause      error             `json:"-"`
}
```

**Fields:**
- `Code` — error code from constants (e.g., `ErrNotFound`, `ErrDatabaseQuery`)
- `Message` — human-readable error description
- `Details` — additional context (auto-set from cause on `Wrap`)
- `Values` — key-value map for injecting variables relevant to the error context (paths, IDs, names, etc.)
- `Diagnostic` — typed diagnostic fields for structured reporting
- `Stack` — mandatory stack trace captured at creation
- `Cause` — wrapped underlying error (implements `Unwrap()`)

### 2.2 Constructors

Every constructor captures a stack trace automatically. **Three things are always required: cause (or nil), code, and message.**

```go
// New creates a new AppError with code + message. Stack captured at caller.
func New(code, message string) *AppError

// NewWithSkip creates a new AppError with explicit skip for stack capture.
func NewWithSkip(code, message string, skip int) *AppError

// Wrap wraps an existing error with code + message. Stack captured at caller.
// If cause is an *AppError, its stack is preserved in PreviousTrace.
func Wrap(cause error, code, message string) *AppError

// WrapWithSkip wraps with explicit skip for stack capture.
func WrapWithSkip(cause error, code, message string, skip int) *AppError
```

### 2.3 Display Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Error()` | `string` | `"[CODE] message"` — implements `error` interface |
| `FullString()` | `string` | Code + message + details + values + diagnostics + stack + cause chain |
| `String()` | `string` | Alias for `FullString()` — complete error representation |
| `ToClipboard()` | `string` | Markdown-formatted error report for AI paste |

### 2.4 Values — Variable Injection

Anytime an error occurs while working with a variable (path, ID, name, URL), that variable **must** be injected into the error's `Values` map so no context is lost.

```go
// WithValue adds a single key-value pair.
func (e *AppError) WithValue(key, value string) *AppError

// WithValues merges multiple key-value pairs.
func (e *AppError) WithValues(values map[string]string) *AppError
```

**Usage:**
```go
return apperror.Wrap(err, ErrFSRead, "failed to read plugin file").
    WithValue("path", filePath).
    WithValue("plugin", pluginSlug)
```

The `Values` map is included in `FullString()`, `String()`, and `ToClipboard()` output, compiling into a readable error message.

### 2.5 Flow Control Methods

```go
// Panic logs the full error and panics with the formatted message.
// Use ONLY for unrecoverable initialization failures.
func (e *AppError) Panic(message string)

// Throw panics with the AppError itself (recoverable via recover).
// The AppError can be extracted from the panic value.
func (e *AppError) Throw()
```

**Rules:**
- `Panic()` is reserved for startup/initialization failures only
- `Throw()` enables structured panic/recover patterns where the `AppError` is preserved
- Neither should be used in request handlers — return errors instead

### 2.6 Query Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Unwrap()` | `error` | Returns cause for `errors.Is/As` |
| `Is(target)` | `bool` | True if error codes match |
| `HasCause()` | `bool` | True if a wrapped cause exists |
| `HasValues()` | `bool` | True if Values map is populated |
| `HasDiagnostic()` | `bool` | True if any diagnostic field is set |

### 2.7 Diagnostic Setters (Fluent)

All typed diagnostic setters return `*AppError` for chaining:

```go
err.WithPath(p string)
err.WithFile(f string)
err.WithFilePath(p string)
err.WithURL(u string)
err.WithSlug(s string)
err.WithSiteId(id int64)
err.WithPluginId(id int64)
err.WithStatusCode(code int)
err.WithMethod(m string)
err.WithEndpoint(ep string)
err.WithUsername(u string)
// ... etc (see error_diagnostic.go for full list)
```

---

## 3. Result[T] — Single Value Wrapper

For service methods that return one item or nothing.

### 3.1 Struct

```go
type Result[T any] struct {
    value   T
    err     *AppError
    defined bool
}
```

### 3.2 Constructors

```go
// Ok creates a successful Result containing the given value.
func Ok[T any](value T) Result[T]

// Fail creates a failed Result from an AppError.
func Fail[T any](err *AppError) Result[T]

// FailWrap creates a failed Result by wrapping a raw error.
// Uses skip=3 to point stack trace at caller, not this wrapper.
func FailWrap[T any](cause error, code, message string) Result[T]

// FailNew creates a failed Result from a new error (no cause).
func FailNew[T any](code, message string) Result[T]
```

### 3.3 Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `HasError()` | `bool` | True if operation failed |
| `IsSafe()` | `bool` | True if value exists AND no error |
| `IsDefined()` | `bool` | True if value was set (regardless of error) |
| `IsEmpty()` | `bool` | True if no value was set |
| `Value()` | `T` | Returns value; panics if `HasError()` |
| `ValueOr(fallback)` | `T` | Returns value if defined, else fallback |
| `Error()` | `*AppError` | Returns the AppError, or nil |
| `Unwrap()` | `(T, error)` | Bridges to standard `(T, error)` pattern |

---

## 4. ResultSlice[T] — Collection Wrapper

For service methods that return lists of items.

### 4.1 Struct

```go
type ResultSlice[T any] struct {
    items []T
    err   *AppError
}
```

### 4.2 Constructors

```go
func OkSlice[T any](items []T) ResultSlice[T]
func FailSlice[T any](err *AppError) ResultSlice[T]

// Uses skip=3 for correct stack trace attribution.
func FailSliceWrap[T any](cause error, code, message string) ResultSlice[T]
func FailSliceNew[T any](code, message string) ResultSlice[T]
```

### 4.3 Methods

| Category | Method | Returns | Description |
|----------|--------|---------|-------------|
| Query | `HasError()` | `bool` | True if operation failed |
| Query | `IsSafe()` | `bool` | True if no error (items may be empty) |
| Query | `HasItems()` | `bool` | True if at least one item |
| Query | `IsEmpty()` | `bool` | True if zero items |
| Query | `Count()` | `int` | Number of items |
| Access | `Items()` | `[]T` | Returns the slice (nil if error) |
| Access | `First()` | `Result[T]` | Result for first item; empty if none |
| Access | `Last()` | `Result[T]` | Result for last item; empty if none |
| Access | `GetAt(index)` | `Result[T]` | Result at index; empty if out of bounds |
| Access | `Error()` | `*AppError` | Returns the AppError, or nil |
| Mutate | `Append(items...)` | — | Adds items; no-op if in error state |

---

## 5. ResultMap[K, V] — Associative Map Wrapper

For service methods that return key-value data.

### 5.1 Struct

```go
type ResultMap[K comparable, V any] struct {
    items map[K]V
    err   *AppError
}
```

### 5.2 Constructors

```go
func OkMap[K comparable, V any](items map[K]V) ResultMap[K, V]
func FailMap[K comparable, V any](err *AppError) ResultMap[K, V]

// Uses skip=3 for correct stack trace attribution.
func FailMapWrap[K comparable, V any](cause error, code, message string) ResultMap[K, V]
func FailMapNew[K comparable, V any](code, message string) ResultMap[K, V]
```

### 5.3 Methods

| Category | Method | Returns | Description |
|----------|--------|---------|-------------|
| Query | `HasError()` | `bool` | True if operation failed |
| Query | `IsSafe()` | `bool` | True if no error (map may be empty) |
| Query | `HasItems()` | `bool` | True if at least one entry |
| Query | `IsEmpty()` | `bool` | True if zero entries |
| Query | `Count()` | `int` | Number of entries |
| Query | `Has(key)` | `bool` | True if key exists |
| Access | `Items()` | `map[K]V` | Returns the map (nil if error) |
| Access | `Get(key)` | `Result[V]` | Result for key; empty if not found |
| Access | `Keys()` | `[]K` | All keys as slice |
| Access | `Values()` | `[]V` | All values as slice |
| Access | `Error()` | `*AppError` | Returns the AppError, or nil |
| Mutate | `Set(key, value)` | — | Adds/updates entry; no-op if error state |
| Mutate | `Remove(key)` | — | Deletes key; no-op if error state |

> **📌 `.AppError()` Naming Convention:**
> All result wrappers — `Result[T]`, `ResultSlice[T]`, and `ResultMap[K, V]` — expose the underlying error via `.AppError()` (returning `*AppError`), **not** `.Error()`. This avoids collision with Go's native `error` interface method `.Error() string` and ensures callers always receive the structured `*AppError` type for direct propagation via `Fail[T]()`, `FailSlice[T]()`, etc. without interface casts. The same convention applies to `dbutil` result types (`dbutil.Result[T]`, `dbutil.ResultSet[T]`, `dbutil.ExecResult`), which also store and return `*apperror.AppError` from their `.AppError()` method to enable bridge methods like `ToAppResult()` and `ToAppResultSlice()`.

---

## 6. Error Code Convention

Error codes are defined as string constants in `codes.go`. **No magic strings.**

| Range | Category |
|-------|----------|
| E1xxx | Configuration errors |
| E2xxx | Database errors |
| E3xxx | WordPress API errors |
| E4xxx | File system errors |
| E5xxx | Sync errors |
| E6xxx | Backup errors |
| E7xxx | Git errors |
| E8xxx | Build errors |
| E9xxx | General errors |
| E10xxx | E2E test errors |
| E11xxx | Publish errors |
| E12xxx | Version errors |
| E13xxx | Session errors |
| E14xxx | Crypto errors |

---

## 7. Stack Trace Skip Rules

Understanding skip values is critical for accurate error attribution.

The table below shows what each constructor passes to its underlying `CaptureStack` call. `WrapWithSkip` has a base of `3` and `NewWithSkip` has a base of `2` because `Wrap` delegates through one extra internal frame.

| Constructor | Delegates To | `skip` Passed | Effective `CaptureStack` | Reason |
|-------------|-------------|---------------|--------------------------|--------|
| `New()` | `CaptureStack(2)` | — | 2 | Skips `CaptureStackN` + `CaptureStack` + `New` |
| `Wrap()` | `WrapWithSkip(…, 0)` | 0 | 3 | Skips through `Wrap` → `WrapWithSkip` → `CaptureStack` chain |
| `NewWithSkip()` | `CaptureStack(2+skip)` | caller-provided | 2 + skip | Additional skip on top of `New` base |
| `WrapWithSkip()` | `CaptureStack(3+skip)` | caller-provided | 3 + skip | Additional skip on top of `Wrap` base |
| `FailWrap()` | `WrapWithSkip(…, 0)` | 0 | 3 | Same depth as `Wrap` — replaces it, doesn't nest |
| `FailSliceWrap()` | `WrapWithSkip(…, 0)` | 0 | 3 | Same depth as `Wrap` — replaces it, doesn't nest |
| `FailMapWrap()` | `WrapWithSkip(…, 0)` | 0 | 3 | Same depth as `Wrap` — replaces it, doesn't nest |
| `FailNew()` | `NewWithSkip(…, 1)` | 1 | 3 | One frame deeper than `New` (FailNew → NewWithSkip) |
| `FailSliceNew()` | `NewWithSkip(…, 1)` | 1 | 3 | One frame deeper than `New` (FailSliceNew → NewWithSkip) |
| `FailMapNew()` | `NewWithSkip(…, 1)` | 1 | 3 | One frame deeper than `New` (FailMapNew → NewWithSkip) |

> **Key insight:** `FailWrap` calls `WrapWithSkip` directly (same as `Wrap` does), so it sits at the **same depth** and passes `skip=0`. `FailNew` calls `NewWithSkip` directly (one frame deeper than `New`), so it passes `skip=1`.

---

## 8. File Size Policy

| Target | Soft Limit | Description |
|--------|-----------|-------------|
| 300 lines | 400 lines | All files target 300 lines. Up to 400 is acceptable but marked `// NOTE: Needs refactor — exceeds 300-line target` at the top. |

---

## 9. Usage Examples

### Service Method Returning Result[T]

```go
func (s *PluginService) GetById(ctx context.Context, id int64) apperror.Result[Plugin] {
    plugin, err := s.repo.FindById(ctx, id)
    if err != nil {
        return apperror.FailWrap[Plugin](err, apperror.ErrDatabaseQuery, "get plugin by id").
            WithValue("pluginId", fmt.Sprintf("%d", id))
    }
    isPluginMissing := plugin == nil

    if isPluginMissing {
        return apperror.FailNew[Plugin](apperror.ErrNotFound, "plugin not found")
    }

    return apperror.Ok(*plugin)
}
```

### Handler Consuming Result[T]

```go
func (h *Handler) GetPlugin(w http.ResponseWriter, r *http.Request) {
    result := h.plugins.GetById(r.Context(), pluginId)
    if result.HasError() {
        writeError(w, result.AppError())
        return
    }

    writeJSON(w, result.Value())
}
```

### Error with Values

```go
return apperror.Wrap(err, apperror.ErrFSRead, "failed to read config").
    WithValue("path", configPath).
    WithValue("format", "yaml")
```

---

## 10. Service Adapter Unwrap Pattern

### 10.1 Architectural Boundary

Services return `Result[T]`, `ResultSlice[T]`, and `ResultMap[K, V]` to preserve rich error context and type safety within the domain layer. HTTP handlers consume **adapter interfaces** that expose standard `(T, error)` tuples. A dedicated **Service Adapter** sits between them, acting as the single unwrap boundary.

```
┌─────────────┐    Result[T]    ┌──────────────────┐   (T, error)   ┌──────────┐
│   Service    │ ─────────────► │  ServiceAdapter   │ ─────────────► │  Handler │
│  (domain)    │                │  (unwrap layer)   │                │  (HTTP)  │
└─────────────┘                └──────────────────┘                └──────────┘
```

**Rules:**
- Services **never** return raw `(T, error)` for data-fetching operations — use `Result[T]` or `ResultSlice[T]`
- Void operations (`Delete`, `MarkSynced`, etc.) may return plain `error`
- Adapters are the **only** place that calls `.Value()`, `.Items()`, or `.AppError()` to convert back to tuples
- Handlers and other transport-layer code **never** import `apperror.Result` types directly

### 10.2 Adapter Implementation

Each service gets a dedicated adapter file (e.g., `adapter_plugin.go`, `adapter_site.go`, `adapter_sync.go`) in the `handlers` package:

```go
// SiteServiceAdapter wraps *site.Service to implement SiteServiceInterface
type SiteServiceAdapter struct {
    *site.Service
}

// Result[T] → (*T, error) unwrap for single-value returns
func (a *SiteServiceAdapter) GetById(ctx context.Context, id int64) (*models.Site, error) {
    result := a.Service.GetById(ctx, id)  // returns apperror.Result[models.Site]
    if result.HasError() {
        return nil, result.AppError()
    }
    v := result.Value()
    return &v, nil
}

// ResultSlice[T] → ([]T, error) unwrap for collection returns
func (a *SiteServiceAdapter) List(ctx context.Context) ([]models.Site, error) {
    result := a.Service.List(ctx)  // returns apperror.ResultSlice[models.Site]
    if result.HasError() {
        return nil, result.AppError()
    }
    return result.Items(), nil
}
```

### 10.3 Compile-Time Verification

All adapters include compile-time interface checks in `adapters.go`:

```go
var _ SiteServiceInterface = (*SiteServiceAdapter)(nil)
var _ PluginServiceInterface = (*PluginServiceAdapter)(nil)
var _ SyncServiceInterface = (*SyncServiceAdapter)(nil)
```

### 10.4 Cross-Service Consumption

When **Service A** holds a direct reference to **Service B** (not through the adapter), Service A must consume Result types directly using `.HasError()` / `.Value()` / `.IsSafe()`:

```go
// sync service calls plugin service directly (not through adapter)
plugResult := s.pluginService.GetById(ctx, pluginId)
if plugResult.HasError() {
    return apperror.FailWrap[PushSyncResult](plugResult.AppError(), apperror.ErrDatabaseQuery, "failed to get plugin")
}
plug := plugResult.Value()
```

**Cross-service audit checklist** — when migrating a service to Result types, verify:
1. All cross-service callers that hold a direct `*service.Service` reference
2. All `main.go` initialization code that calls service methods
3. All adapter methods are updated to unwrap the new return types

### 10.5 Zero Raw Error Rule

**No service method may return a bare `error` from the standard library.** Every error returned from a service function must be an `*apperror.AppError` (created via `apperror.New`, `apperror.Wrap`, or contained within a `Result[T]`). This guarantees every error carries a stack trace for diagnostics.

**Forbidden patterns:**
```go
// ❌ NEVER — no stack trace captured
return err
return fmt.Errorf("something failed: %w", err)
return errors.New("something failed")
```

**Required patterns:**
```go
// ✅ Wraps with stack trace + error code
return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update config")

// ✅ New error with stack trace + error code
return apperror.New(apperror.ErrNotFound, "entry not found")
```

**Exemptions:**
- `filepath.Walk` callbacks (framework requires `error` interface)
- E2E test harness (`e2e/` package) — test assertion errors, not production
- Enum `UnmarshalJSON` / `MarshalJSON` methods (`internal/enums/*/variant.go`) — circular import risk with `apperror` package; these are standard library interface implementations

### 10.6 Migrated Services

| Service | Result Types | Adapter File |
|---------|-------------|--------------|
| Plugin | `List`, `GetById`, `Create`, `Update`, `ScanDirectory`, `GetMappings`, `GetMappingsBySite`, `CreateMapping` | `adapter_plugin.go` |
| Site | `List`, `GetById`, `GetByUrl`, `Create`, `Update` | `adapter_site.go` |
| Sync | `CheckSync`, `CheckAllSites`, `CheckAllPlugins`, `PushSync`, `GetFileChanges` | `adapter_sync.go` |
| Publish | `Publish`, `PublishFiles`, `PreviewPublish`, `GetFileDiff` | `adapter_publish.go` |
| Git | `Pull`, `PullAll`, `Build`, `PullAndBuild`, `GetConfig`, `Status`, `Commit`, `Push` | `adapter_git.go` |
| Watcher | `TriggerScan`, `ScanAfterGitPull`, `ScanAll` | `adapter_sync.go` |
| Backup | `Create`, `List`, `GetById`, `Restore`, `ExportToZip`, `ImportFromZip` | `adapter_publish.go` |
| Session | `GetSession`, `GetSessionLogs`, `GetSessionDiagnostics`, `ListSessions` | `adapter_session.go` |
| ErrorHistory | `Save`, `List`, `GetById`, `GetByErrorId`, `Clear`, `BulkExport`, `GetStats` | `adapter_session.go` |
| SiteHealth | `CheckSite`, `CheckAllSites`, `GetHistory`, `GetSummaries`, `GetStats`, `ClearHistory` | `adapter_history.go` |
| PublishHistory | `Record`, `List`, `GetById`, `GetStats`, `Clear` | `adapter_history.go` |

---

## 11. JSON Serialization

### 11.1 JSON Tag Convention

**Rule:** Only add `json:"..."` tags when the JSON key **differs** from the Go field name OR when `omitempty` is needed. PascalCase field names serialize as PascalCase by default — redundant tags must be removed.

| Scenario | Tag Required? | Example |
|----------|--------------|---------|
| Field name matches JSON key | ❌ No | `Version string` (serializes as `"Version"`) |
| JSON key differs (camelCase) | ✅ Yes | `SiteId int64 \`json:"siteId"\`` |
| Field needs omitempty | ✅ Yes | `Details string \`json:"details,omitempty"\`` |
| Both differ + omitempty | ✅ Yes | `PluginSlug string \`json:"pluginSlug,omitempty"\`` |
| Excluded from JSON | ✅ Yes | `Cause error \`json:"-"\`` |

### 11.2 Existing JSON Tags

All core structs have JSON tags where needed:

- `AppError` — `code`, `message`, `details`, `values`, `diagnostic`, `stack` (camelCase, required) ✅
- `StackTrace` — `frames`, `previousTrace` (camelCase, required) ✅
- `StackFrame` — `function`, `file`, `line` (lowercase, required) ✅
- `ErrorDiagnostic` — all 15+ fields tagged with camelCase + omitempty ✅
- `Cause` — uses `json:"-"` (excluded from default marshaling) ⚠️

### 11.2 Custom MarshalJSON

The `Cause` field is excluded from default JSON marshaling (`json:"-"`) because it's a Go `error` interface. A custom `MarshalJSON` must serialize the cause message as a string:

**File:** `backend/pkg/apperror/error_json.go`

```go
func (e *AppError) MarshalJSON() ([]byte, error) {
    type alias AppError

    return json.Marshal(&struct {
        *alias
        CauseMessage string `json:"cause,omitempty"`
    }{
        alias:        (*alias)(e),
        CauseMessage: causeMessage(e),
    })
}

func causeMessage(e *AppError) string {
    if e.Cause == nil {
        return ""
    }

    return e.Cause.Error()
}
```

**Rules:**
- Uses type alias to prevent infinite recursion
- `Cause` serialized as `"cause"` string field (not nested error object)
- Empty cause omitted via `omitempty`

### 11.3 Custom UnmarshalJSON

Reconstructs `Cause` from the serialized string:

```go
func (e *AppError) UnmarshalJSON(data []byte) error {
    var alias appErrorJSON
    if err := json.Unmarshal(data, &alias); err != nil {
        return fmt.Errorf("apperror.UnmarshalJSON: failed to decode AppError (received %d bytes: %s): %w",
            len(data), truncateData(data, 200), err)
    }

    e.Code = alias.Code
    e.Message = alias.Message
    e.Details = alias.Details
    e.Values = alias.Values
    e.Diagnostic = alias.Diagnostic
    e.Stack = alias.Stack

    hasCauseMessage := alias.CauseMessage != ""

    if hasCauseMessage {
        e.Cause = &plainError{msg: alias.CauseMessage}
    }

    return nil
}

// truncateData returns a string preview of raw JSON data, capped at maxLen bytes.
func truncateData(data []byte, maxLen int) string {
    isWithinLimit := len(data) <= maxLen

    if isWithinLimit {
        return string(data)
    }

    return string(data[:maxLen]) + "..."
}
```

**Rules:**
- Reconstructed `Cause` is a `plainError` struct — the original type is lost (acceptable for deserialization)
- Stack trace, values, and diagnostics are fully preserved
- **Error messages include the raw received data** (truncated to 200 bytes) for debugging malformed payloads

### 11.4 Serialization Output Example

```json
{
    "code": "E3001",
    "message": "failed to connect to WordPress",
    "details": "dial tcp 192.168.1.100:443: connect: connection refused",
    "values": {
        "url": "https://example.com",
        "plugin": "my-plugin"
    },
    "diagnostic": {
        "url": "https://example.com/wp-json/wp/v2/plugins",
        "statusCode": 0,
        "method": "GET"
    },
    "stack": {
        "frames": [
            {"function": "wordpress.(*Client).ListPlugins", "file": "client.go", "line": 42},
            {"function": "sync.(*Service).CheckSync", "file": "service.go", "line": 128}
        ],
        "previousTrace": ""
    },
    "cause": "dial tcp 192.168.1.100:443: connect: connection refused"
}
```

---

## 12. Result Guard Rule — Mandatory Error Check Before Value Access

Every call site that receives a `Result[T]`, `ResultSlice[T]`, or `ResultMap[K, V]` (Go) or `DbResult`, `DbResultSet`, `DbExecResult` (PHP) **MUST** check `HasError()` / `hasError()` or `IsSafe()` / `isSafe()` before calling `.Value()` / `.value()`, `.Items()` / `.items()`, or `.Get()`. Accessing the contained value without a guard is a **spec violation**.

**Principle:** No error may ever be swallowed. If a result carries an error, it must be explicitly handled — logged, returned, or propagated. The framework-level accessor should log immediately when called on an errored result, reducing diagnostic steps.

> **Important:** In Go, the method to retrieve the error is named `.AppError()` (not `.Error()`) to avoid confusion with Go's native `error` interface. `.AppError()` returns `*apperror.AppError` which carries the full stack trace, error code, and diagnostic context. In PHP, the equivalent method remains `.error()` returning `Throwable`.

### Go Examples

#### ❌ WRONG — No Guard

```go
// Silent failure: if result has an error, Value() panics or returns zero
result := svc.GetById(ctx, id)
plugin := result.Value()
```

#### ✅ CORRECT — Direct Propagation (Same Type)

```go
// result is already Result[T] with the error — just return it
result := svc.GetById(ctx, id)
if result.HasError() {
    return result
}
plugin := result.Value()
```

#### ✅ CORRECT — Cross-Type Propagation (Result[T] → Result[U])

```go
// When the return type differs, Fail re-wrapping IS needed:
siteResult := siteSvc.GetById(ctx, siteId)
if siteResult.HasError() {
    return apperror.Fail[PluginList](siteResult.AppError())
}
```

#### ❌ WRONG — Redundant Re-Wrapping (Same Type)

```go
// result.AppError() is already *AppError — no need to re-wrap into same Result[T]
result := svc.GetById(ctx, id)
if result.HasError() {
    return apperror.Fail[Plugin](result.AppError()) // redundant
}
```

#### Same-Type vs Cross-Type — ResultSlice and ResultMap

The same rule applies to `FailSlice` and `FailMap`:

```go
// ✅ Same-type ResultSlice — direct return
func (s *Service) ListActive(ctx context.Context) apperror.ResultSlice[models.Site] {
    result := s.List(ctx) // returns ResultSlice[models.Site]
    if result.HasError() {
        return result // same type — direct return
    }
    return apperror.OkSlice(filterActive(result.Items()))
}

// ❌ WRONG — redundant FailSlice re-wrapping (same type)
if result.HasError() {
    return apperror.FailSlice[models.Site](result.AppError()) // redundant
}

// ✅ Cross-type ResultSlice — FailSlice IS needed
func (s *Service) CheckAll(ctx context.Context) apperror.ResultSlice[SyncResult] {
    plugins := s.pluginService.List(ctx) // returns ResultSlice[models.Plugin]
    if plugins.HasError() {
        return apperror.FailSlice[SyncResult](plugins.AppError()) // different T
    }
    // ...
}

// ✅ Same-type ResultMap — direct return
func (s *Service) GetCached(ctx context.Context) apperror.ResultMap[string, Config] {
    result := s.loadAll(ctx) // returns ResultMap[string, Config]
    if result.HasError() {
        return result // same type — direct return
    }
    // ...
}

// ✅ Cross-type ResultMap — FailMap IS needed
if configResult.HasError() {
    return apperror.FailMap[string, Summary](configResult.AppError()) // different V
}
```

#### ✅ CORRECT — Using IsSafe()

```go
result := svc.List(ctx)
if result.IsSafe() {
    for _, item := range result.Items() {
        process(item)
    }
}
```

#### ✅ CORRECT — Adapter Unwrap Pattern

```go
func (a *PluginServiceAdapter) GetById(ctx context.Context, id int64) (*models.Plugin, error) {
    result := a.Service.GetById(ctx, id)
    if result.HasError() {
        return nil, result.AppError()
    }

    v := result.Value()

    return &v, nil
}
```

### PHP Examples

#### ❌ WRONG — No Guard (DbResult)

```php
$result = $query->queryOne(...);
$result->value(); // error silently swallowed
```

#### ✅ CORRECT — Guard Before Access (DbResult)

```php
$result = $query->queryOne(...);

if ($result->hasError()) {
    $this->logger->logException($result->error(), 'context');

    return null;
}

return $result->value();
```

#### ✅ CORRECT — Guard Before Iteration (DbResultSet)

```php
$results = $query->queryAll(...);

if ($results->hasError()) {
    $this->logger->logException($results->error(), 'query failed');

    return [];
}

return $results->items();
```

#### ✅ CORRECT — Guard Before Write Result (DbExecResult)

```php
$execResult = $query->execute(...);

if ($execResult->hasError()) {
    $this->logger->logException($execResult->error(), 'execute failed');

    return false;
}

return $execResult->affectedRows() > 0;
```

### Enforcement Checklist

- [ ] Every `result.Value()` / `$result->value()` call is preceded by `HasError()` / `hasError()` or `IsSafe()` / `isSafe()`. In Go, use `.AppError()` (not `.Error()`) to retrieve the structured error.
- [ ] Every `result.Items()` / `$results->items()` call is preceded by a guard
- [ ] Every `result.Get(key)` on `ResultMap` is preceded by a guard
- [ ] Every `$execResult->affectedRows()` on `DbExecResult` is preceded by a guard
- [ ] No error is silently discarded — all errors are logged, returned, or propagated
- [ ] Cross-service callers (direct `*service.Service` refs) guard results the same way

---

## Cross-References

- [Golang Coding Standards](../../../08-coding-guidelines/golang-standards/readme.md) — File size, function size, type safety, file naming
- [Cross-Language Code Style](../../../08-coding-guidelines/coding-guidelines/code-style.md) — Braces, nesting, spacing
- [Enum Specification](../../../08-coding-guidelines/golang-standards/01-enum-specification/00-overview.md) — Byte-based enum pattern with mandatory JSON marshal

---

*apperror package specification v1.4.0 — 2026-02-23*
