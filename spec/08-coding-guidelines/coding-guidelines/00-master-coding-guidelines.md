# Master Coding Guidelines — Cross-Language Enforcement Reference

> **Version:** 1.0.0
> **Updated:** 2026-02-23
> **Applies to:** PHP, Go, TypeScript — all code in this project
> **Purpose:** Single source of truth for any developer or AI to produce standards-compliant code

---

## How to Use This Document

This is the **master reference**. Every rule here is enforced across all languages. Language-specific details are in:
- [PHP Standards](../php-standards/naming-conventions.md)
- [Go Standards](../golang-standards/readme.md)
- [TypeScript Standards](../typescript-standards/readme.md)
- [Database Naming](./database-naming.md)
- [Boolean Principles](./boolean-principles.md)
- [No-Negatives](./no-negatives.md)

---

## 1. Naming Conventions

### 1.1 — Universal Rules

| Element | Convention | PHP Example | Go Example | TS Example |
|---------|-----------|-------------|------------|------------|
| Class / Struct | PascalCase | `SnapshotManager` | `SnapshotManager` | `SnapshotManager` |
| Enum type name | PascalCase + `Type` suffix | `StatusType` | `status.Variant` (package-scoped) | `StatusType` |
| Enum case / constant | PascalCase | `StatusType::Success` | `status.Success` | `StatusType.Success` |
| Method (exported) | camelCase (PHP) / PascalCase (Go) | `processUpload()` | `ProcessUpload()` | `processUpload()` |
| Variable | camelCase | `$pluginSlug` | `pluginSlug` | `pluginSlug` |
| Boolean variable | `is`/`has` + camelCase | `$isActive` | `isActive` | `isActive` |
| File name (PHP) | PascalCase.php | `SnapshotManager.php` | — | — |
| File name (Go) | snake_case.go | — | `snapshot_manager.go` | — |
| Directory (Go pkg) | snake_case | — | `site_health/` | — |
| Abbreviations | First letter only caps | `$postId`, `$fileUrl` | `postId`, `fileUrl` | `postId`, `fileUrl` |
| JSON / API keys | PascalCase | `"PluginSlug"` | `"PluginSlug"` | `"PluginSlug"` |

### 1.2 — Abbreviation Standard (ALL LANGUAGES)

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `ID` | `Id` |
| `URL` | `Url` |
| `MD5` | `Md5` |
| `JSON` | `Json` |
| `API` | `Api` |
| `IP` | `Ip` |
| `SQL` | `Sql` |

> **Go Interface Exemptions:** `MarshalJSON()`, `UnmarshalJSON()`, and `Error() string` are required by Go's `encoding/json` and `error` interfaces respectively. These method names are **exempt** from the abbreviation rule — they MUST retain their standard library spelling. All other identifiers (struct fields, variables, function names, parameters) follow the table above.

### 1.3 — Zero Underscore Policy

**Snake_case is prohibited** for all logic-level identifiers across PHP, Go, and TypeScript. This includes:
- Variables, method names, properties, parameters
- Log context array keys (PHP): use camelCase (`'postId'`, not `'post_id'`)
- Internal array keys used in code logic

**Exemptions** (persistence-level only):
- WordPress hooks, capabilities, option keys, core table/column names
- Database migration rename maps (old→new mappings)
- PHP superglobals (`$_GET`, `$_POST`)
- HTML form `name` attributes and URL query parameters
- WP-Cron arguments, manifest JSON keys
- Go `runtime.GOOS` comparisons (`"windows"`, `"darwin"`)

---

## 2. Database Naming — PascalCase

> Full reference: [database-naming.md](./database-naming.md)

### Rules

| Element | Convention | Example |
|---------|-----------|---------|
| Custom table names | PascalCase | `Transactions`, `AgentSites` |
| Custom column names | PascalCase | `PluginSlug`, `CreatedAt` |
| Index names | `Idx` prefix + PascalCase | `IdxTransactions_CreatedAt` |
| WordPress core tables | snake_case (EXEMPT) | `wp_posts`, `wp_options` |

### Common Mistakes

```php
// ❌ MISTAKE: Using camelCase or snake_case for DB columns
$record = array(
    'pluginSlug' => $slug,       // Wrong — camelCase
    'created_at' => $now,        // Wrong — snake_case
);

// ✅ CORRECT: PascalCase matches the schema
$record = array(
    'PluginSlug' => $slug,
    'CreatedAt'  => $now,
);
```

```go
// ❌ MISTAKE: snake_case in SQL and struct tags
const query = `SELECT plugin_slug FROM transactions`
type Tx struct {
    PluginSlug string `db:"plugin_slug" json:"plugin_slug"`
}

// ✅ CORRECT: PascalCase everywhere
const query = `SELECT PluginSlug FROM Transactions`
type Tx struct {
    PluginSlug string `db:"PluginSlug" json:"PluginSlug"`
}
```

---

## 3. Boolean Standards — Positive Logic

> Full reference: [boolean-principles.md](./boolean-principles.md) and [no-negatives.md](./no-negatives.md)

### 6 Non-Negotiable Principles

| # | Principle | Rule |
|---|-----------|------|
| P1 | `is`/`has` prefix | Every boolean must start with `is` or `has` |
| P2 | No negative words | `not`, `no`, `non` are banned from boolean names |
| P3 | Named guards | Never use `!` on function calls — use semantic inverse |
| P4 | Extract complex expressions | 2+ operators → extract to named boolean |
| P5 | No boolean parameters | Use separate named methods or options objects |
| P6 | No mixed polarity | `isX && !isY` → extract to single-intent name |

### Common Mistakes

```php
// ❌ P1 violation: Missing prefix
$active = true;
$loaded = false;

// ✅ CORRECT
$isActive = true;
$isLoaded = false;
```

```php
// ❌ P2 violation: Negative word in name
$isNotReady = true;
$hasNoPermission = true;

// ✅ CORRECT: Positive semantic synonym
$isPending = true;
$isUnauthorized = true;
```

```php
// ❌ P3 violation: Raw negation on function call
if (!$order->isValid()) { return; }
if (!file_exists($path)) { return; }

// ✅ CORRECT: Semantic inverse / guard function
if ($order->isInvalid()) { return; }
if (PathHelper::isFileMissing($path)) { return; }
```

```go
// ❌ P3 violation in Go: Raw negation
if !v.IsValid() {
    return variantLabels[Invalid]
}
if !pathutil.IsDir(gitDir) {
    return err
}

// ✅ CORRECT: Positive counterpart
if v.IsInvalid() {
    return variantLabels[Invalid]
}
if pathutil.IsDirMissing(gitDir) {
    return err
}
```

### Go-Specific Exemptions

These Go patterns are **exempt** from the no-negation rule:
- `if !ok` — idiomatic comma-ok pattern
- `if !requireService(...)` / `if !decodeJSON(...)` — handler guard returns
- `if err != nil` — idiomatic error check
- `if !strings.HasPrefix(...)` — stdlib calls (extract if repeated 3+ times)

### Go Readable Conditions (RC1–RC4)

> Full reference: [readable-conditions.md](../golang-standards/03-readable-conditions.md)

Every Go `if` condition must read like plain English. Raw comparisons and inline negations are prohibited at the `if` site.

| Rule | Name | Requirement | Example |
|------|------|-------------|---------|
| RC1 | Positive Flags | Never use `== false` or inline `!` at the `if` site — assign inverse to a positive-named variable | `isLiveRun := !isDryRun` then `if isLiveRun { ... }` |
| RC2 | Decomposed Comparisons | Extract `> 0`, `== ""`, `!= nil`, `len() == 0` into named booleans with business meaning | `hasDeletedItems := totalDeleted > 0` then `if hasDeletedItems { ... }` |
| RC3 | Compound Conditions | Each check in a compound `if` must be a named boolean; the compound itself must also be named | `isLiveRunWithDeletions := isLiveRun && hasDeletedItems` |
| RC4 | Whitespace | A blank line must appear before every `if` that uses a named boolean variable | Declarations grouped, blank line, then `if` |

**Exempt from RC1–RC4:** `if err != nil`, comma-ok `if !ok`, single well-named `is*`/`has*` booleans used alone, handler guard returns.

---

## 4. Enum Standards

### 4.1 — PHP Enums

| Rule | Detail |
|------|--------|
| Type suffix | `StatusType`, `ActionType` — always `Type` suffix |
| Backed values | String-backed with PascalCase case names |
| Required methods | `isEqual()`, `isOtherThan()`, `isAnyOf()` on every backed enum |
| Comparison | Use `$status->isEqual(StatusType::Success)`, never `===` |
| Namespace | `RiseupAsia\Enums` |
| File location | `includes/Enums/{EnumName}Type.php` |

### 4.2 — Go Enums

| Rule | Detail |
|------|--------|
| Underlying type | `byte` (exception: `HttpStatusType` uses `int`) |
| Zero value | `Invalid = iota` — mandatory |
| Labels | `variantLabels` array with PascalCase strings |
| Required methods | `String()`, `Label()`, `IsValid()`, `IsInvalid()`, `Is{Value}()`, `IsOther()`, `IsAnyOf()`, `All()`, `ByIndex()`, `Parse()`, `Values()`, `MarshalJSON()`, `UnmarshalJSON()` |
| Package location | `internal/enums/{snake_case}/variant.go` |
| Protocol exemption | `content_type`, `endpoint`, `header`, `response_key`, `response_message` preserve functional values |

### Common Mistakes

```php
// ❌ MISTAKE: Using raw === for enum comparison
if ($status === StatusType::Success) { ... }

// ✅ CORRECT: Use isEqual()
if ($status->isEqual(StatusType::Success)) { ... }
```

```go
// ❌ MISTAKE: snake_case in variantLabels
var variantLabels = [...]string{
    Invalid:  "invalid",
    PerTable: "per_table",   // Wrong
    SingleDb: "single_db",   // Wrong
}

// ✅ CORRECT: PascalCase labels
var variantLabels = [...]string{
    Invalid:  "Invalid",
    PerTable: "PerTable",
    SingleDb: "SingleDb",
}
```

---

## 5. Code Style — Formatting Rules

> Full reference: [code-style.md](./code-style.md)

| Rule | Description |
|------|-------------|
| R1 | Always use braces — no single-line `if` |
| R2 | Zero nested `if` — absolute ban |
| R3 | Extract complex conditions into named booleans |
| R4 | Blank line before `return`/`throw` when preceded by statements |
| R5 | Blank line after `}` when followed by more code (5a: if, 5b: loops, 5c: try/switch) |
| R6 | Max 15 lines per function body |
| R7 | Zero nested `if` reinforcement |
| R9a | Function signatures >2 params → one per line with trailing comma |
| R9b | Function calls >2 args → one per line |
| R9c | PHP array literals >2 items → one per line |
| R10 | Blank line before control structures when preceded by assignments |
| R11 | Long string concatenations → line-by-line |
| R12 | No empty line after opening brace |
| R13 | No empty line at start of file |

### Common Mistakes

```php
// ❌ R2 violation: Nested if
if ($request !== null) {
    if ($request->hasParam('file')) {
        $this->process($request);
    }
}

// ✅ CORRECT: Early return + flat
if ($request === null) {
    return;
}

if ($request->hasParam('file')) {
    $this->process($request);
}
```

```php
// ❌ R4 violation: No blank line before return
$result = $this->compute($data);
return $result;

// ✅ CORRECT
$result = $this->compute($data);

return $result;
```

```go
// ❌ R6 violation: Function too long (>15 lines)
func ProcessUpload(ctx context.Context, req Request) error {
    // 25 lines of code...
}

// ✅ CORRECT: Decompose into helpers
func ProcessUpload(ctx context.Context, req Request) error {
    if err := validateUpload(req); err != nil {
        return err
    }

    result, err := executeUpload(ctx, req)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrUploadFailed, "upload failed")
    }

    return logAndRespond(ctx, result)
}
```

---

## 6. Error Handling

### PHP
- Use `try/catch` with `Throwable` (unqualified, imported via `use`)
- Never use leading backslash: `\Throwable` → `Throwable`

### Go
- All errors via `apperror.New()` or `apperror.Wrap()` — automatic stack traces
- Never use `fmt.Errorf()` for service errors
- Service methods return `apperror.Result[T]`, not raw `(T, error)`
- Error codes follow `E{category}xxx` convention

### 6.1 — Result Guard Rule (Zero Silent Failures)

Every Result/DbResult wrapper **MUST** have its error state checked before accessing the contained value. Accessing `.value()` / `.Value()` without a prior `hasError()` or `isSafe()` guard is a **spec violation**.

**Principle:** No error may ever be swallowed. If a result carries an error, it must be explicitly handled — logged, returned, or propagated. The framework-level `.value()` / `.Value()` accessor should log immediately when called on an errored result, reducing diagnostic steps. If an error exists, the accessor returns empty/zero and the framework logs the error automatically.

```php
// PHP — DbResult / DbResultSet / DbExecResult
$result = $query->queryOne(...);

// ❌ WRONG: No guard — error silently swallowed
$result->value();

// ✅ CORRECT: Guard before access
if ($result->hasError()) {
    $this->logger->logException($result->error(), 'context');

    return null;
}

return $result->value();
```

```php
// PHP — DbResultSet (collection access)
$results = $query->queryAll(...);

// ❌ WRONG: No guard — iterating potentially empty/errored set
foreach ($results->items() as $row) { ... }

// ✅ CORRECT: Guard before iteration
if ($results->hasError()) {
    $this->logger->logException($results->error(), 'query failed');

    return [];
}

return $results->items();
```

```php
// PHP — DbExecResult (write operations)
$execResult = $query->execute(...);

// ❌ WRONG: No guard — assuming success
$execResult->affectedRows();

// ✅ CORRECT: Guard before access
if ($execResult->hasError()) {
    $this->logger->logException($execResult->error(), 'execute failed');

    return false;
}

return $execResult->affectedRows() > 0;
```

```go
// Go — Propagation Rules (Result[T], ResultSlice[T], ResultMap[K,V])
// .AppError() returns *AppError — always preserves stack trace and context.
// Named AppError() (not Error()) to avoid confusion with Go's native error interface.

// ✅ Same-type → direct return (applies to Result, ResultSlice, ResultMap)
result := svc.GetById(ctx, id)           // Result[Plugin]
if result.HasError() { return result }    // no re-wrapping needed
plugin := result.Value()

// ✅ Cross-type → Fail/FailSlice/FailMap IS needed
plugins := s.pluginService.List(ctx)      // ResultSlice[Plugin]
if plugins.HasError() {
    return apperror.FailSlice[SyncResult](plugins.AppError())
}

// ❌ WRONG — redundant (same type re-wrapped)
if result.HasError() { return apperror.Fail[Plugin](result.AppError()) }

// ✅ Collection access — guard via IsSafe()
if result.IsSafe() {
    for _, item := range result.Items() { process(item) }
}

// ✅ Adapter unwrap — Result[T] → (*T, error)
func (a *Adapter) GetById(ctx context.Context, id int64) (*models.Plugin, error) {
    result := a.Service.GetById(ctx, id)
    if result.HasError() { return nil, result.AppError() }
    v := result.Value()
    return &v, nil
}
```

> **Full examples with PHP/Go/TypeScript:** see [apperror § Result Guard Rule](../../11-imported/error-management/06-apperror-package/readme.md#12-result-guard-rule--mandatory-error-check-before-value-access)

#### Enforcement Checklist

- [ ] Every `result.Value()` / `$result->value()` call is preceded by `HasError()` / `hasError()` or `IsSafe()` / `isSafe()`
- [ ] Every `result.Items()` / `$results->items()` call is preceded by a guard
- [ ] Every `result.Get(key)` on `ResultMap` is preceded by a guard
- [ ] Every `$execResult->affectedRows()` on `DbExecResult` is preceded by a guard
- [ ] No error is silently discarded — all errors are logged, returned, or propagated
- [ ] Cross-service callers (direct `*service.Service` refs) guard results the same way

### Common Mistakes

```go
// ❌ MISTAKE: Raw error without stack trace
return fmt.Errorf("failed to upload: %w", err)

// ✅ CORRECT: apperror with automatic stack trace
return apperror.Wrap(err, apperror.ErrUploadFailed, "failed to upload plugin")
```

```php
// ❌ MISTAKE: Leading backslash on global types
catch (\Throwable $e) { ... }

// ✅ CORRECT: Use import
use Throwable;
// ...
catch (Throwable $e) { ... }
```

---

## 7. Type Safety

### PHP
- Native type declarations on all parameters, return values, properties
- Remove redundant PHPDoc when native types are present
- Max 3 parameters per function

### Go
- Zero `any`/`interface{}`/`map[string]any` in business logic
- `json.RawMessage` only at architectural boundaries
- Concrete domain models for all handler decoding

### Common Mistakes

```go
// ❌ MISTAKE: Type erasure
func ProcessData(data interface{}) interface{} { ... }

// ✅ CORRECT: Concrete types
func ProcessData(data PluginDetails) (PluginSummary, error) { ... }
```

---

## 8. Magic Strings — Zero Tolerance

All repeated strings must be captured in enums or typed constants:

| Category | PHP Solution | Go Solution |
|----------|-------------|-------------|
| Hook names | `HookType::RestApiInit->value` | N/A |
| Capabilities | `CapabilityType::ManageOptions->value` | N/A |
| Table names | `TableType::Transactions->value` | Typed const |
| Error codes | `ErrorType::DATABASE_ERROR` | `apperror.ErrDatabase` |
| HTTP methods | `HttpMethodType::Post->value` | `http.MethodPost` |
| Log levels | `LogLevelType::Error->value` | `loglevel.Error.Lower()` |
| Status values | `StatusType::Success->value` | `status.Success.String()` |

---

## 9. File & Function Organization

### PHP
- PSR-4 autoloading: file name = class name
- One class/enum per file
- Traits must declare all their own `use` imports

### Go
- File target: 300 lines (hard limit 400)
- Function body: max 15 lines
- Split large files: `_crud.go`, `_helpers.go`, `_validation.go`
- Import order: stdlib → internal → third-party (3 groups, blank-line separated)

---

## 10. Array Key Conventions (PHP-Specific)

| Context | Convention | Example |
|---------|-----------|---------|
| Log context keys | camelCase | `'postId'`, `'masterDir'`, `'agentId'` |
| DB column keys | PascalCase | `'PluginSlug'`, `'CreatedAt'` |
| API response keys | Via `ResponseKeyType` enum | `ResponseKeyType::SnapshotId->value` |
| Persistence keys | Exempt (native casing) | `'schema_version'`, WP options |

### Common Mistakes

```php
// ❌ MISTAKE: snake_case in log context
$this->fileLogger->info('Post created', array('post_id' => $postId));

// ✅ CORRECT: camelCase
$this->fileLogger->info('Post created', array('postId' => $postId));
```

```php
// ❌ MISTAKE: camelCase for DB columns
$this->db->insert(TableType::Transactions->value, array('pluginSlug' => $slug));

// ✅ CORRECT: PascalCase matches schema
$this->db->insert(TableType::Transactions->value, array('PluginSlug' => $slug));
```

---

## 11. Lint Scripts (Go)

| Script | Rule | Status |
|--------|------|--------|
| `scripts/lint-file-size.sh` | No `.go` file > 300 lines | ✅ Active |
| `scripts/lint-func-size.sh` | No function body > 15 lines | ✅ Active |
| `scripts/lint-negative.sh` | No `IsNot*`, `HasNo*` function names | ✅ Active |

---

## 12. Cross-Language Enum Synchronization

Any modification to an enum must follow the [enum-consumer-checklist.md](../../11-imported/error-management/01-error-handling/readme.md):
1. Update PHP enum file
2. Update Go enum file (if mirrored)
3. Update TypeScript constants/types
4. Update database migration (if stored values change)
5. Update API documentation
6. Update admin templates referencing the enum

---

## Quick Checklist for Any Code Change

```
[ ] Naming: camelCase variables, PascalCase classes/enums/DB columns
[ ] JSON/API keys: PascalCase (e.g., "PluginSlug", "SiteId" — never "SITE_ID" or "siteId")
[ ] Abbreviations: Id (not ID), Url (not URL), Md5 (not MD5), Json (not JSON), Api (not API)
[ ] Booleans: is/has prefix, no negative words, no raw ! on calls
[ ] Enums: Type suffix, isEqual() not ===, PascalCase case names
[ ] DB: PascalCase tables/columns, PascalCase array keys for inserts
[ ] Formatting: braces always, zero nesting, blank before return, 15-line max
[ ] Errors: apperror.Wrap (Go), Throwable imported (PHP), no fmt.Errorf
[ ] Results: hasError()/isSafe() checked before .value()/.Value() — use .AppError() in Go (not .Error())
[ ] No magic strings: all via enums/typed constants
[ ] Log keys: camelCase in PHP context arrays
[ ] Types: no any/interface{} (Go), native types + no redundant PHPDoc (PHP)
```

---

*Master coding guidelines v1.0.0 — 2026-02-23*
