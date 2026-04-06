# Golang Coding Standards

> **Version:** 3.3.0
> **Updated:** 2026-02-23
> **Applies to:** All Go backend code

---

## File Size — Target 300 Lines (Soft Limit 400)

Every `.go` file targets **300 lines**. Up to **400 lines is acceptable** but must include a top-of-file comment: `// NOTE: Needs refactor — exceeds 300-line target`. Split large files using these suffixes:

| Suffix | Purpose |
|--------|---------|
| `entity.go` | Struct + constructors |
| `entity_crud.go` | Database operations |
| `entity_helpers.go` | Private utilities |
| `entity_validation.go` | Validation logic |

---

## Function Size — Max 15 Lines

> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rule 6

Every function body must be **15 lines or fewer**. Extract logic into small, well-named helpers.

```go
// ❌ FORBIDDEN: Long function
func ProcessUpload(ctx context.Context, req UploadRequest) error {
    // 20+ lines of validation, upload, logging...
}

// ✅ REQUIRED: Decomposed
func ProcessUpload(ctx context.Context, req UploadRequest) error {
    if err := validateUpload(req); err != nil {
        return err
    }

    result, err := executeUpload(ctx, req)
    if err != nil {
        return apperror.Wrap(err, "E5001", "upload failed")
    }

    return logAndRespond(ctx, result)
}
```

---

## Zero Nested `if` — Absolute Ban

> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rule 2 & 7

Nested `if` blocks are **absolutely forbidden** — zero tolerance. Flatten with combined conditions or early returns.

```go
// ❌ FORBIDDEN
if err != nil {
    if resp != nil {
        handleError(resp)
    }
}

// ✅ REQUIRED — flattened with named booleans
hasError := err != nil
hasResponse := resp != nil
isFailedWithResponse := hasError && hasResponse

if isFailedWithResponse {
    handleError(resp)
}
```

---

## Type Safety — No `interface{}` or `any`

### Rule: Never use `interface{}` or `any` in exported APIs

```go
// ❌ FORBIDDEN
func ProcessData(data interface{}) interface{} { ... }
func FetchResults() (any, error) { ... }

// ✅ REQUIRED: Use concrete types or generics
func ProcessData(data PluginDetails) (PluginSummary, error) { ... }
func FetchResults[T any]() (T, error) { ... }
```

### Acceptable `any` Usage

1. **SQL query arguments** — `args ...any` in `dbutil` (framework boundary)
2. **Logger variadic parameters** — `map[string]any` for structured log fields (internal only)
3. **Third-party library interfaces** — When a library requires `interface{}`

---

## Error Handling — `apperror` Package

### Rule: Every error carries a mandatory stack trace

All errors created via `apperror.New()` or `apperror.Wrap()` automatically capture a full `StackTrace` at creation — no opt-in needed.

```go
// ❌ FORBIDDEN: loses stack trace
return fmt.Errorf("failed to upload: %w", err)

// ✅ REQUIRED: full stack trace captured automatically
return apperror.Wrap(err, "E5001", "failed to upload plugin")
```

### StackTrace Type

```go
// Captured automatically — structured frames, not raw strings
type StackFrame struct {
    Function string
    File     string
    Line     int
}
type StackTrace []StackFrame

// Display methods
trace.String()      // full formatted multi-line trace
trace.CallerLine()  // "file.go:42" — compact single line
trace.IsEmpty()     // no frames captured
trace.Depth()       // number of frames
```

### AppError Display Methods

```go
err.Error()       // "[E5001] upload failed" — implements error interface
err.FullString()  // code + message + diagnostics + stack + cause chain
err.ToClipboard() // markdown-formatted error report for AI paste
```

### Context Enrichment — Typed Diagnostic Setters

```go
// ✅ Enriched error with diagnostic context
return apperror.Wrap(err, "E5002", "remote site request failed").
    WithURL(requestURL).
    WithSlug(pluginSlug).
    WithStatusCode(resp.StatusCode).
    WithSiteId(siteId)
```

### Error Code Convention

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

## Generic Result Types — `apperror` Package

Three generic result types for all service returns. Replaces raw `(T, error)` tuples.

### `Result[T]` — Single Value

For operations that return one item or nothing.

```go
// Construction
result := apperror.Ok(plugin)             // success
result := apperror.Fail[Plugin](appErr)   // from AppError
result := apperror.FailWrap[Plugin](err, "E5001", "load failed")  // wrap raw error
result := apperror.FailNew[Plugin]("E4004", "not found")          // new error

// Query methods
result.HasError()    // true if operation failed
result.IsSafe()      // true if value exists AND no error
result.IsDefined()   // true if value was set
result.IsEmpty()     // true if no value was set

// Access methods
result.Value()             // returns T; panics if HasError
result.ValueOr(fallback)   // returns T or fallback if empty
result.AppError()          // returns *AppError or nil (named AppError to avoid confusion with Go's error)
result.Unwrap()            // bridges to (T, error) pattern
```

### `ResultSlice[T]` — Collection (Array)

For operations that return lists of items.

```go
// Construction
set := apperror.OkSlice(plugins)
set := apperror.FailSlice[Plugin](appErr)
set := apperror.FailSliceWrap[Plugin](err, "E5011", "query failed")

// Query methods
set.HasError()     // true if operation failed
set.IsSafe()       // true if no error (items may be empty)
set.HasItems()     // true if at least one item
set.IsEmpty()      // true if zero items
set.Count()        // number of items

// Access methods
set.Items()        // returns []T (nil if error)
set.First()        // Result[T] for first item
set.Last()         // Result[T] for last item
set.GetAt(index)   // Result[T] at index; empty if out of bounds
set.AppError()     // returns *AppError or nil

// Mutation methods
set.Append(items...)  // adds items; no-op if in error state
```

### `ResultMap[K, V]` — Associative Map

For operations that return key-value data.

```go
// Construction
m := apperror.OkMap(pluginsBySlug)
m := apperror.FailMap[string, Plugin](appErr)
m := apperror.FailMapWrap[string, Plugin](err, "E5012", "index failed")

// Query methods
m.HasError()     // true if operation failed
m.IsSafe()       // true if no error (map may be empty)
m.HasItems()     // true if at least one entry
m.IsEmpty()      // true if zero entries
m.Count()        // number of entries
m.Has(key)       // true if key exists

// Access methods
m.Items()        // returns map[K]V (nil if error)
m.Get(key)       // Result[V] for key; empty if not found
m.Keys()         // returns []K
m.Values()       // returns []V
m.AppError()     // returns *AppError or nil

// Mutation methods
m.Set(key, value)   // adds/updates; no-op if error state
m.Remove(key)       // deletes key; no-op if error state
```

### Service Usage Pattern

```go
// ✅ Same-type propagation — use bridge method (no unwrap+rewrap)
func (s *SiteService) ListAll(ctx context.Context) apperror.ResultSlice[Site] {
    set := dbutil.QueryMany[Site](ctx, s.db, query, scanSite)
    if set.HasError() {
        return set.ToAppResultSlice()
    }

    return apperror.OkSlice(set.Items())
}

// ✅ Single-row with post-processing — direct propagation via AppError()
func (s *PluginService) GetById(ctx context.Context, id int64) apperror.Result[Plugin] {
    dbResult := dbutil.QueryOne[Plugin](ctx, s.db, query, scanPlugin, id)
    if dbResult.HasError() {
        return apperror.Fail[Plugin](dbResult.AppError())
    }
    if dbResult.IsEmpty() {
        return apperror.FailNew[Plugin](ErrNotFound, "plugin not found")
    }

    return apperror.Ok(dbResult.Value())
}

// ✅ Cross-type propagation — different T, Fail[NewT] is correct
func (s *GitService) Pull(ctx context.Context, pluginID int64) apperror.Result[PullResult] {
    pResult := s.pluginService.GetById(ctx, pluginID)
    if pResult.HasError() {
        return apperror.Fail[PullResult](pResult.AppError())
    }
    // ...
}

// ✅ Handler consuming Result[T]
func (h *Handler) GetPlugin(w http.ResponseWriter, r *http.Request) {
    result := h.plugins.GetById(r.Context(), pluginId)
    if result.HasError() {
        writeError(w, result.AppError())
        return
    }

    writeJSON(w, result.Value())
}
```

### Error Propagation Rules

| Scenario | Pattern | Example |
|----------|---------|---------|
| Same T, dbutil→apperror slice | Bridge method | `set.ToAppResultSlice()` |
| Same T, dbutil→apperror single | Bridge method | `result.ToAppResult()` |
| Different T (cross-type) | `Fail[NewT](src.AppError())` | `apperror.Fail[BuildResult](pluginResult.AppError())` |
| Same wrapper, same T | Direct return | `return existingResult` |

> **Anti-pattern:** Never unwrap an error just to re-wrap it into the same type parameter:
> ```go
> // ❌ FORBIDDEN: redundant unwrap+rewrap (same T)
> return apperror.FailSlice[Plugin](set.AppError())
>
> // ✅ REQUIRED: use bridge method
> return set.ToAppResultSlice()
> ```

---

## Database Naming Convention — PascalCase

> **Canonical source:** [Database Naming Convention](../coding-guidelines/database-naming.md)

All custom SQLite table names, column names, and index names MUST use **PascalCase**. Go struct `db` and `json` tags must match.

```go
// ✅ PascalCase table and column names
const queryList = `SELECT Id, ProjectId, DisplayName, CreatedAt FROM Projects`

type Project struct {
    Id          int64  `db:"Id"          json:"Id"`
    ProjectId   string `db:"ProjectId"   json:"ProjectId"`
    DisplayName string `db:"DisplayName" json:"DisplayName"`
    CreatedAt   string `db:"CreatedAt"   json:"CreatedAt"`
}
```

---

## Database Wrapper — `pkg/dbutil`

All database queries MUST use the generic `dbutil` package. Returns typed result envelopes with automatic `apperror` stack traces.

### Result Types

| Type | Purpose | Key Methods |
|------|---------|-------------|
| `Result[T]` | Single-row query | `IsDefined()`, `IsEmpty()`, `HasError()`, `IsSafe()`, `Value()`, `AppError()`, `StackTrace()` |
| `ResultSet[T]` | Multi-row query | `HasAny()`, `IsEmpty()`, `Count()`, `HasError()`, `IsSafe()`, `Items()`, `First()`, `AppError()`, `StackTrace()` |
| `ExecResult` | INSERT/UPDATE/DELETE | `IsEmpty()`, `HasError()`, `IsSafe()`, `AffectedRows`, `LastInsertId`, `AppError()`, `StackTrace()` |

> **Naming: `.AppError()` vs `.Error()`**
> Both `dbutil` result types and `apperror` result types use `.AppError()` (not `.Error()`) to return the underlying `*apperror.AppError`. This avoids collision with Go's built-in `error` interface method `.Error() string`. The `apperror.AppError` struct itself still implements the standard `error` interface via `.Error() string` (returns `"[code] message"`), but all result wrappers — whether in `dbutil` (`Result[T]`, `ResultSet[T]`, `ExecResult`) or `apperror` (`Result[T]`, `ResultSlice[T]`, `ResultMap[K,V]`) — expose `.AppError()` for the structured error accessor.

### Generic Query Functions

```go
// Single row — returns Result[T]
result := dbutil.QueryOne[Plugin](ctx, db, query, scanPlugin, pluginId)

// Multiple rows — returns ResultSet[T]
set := dbutil.QueryMany[Site](ctx, db, query, scanSite)

// Exec — returns ExecResult
res := dbutil.Exec(ctx, db, query, args...)
```

---

## Struct Design

### JSON Tags — PascalCase Convention

All structs used in API responses must have explicit JSON tags with PascalCase keys:

```go
type PluginDetails struct {
    Id        int    `json:"Id"`
    Name      string `json:"Name"`
    Slug      string `json:"Slug"`
    Version   string `json:"Version"`
    IsActive  bool   `json:"IsActive"`
    UpdatedAt string `json:"UpdatedAt,omitempty"`
}
```

### Function Parameters — Max 2-3

Functions should have **2-3 parameters maximum**. Use config/options structs for more:

```go
// ❌ Bad: Too many parameters
func StartSession(sessionType SessionType, pluginId, siteId int64, pluginName, siteName string) (string, error)

// ✅ Good: Use a struct
type StartSessionInput struct {
    Type       SessionType
    PluginId   int64
    SiteId     int64
    PluginName string
    SiteName   string
}
func StartSession(input StartSessionInput) (string, error)

// ✅ Acceptable: 2-3 essential parameters (context doesn't count)
func GetById(ctx context.Context, id int64) (*Model, error)
```

---

## File Naming & Organization

### File Naming Rules

| Rule | Convention | Example |
|------|-----------|---------|
| File name | `snake_case.go` | `server_config.go`, `status_type.go` |
| Maps to primary type | File name derived from its exported type | `ServerConfig` → `server_config.go` |
| One exported type per file | Each struct/interface/enum gets its own file | Don't combine `Config` + `ServerConfig` |
| Related methods stay together | All methods on a type live in its file | `StatusType.IsValid()` stays in `status_type.go` |
| Suffix convention | Split large types using suffixes | `_crud.go`, `_helpers.go`, `_validation.go` |
| Package directory | `snake_case` for multi-word | `site_health/`, `search_mode/` |

### Splitting Convention (When Files Exceed 300 Lines)

| Suffix | Purpose | Example |
|--------|---------|---------|
| `{type}.go` | Struct + constructors | `config.go` |
| `{type}_crud.go` | Database CRUD operations | `plugin_crud.go` |
| `{type}_helpers.go` | Private utility functions | `config_helpers.go` |
| `{type}_validation.go` | Input/business rule validation | `upload_validation.go` |
| `{type}_json.go` | JSON marshal/unmarshal methods | `error_json.go` |

### Package Directory Naming

```
// ✅ Correct
internal/enums/log_level/
internal/enums/snapshot_mode/
internal/services/site_health/

// ❌ Wrong
internal/enums/logLevel/
internal/enums/SnapshotMode/
internal/services/SiteHealth/
```

### File-to-Type Mapping Examples

```
// ✅ One type per file, name matches
config.go           → type Config struct
server_config.go    → type ServerConfig struct
watcher_config.go   → type WatcherConfig struct
status_type.go      → type StatusType byte + methods
error_json.go       → MarshalJSON/UnmarshalJSON on AppError

// ❌ Wrong: multiple unrelated types in one file
config.go           → Config + ServerConfig + WatcherConfig + BackupConfig
```

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Package names | Lowercase, single word | `wordpress`, `publish`, `apperror` |
| Package directories | `snake_case` for multi-word | `site_health`, `log_level` |
| File names | `snake_case.go`, maps to primary type | `server_config.go`, `status_type.go` |
| Exported functions | PascalCase, verb-led | `EnablePlugin`, `FetchStatus` |
| Unexported functions | camelCase, verb-led | `resolveNamespace`, `parseStackTrace` |
| Interfaces | PascalCase, `-er` suffix for single-method | `Publisher`, `PluginStore` |
| Constants | PascalCase | `MaxRetryAttempts`, `DefaultTimeout` |
| Error variables | `Err` prefix | `ErrPluginNotFound`, `ErrUploadFailed` |
| Boolean functions | Positive naming only | `IsValid()`, `HasPermission()` |

---

## No Raw Negations — Use Positive Guard Functions

> **Canonical source:** [No Raw Negations](../coding-guidelines/no-negatives.md)

```go
// ❌ FORBIDDEN
if !fileExists(path) { ... }
if !strings.Contains(s, substr) { ... }

// ✅ REQUIRED
if IsFileMissing(path) { ... }
if IsMissingSubstring(s, substr) { ... }
```

---

## Typed Constants & Enums

> **Canonical source:** [Enum Specification](01-enum-specification/00-overview.md)

All enums MUST use `byte` as the underlying type with `iota`. String-backed types are **deprecated** and must be migrated.

### Byte-Based Enums (Required)

```go
type StatusType byte

const (
    Invalid   StatusType = iota
    Active
    Inactive
    Pending
)

// Required methods: String, Label, IsValid, Is{Value}, All, ByIndex, Parse
// Required: MarshalJSON, UnmarshalJSON
```

### Exception: Int-Based Enums

`HttpStatusType` is exempt from byte conversion — HTTP codes are inherently numeric. Must still implement all required methods.

### Zero Magic Strings/Numbers

- All HTTP status codes → typed constants
- All error codes → `apperror` code constants
- All config keys → typed const block
- All status/event strings → typed byte-based enum constants

---

## DRY Enforcement

| Pattern | Solution |
|---------|----------|
| Repeated error handling | `apperror.Result[T]` or helper functions |
| Repeated JSON key access | Typed response structs |
| Repeated validation | `Validate()` method on input structs |
| Repeated DB patterns | `dbutil` generic wrappers |
| Repeated string constants | Typed const blocks with `Type` suffix |

---

## Concurrency Patterns

### `sync.Once` for Lazy Initialization

```go
var (
    openAPISpec     []byte
    openAPISpecOnce sync.Once
)

func GetOpenAPISpec() []byte {
    openAPISpecOnce.Do(func() {
        openAPISpec, _ = os.ReadFile("api/openapi.json")
    })
    return openAPISpec
}
```

### Context Propagation

All long-running operations must accept `context.Context`:

```go
func (s *PublishService) Upload(ctx context.Context, req UploadRequest) error { ... }
```

---

## Forbidden Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `interface{}` / `any` in exported APIs | Untyped | Concrete types or generics |
| `fmt.Errorf` for service errors | No stack trace | `apperror.Wrap` |
| Panic in handlers | Crashes server | Return error |
| `init()` functions | Hidden side effects | Explicit initialization |
| Global mutable state | Race conditions | Dependency injection |
| `map[string]interface{}` in APIs | Untyped | Defined structs |
| Raw `(T, error)` from services | No semantic methods | `apperror.Result[T]` |
| `!fn()` raw negation | Easy to miss `!` | Positive guard function |
| Nested `if` (any depth) | **Zero tolerance** | Flatten with early returns |
| Functions > 15 lines | Hard to read | Extract small helpers |
| Files > 400 lines | Hard to navigate | Split with suffix convention (target 300) |
| Magic strings/numbers | Brittle | Typed constants |
| Boolean flag parameters | Unclear intent | Separate named methods |

---

## Import Organization — 3 Groups

```go
import (
    // stdlib
    "context"
    "fmt"

    // internal packages
    "project/pkg/apperror"
    "project/internal/domain"

    // third-party
    "github.com/lib/pq"
)
```

---

## Common Mistakes — Go

These are real violations found and fixed. Reference to avoid repeating.

### Mistake 1: snake_case in `variantLabels`

```go
// ❌ WRONG — snake_case labels
var variantLabels = [...]string{
    Invalid:  "invalid",
    PerTable: "per_table",
}

// ✅ CORRECT — PascalCase labels
var variantLabels = [...]string{
    Invalid:  "Invalid",
    PerTable: "PerTable",
}
```

### Mistake 2: `!v.IsValid()` Instead of `v.IsInvalid()`

```go
// ❌ WRONG — raw negation
func (v Variant) String() string {
    if !v.IsValid() {
        return variantLabels[Invalid]
    }
    return variantLabels[v]
}

// ✅ CORRECT — positive counterpart
func (v Variant) String() string {
    if v.IsInvalid() {
        return variantLabels[Invalid]
    }
    return variantLabels[v]
}
```

### Mistake 3: `!pathutil.IsDir()` Without Counterpart

```go
// ❌ WRONG — raw negation on utility
if !pathutil.IsDir(gitDir) {
    return apperror.FailNew[StatusResult](apperror.ErrGitNotRepo, "not a git repo")
}

// ✅ CORRECT — use IsDirMissing()
if pathutil.IsDirMissing(gitDir) {
    return apperror.FailNew[StatusResult](apperror.ErrGitNotRepo, "not a git repo")
}
```

### Mistake 4: `fmt.Errorf()` for Service Errors

```go
// ❌ WRONG — no stack trace, no error code
return fmt.Errorf("failed to upload: %w", err)

// ✅ CORRECT — apperror with automatic stack trace
return apperror.Wrap(err, apperror.ErrUploadFailed, "failed to upload plugin")
```

### Mistake 5: Raw `(T, error)` from Service Methods

```go
// ❌ WRONG — raw tuple, no semantic methods
func (s *PluginService) GetById(ctx context.Context, id int64) (*Plugin, error) { ... }

// ✅ CORRECT — typed result wrapper
func (s *PluginService) GetById(ctx context.Context, id int64) apperror.Result[Plugin] { ... }
```

### Mistake 6: `interface{}` / `any` in Business Logic

```go
// ❌ WRONG — type erasure
func ProcessData(data interface{}) interface{} { ... }

// ✅ CORRECT — concrete types
func ProcessData(data PluginDetails) (PluginSummary, error) { ... }
```

### Mistake 7: snake_case in SQL / Struct Tags After Migration

```go
// ❌ WRONG — old snake_case
const query = `SELECT plugin_slug FROM transactions`
type Tx struct {
    PluginSlug string `db:"plugin_slug"`
}

// ✅ CORRECT — PascalCase
const query = `SELECT PluginSlug FROM Transactions`
type Tx struct {
    PluginSlug string `db:"PluginSlug"`
}
```

### Mistake 8: Compound Negation Without Named Boolean

```go
// ❌ WRONG — inline negated compound
if !config.BuildEnabled || config.BuildCommand == "" {
    return apperror.FailNew[BuildResult](apperror.ErrBuildNotConfigured, "build not configured")
}

// ✅ CORRECT — decomposed named booleans
isBuildDisabled := !config.BuildEnabled
hasEmptyBuildCommand := config.BuildCommand == ""
isBuildMissing := isBuildDisabled || hasEmptyBuildCommand

if isBuildMissing {
    return apperror.FailNew[BuildResult](apperror.ErrBuildNotConfigured, "build not configured")
}
```

---

## Cross-References

- [No Raw Negations](../coding-guidelines/no-negatives.md) — Positive guard functions (all languages)
- [Cross-Language Code Style](../coding-guidelines/code-style.md) — Braces, nesting & spacing rules
- [Function Naming](../coding-guidelines/function-naming.md) — No boolean flag parameters
- [Strict Typing](../coding-guidelines/strict-typing.md) — Type declarations & docblock rules
- [DRY Principles](../coding-guidelines/dry-principles.md)
- [Boolean Standards](02-boolean-standards.md) — Go-specific positive logic rules and exemptions
- [Readable Conditions](03-readable-conditions.md) — Named booleans, decomposed comparisons, whitespace rules
- [apperror Package Spec](../../11-imported/error-management/06-apperror-package/readme.md) — Full StackTrace, AppError, Result types specification
- [Enum Specification](01-enum-specification/00-overview.md) — Byte-based enum pattern, required methods, folder structure
- [RC1–RC4 Compliance Report](04-rc-compliance-report.md) — Audit of all spec files for readable conditions compliance
- [Master Coding Guidelines](../coding-guidelines/00-master-coding-guidelines.md) — Consolidated cross-language reference
- [Issues & Fixes Log](../coding-guidelines/01-issues-and-fixes-log.md) — Full historical fixes

---

*Golang standards specification v3.3.0 — 2026-02-23*
