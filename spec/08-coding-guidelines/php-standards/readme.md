# PHP Coding Standards

> **Version:** 5.0.0  
> **Updated:** 2026-02-14  
> **Applies to:** WordPress companion plugins (PHP 7.4+)

---

## Naming Conventions

> **Baseline:** [PSR-12 PHP Naming Conventions](./naming-conventions.md)  
> The table below lists **project-specific overrides** that take precedence over PSR-12 defaults.

| Element | Convention | Example | Override reason |
|---------|-----------|---------|-----------------|
| Class names | PascalCase | `EnvelopeBuilder`, `SnapshotFactory` | _(matches PSR-12)_ |
| Method names | camelCase | `buildResponse()`, `getPluginInfo()` | Internal consistency (overrides WordPress snake_case) |
| Constants | UPPER_SNAKE_CASE (no `RISEUP_` prefix) | `REST_NAMESPACE`, `ACTION_UPLOAD` | _(matches PSR-12)_ |
| File names (classes) | `{PascalCase}.php` (PSR-4) | `EnvelopeBuilder.php`, `SnapshotFactory.php` | PSR-4 autoloading |
| File names (enums) | `{DefinitionName}Type.php` (PascalCase, PSR-4) | `UploadSourceType.php`, `CapabilityType.php` | PSR-4 in `includes/Enums/` |
| Variables | camelCase | `$pluginSlug`, `$stackTraceFrames` | _(matches PSR-12)_ |
| Enum types | PascalCase, **`Type` suffix required** | `UploadSourceType`, `CapabilityType`, `HttpMethodType` | PHP 8.1+ native backed enums |

> **PSR-4 file naming convention:**
> - **All classes** under `includes/` use PascalCase filenames matching the class name (e.g., `EnvelopeBuilder.php`, `SnapshotFactory.php`)
> - **Enums** in `includes/Enums/` use `{DefinitionName}Type.php` — PascalCase with `Type` suffix, no prefix, no hyphens, no underscores (e.g., `UploadSourceType.php` contains `enum UploadSourceType: string`)

---

## Error Handling — Safe Execution Strategy

### Rule: Catch `Throwable`, not just `Exception`

PHP 7+ introduces `Error` and `TypeError` that are **not** subclasses of `Exception`. All endpoint handlers must catch `Throwable`:

```php
// ❌ FORBIDDEN: Misses PHP 7+ Errors (e.g., missing class)
try {
    $result = $manager->process();
} catch (Exception $e) {
    wp_send_json_error($e->getMessage());
}

// ✅ REQUIRED: Catches all throwables
try {
    $result = $manager->process();

} catch (Throwable $e) {
    $this->logger->logException($e, 'process_failed');
    wp_send_json_error([
        'message'          => $e->getMessage(),
        'stackTrace'       => $e->getTraceAsString(),
        'stackTraceFrames' => $this->formatStackFrames($e),
    ], 500);
}
```

### Safe Execute Wrapper

All REST endpoint handlers must be wrapped in `safeExecute`:

```php
// ✅ Pattern: safeExecute wrapper
public function handleUpload(WP_REST_Request $request): WP_REST_Response {
    return $this->safeExecute(function() use ($request) {
        // Business logic here
        return $this->envelope->success($result);
    });
}

private function safeExecute(callable $callback): WP_REST_Response {
    try {
        return $callback();
    } catch (Throwable $e) {
        $this->logger->logException($e, 'endpoint_error');

        return $this->envelope->error($e->getMessage(), 500);
    }
}
```

### Global Shutdown Handler

Register a shutdown handler to catch fatal errors. **Delegate the type-check to `ErrorChecker`** which uses `ErrorType::FATAL_TYPES` (see [PHP Enum Spec](./enums.md)):

```php
// ❌ FORBIDDEN: Inline error-type checking
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // ...
    }
});

// ✅ REQUIRED: Use ErrorChecker for readable, centralized fatal-error detection
register_shutdown_function(function() {
    $error = error_get_last();
    if (ErrorChecker::isFatalError($error)) {
        // Log to fatal-errors.log via PathHelper::getFatalErrorLog()
        // Include memory_get_peak_usage() for diagnostics
        // Send JSON response before process dies (if REST_REQUEST)
    }
});
```

> **Implementation:** `ErrorChecker` delegates to `ErrorType::FATAL_TYPES` for the constant list. Use `ErrorChecker::getTypeLabel($error['type'])` to convert any `E_*` integer to a human-readable string (e.g., `'E_ERROR'`) — this replaces all inline type-mapping arrays. See [enums.md](./enums.md) for the full `ErrorChecker`, `ErrorType`, and `TYPE_LABELS` implementations.

---

## Structured Error Responses

### Required Fields

Every error response must include:

```json
{
  "message": "Human-readable error description",
  "stackTrace": "Full trace as string (debug_backtrace with unlimited depth)",
  "stackTraceFrames": [
    {
      "file": "/path/to/file.php",
      "line": 42,
      "function": "methodName",
      "class": "ClassName"
    }
  ]
}
```

### Stack Trace Logging

The logger captures two outputs for every error:

1. **Structured frames** — `stackTraceFrames` array in JSON responses
2. **Raw backtrace** — Written to `stacktrace.txt` with `debug_backtrace(0, 0)` (unlimited depth)

```php
// ✅ Dual logging: structured + raw
public function logException(Throwable $e, string $context = '') {
    // Structured frames for JSON responses
    $frames = $this->formatStackFrames($e);
    
    // Raw backtrace to file (unlimited depth)
    $backtrace = debug_backtrace(0, 0);
    file_put_contents($this->stacktraceFile, $this->formatBacktrace($backtrace), FILE_APPEND);
}
```

---

## Constants & Enums — No Magic Strings

### Rule: All identifiers in `constants.php` or native backed enums

Every endpoint path, action name, capability string, option key, **hook name**, **file path segment**, **HTTP method**, and **WordPress capability** must be defined centrally. Use PHP `constants.php` for simple values and **PHP 8.1+ native backed enums** in `includes/Enums/` for categorized groups.

> **See [enums.md](./enums.md)** for the full enum specification (v4.0.0), including file naming rules, namespace conventions, and all enum/const class definitions.

### Hook Names — HookType enum

```php
// ❌ FORBIDDEN: Magic hook strings
add_action('init', [$this, 'setup']);
add_action('rest_api_init', [$this, 'registerRoutes']);
add_action('plugins_loaded', [$this, 'onPluginsLoaded']);

// ✅ REQUIRED: Hook names from HookType enum
use RiseupAsia\Enums\HookType;

add_action(HookType::Init->value, [$this, 'setup']);
add_action(HookType::RestApiInit->value, [$this, 'registerRoutes']);
add_action(HookType::PluginsLoaded->value, [$this, 'onPluginsLoaded']);
```

### Action Names — Named Composed Constants

Inline concatenation at call sites is **forbidden** — even when using centralized base constants. Instead, compose descriptively named constants from base constants, then use those named constants directly.

```php
// ❌ FORBIDDEN: Magic strings
add_action('wp_ajax_my_action', [$this, 'handle']);
$url = rest_url('riseup-asia-uploader/v1/upload');

// ❌ FORBIDDEN: Inline concatenation at call site (even with constants)
// In constants.php:
define('REST_NAMESPACE', 'riseup-asia-uploader/v1');
define('ACTION_UPLOAD', 'upload');
// In handlers:
add_action(Hook::ajax('upload') , [$this, 'handle']);  // ← still inline concat
$url = rest_url(REST_NAMESPACE . '/' . ACTION_UPLOAD);

// ✅ REQUIRED: Compose named constants, then use them directly
// In constants.php:
define('REST_NAMESPACE', 'riseup-asia-uploader/v1');
define('ACTION_UPLOAD', 'upload');
define('REST_URL_UPLOAD', REST_NAMESPACE . '/' . ACTION_UPLOAD);
define('HOOK_AJAX_UPLOAD', HookType::ajax(ACTION_UPLOAD));

// In handlers — clean, readable, no concatenation:
add_action(HOOK_AJAX_UPLOAD, [$this, 'handle']);
$url = rest_url(REST_URL_UPLOAD);
```

> **Naming:** Constants must NOT use the `RISEUP_` prefix. Use descriptive names that convey purpose: `HOOK_AJAX_UPLOAD`, `REST_URL_UPLOAD`, `REST_NAMESPACE`.

---

## Dependency Checks

### Rule: Delegate to ErrorChecker — no inline extension checks

Before using external dependencies (PDO, extensions), verify availability via `ErrorChecker`. Never write inline `class_exists()` / `extension_loaded()` checks in business logic.

```php
// ❌ FORBIDDEN: Inline extension checks in business logic
if (!class_exists('PDO') || !extension_loaded('pdo_sqlite')) {
    $this->logger->error('PDO/SQLite not available');
    return $this->envelope->error('SQLite support not available', 500);
}

// ✅ REQUIRED: Centralized check via ErrorChecker
if (ErrorChecker::isInvalidPdoExtension()) {
    $this->logger->error('PDO/SQLite not available');

    return $this->envelope->error('SQLite support not available', 500);
}
```

Throttle repeated initialization errors to prevent log bloat.

---

## File Path Resolution

### Rule: Use fully-typed path accessors backed by PathConst constants

Never construct file paths with string concatenation or partial accessors. Every path must resolve to a **single typed accessor method** that internally composes a directory method + a `PathConst` constant.

### How It Works (Internal Architecture)

```
Caller code          →  PathHelper::getRootDb()
                              ↓
Accessor internals   →  self::getDataDir() + PathConst::ROOT_DB
                              ↓                    ↓
Directory method     →  WP_CONTENT_DIR + ...   '/a-root.db'
                              ↓
Final path           →  '/var/www/.../uploads/riseup-asia-uploader/a-root.db'
```

**The caller only ever sees the accessor.** The composition of directory + constant is an internal implementation detail.

### Forbidden vs Required

```php
// ❌ FORBIDDEN: Manual path construction with string literals
$path = WP_CONTENT_DIR . '/uploads/riseup-asia-uploader/data.db';

// ❌ FORBIDDEN: Partial accessor — caller still concatenates a magic string
$path = PathHelper::getDataDir() . '/data.db';

// ❌ FORBIDDEN: Using PathConst directly in business logic (leaks internals)
$path = PathHelper::getDataDir() . PathConst::ROOT_DB;

// ✅ REQUIRED: Single typed accessor — no path fragments visible to caller
$path = PathHelper::getRootDb();
```

### Why This Matters

| If you use... | Problem |
|---------------|---------|
| Manual concatenation | Filename is a magic string; renaming requires find-and-replace |
| `getDataDir() . '/file.db'` | Partial accessor; magic string still exists at the call site |
| `getDataDir() . PathConst::X` | Leaks the composition pattern; callers shouldn't know how paths are built |
| `getRootDb()` ✅ | Filename lives in `PathConst`, directory in `getDataDir()`, both hidden from caller |

> **Rule:** If a path does not have a typed accessor in `PathHelper`, create one before using it. See [PHP Enum Spec](./enums.md) for full `PathEnum` and `PathHelper` listings.

---

## Initialization — No WordPress Calls in Constructors

### Rule: Lazy initialization with HookType enum

Never call WordPress functions (`add_action`, `register_rest_route`, etc.) in class constructors. All hook registrations must use `HookType` enum cases:

```php
// ❌ FORBIDDEN: WordPress call in constructor + magic string
class MyPlugin {
    public function __construct() {
        add_action('init', [$this, 'setup']); // May fail if WP not loaded
    }
}

// ✅ REQUIRED: Lazy initialization with HookType enum
use RiseupAsia\Enums\HookType;

class MyPlugin {
    private bool $isInitialized = false;
    
    public function initialize() {
        if ($this->isInitialized) {
            return;
        }

        $this->isInitialized = true;
        add_action(HookType::Init->value, [$this, 'setup']);
    }
}
```

---

## Boolean Logic

### Rule: No raw negations — use positive guard functions

> **Canonical source:** [No Raw Negations](../coding-guidelines/no-negatives.md)

**Never use `!` on a function call in a condition.** Every negative check must be wrapped in a positively named guard function that reads as a single intent. See the canonical spec for the full cross-language rule and all guard function tables.

### Rule: Use semantic method names — no trivial wrapper helpers

Boolean checks must be self-documenting through **semantic method names** on the object itself. Trivial wrappers that merely restate native PHP operators are **prohibited** — they add indirection without clarity.

### Prohibited Trivial Wrappers (deprecated since 1.19.0)

The following methods from the legacy `BooleanHelpers` class are **deprecated and must not be used**. Use native PHP instead:

| ❌ Deprecated method | ✅ Native replacement |
|----------------------|----------------------|
| `BooleanHelpers::isFalsy($x)` | `!$x` |
| `BooleanHelpers::isTruthy($x)` | `(bool) $x` |
| `BooleanHelpers::isNull($x)` | `$x === null` |
| `BooleanHelpers::isSet($x)` | `$x !== null` |
| `BooleanHelpers::isEmpty($x)` | `empty($x)` |
| `BooleanHelpers::hasContent($x)` | `!empty($x)` |

```php
// ❌ FORBIDDEN: Trivial wrappers — use native PHP
if (BooleanHelpers::isFalsy($value)) { ... }
if (BooleanHelpers::isNull($config)) { ... }
if (BooleanHelpers::hasContent($name)) { ... }

// ✅ REQUIRED: Native PHP operators
if (!$value) { ... }
if ($config === null) { ... }
if (!empty($name)) { ... }
```

### Allowed Domain-Specific Helpers

The following `BooleanHelpers` methods **are allowed** because they encapsulate multi-step checks with safety guards (e.g., `empty()` + native function) that would be error-prone inline:

| Method | Semantics | Internal logic |
|--------|-----------|----------------|
| `isFuncExists($name)` | Function is available | `function_exists($name)` |
| `isFuncMissing($name)` | Function is not available | `!function_exists($name)` |
| `isClassExists($name)` | Class is available | `class_exists($name)` |
| `isClassMissing($name)` | Class is not available | `!class_exists($name)` |
| `isExtensionLoaded($name)` | PHP extension is loaded | `extension_loaded($name)` |
| `isExtensionMissing($name)` | PHP extension is not loaded | `!extension_loaded($name)` |
| `isDirExists($path)` | Directory exists | `!empty($path) && is_dir($path)` |
| `isDirMissing($path)` | Directory does not exist | `empty($path) \|\| !is_dir($path)` |
| `isDirWritable($path)` | Directory exists and is writable | `!empty($path) && is_dir($path) && is_writable($path)` |
| `isDirReadonly($path)` | Directory missing or not writable | `empty($path) \|\| !is_dir($path) \|\| !is_writable($path)` |
| `isFileExists($path)` | File exists | `!empty($path) && file_exists($path)` |
| `isFileMissing($path)` | File does not exist | `empty($path) \|\| !file_exists($path)` |
| `isDbConnected($db)` | DB object is connected | `$db !== null && $db->isConnected()` |
| `isDbDisconnected($db)` | DB object is not connected | `$db === null \|\| !$db->isConnected()` |

> **Why these are allowed:** Each combines a null/empty guard with a native function call — a pattern that is easy to get wrong inline. The semantic method name (`isDirMissing`) reads as a single intent.

### Semantic Object Methods

```php
// ❌ FORBIDDEN: Raw negation — easy to miss the "!"
if (!$plugin->isActive()) { ... }

// ✅ REQUIRED: Semantic inverse methods on the object
if ($plugin->isDisabled()) { ... }

// ✅ REQUIRED: Descriptive boolean variable names (Is/Has prefix)
if ($isValue) { ... }
if ($hasPermission) { ... }
```

### Guidelines

1. **Every `isX()` method should have a semantic inverse** (e.g., `isActive()` ↔ `isDisabled()`) rather than relying on `!isActive()`.
2. **Boolean variables must use `$is*` or `$has*` prefix** — never store a boolean in `$value` or `$result`.
3. **Never create new trivial wrapper helpers** — if the check is a single native operator (`!`, `empty()`, `=== null`), use PHP directly. Only create helpers for multi-step checks with safety guards.

---

## Code Style — Braces, Nesting, Spacing & Function Size

> These rules apply across **all languages** (PHP, TypeScript, Go).  
> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — this section repeats key rules with PHP-specific examples.

### Rule 1: Always use braces — no single-line returns

Every `if`, `for`, `foreach`, `while` block must use curly braces, even for single-statement bodies.

```php
// ❌ FORBIDDEN: Single-line return without braces
if ($this->initialized) return;
if ($error === null) return false;

// ✅ REQUIRED: Always use braces
if ($this->initialized) {
    return;
}

if ($error === null) {
    return false;
}
```

### Rule 2: Zero nested `if` — absolute ban

Nested `if` blocks are **absolutely forbidden** — zero tolerance, no exceptions. Flatten using early returns, combined conditions, or extracted helper functions. If a helper function already handles the null/empty check internally (e.g., `ErrorChecker::isFatalError()` already returns `false` for `null`), rely on it — don't wrap it in a redundant outer guard.

```php
// ❌ FORBIDDEN: Nested if — redundant null guard
if ($error !== null) {
    if (ErrorChecker::isFatalError($error)) {
        $this->logger->fatal($error);
    }
}

// ✅ REQUIRED: Flat — isFatalError() handles null internally
if (ErrorChecker::isFatalError($error)) {
    $this->logger->fatal($error);
}

// ✅ ALSO OK: Early return to flatten
if ($request === null) {
    return;
}

if ($request->has_param('file')) {
    $this->process($request);
}
```

### Rule 3: Extract complex conditions — no inline multi-part checks

When an `if` condition contains **two or more operators** (`&&`, `||`, `!`), it must be extracted into one of:

1. **A named boolean variable** (`$is_*` / `$has_*`) — for local, one-off checks
2. **A dedicated method/function** — for reusable or domain-meaningful checks
3. **A named constant** — for static flag combinations

The goal: every `if` reads as a **single intent**, not as implementation logic.

```php
// ── PHP ──────────────────────────────────────────────────────

// ❌ FORBIDDEN: Inline multi-part condition
if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR], true)) {
    $this->logger->fatal($error);
}

// ✅ REQUIRED: Extracted into a dedicated method
if (ErrorChecker::isFatalError($error)) {
    $this->logger->fatal($error);
}

// ❌ FORBIDDEN: Inline extension check
if (!class_exists('PDO') || !extension_loaded('pdo_sqlite')) {
    return $this->envelope->error('SQLite not available', 500);
}

// ✅ REQUIRED: Extracted into ErrorChecker
if (ErrorChecker::isInvalidPdoExtension()) {
    return $this->envelope->error('SQLite not available', 500);
}

// ❌ FORBIDDEN: Combinable nested conditions left inline
if ($request !== null && $request->hasParam('file') && $request->getParam('file') !== '') {
    $this->process($request);
}

// ✅ REQUIRED: Named boolean for clarity
$hasFileParam = $request !== null
    && $request->hasParam('file')
    && $request->getParam('file') !== '';

if ($hasFileParam) {
    $this->process($request);
}
```

```typescript
// ── TypeScript ───────────────────────────────────────────────

// ❌ FORBIDDEN: Inline multi-part condition
if (response && response.status >= 400 && response.data?.code?.startsWith('E8')) {
    showDelegatedError(response);
}

// ✅ REQUIRED: Named boolean
const isDelegatedError = response != null
    && response.status >= 400
    && response.data?.code?.startsWith('E8');

if (isDelegatedError) {
    showDelegatedError(response);
}

// ✅ ALSO OK: Dedicated function for reusable checks
function isDelegatedError(res: ApiResponse | null): res is DelegatedErrorResponse {
    return res != null && res.status >= 400 && res.data?.code?.startsWith('E8');
}

if (isDelegatedError(response)) {
    showDelegatedError(response);
}
```

```go
// ── Go ───────────────────────────────────────────────────────

// ❌ FORBIDDEN: Inline multi-part condition
if err != nil && resp != nil && resp.StatusCode >= 400 {
    handleUpstreamError(resp)
}

// ✅ REQUIRED: Named boolean
isUpstreamError := err != nil && resp != nil && resp.StatusCode >= 400

if isUpstreamError {
    handleUpstreamError(resp)
}
```

#### When to use which extraction:

| Complexity | Extraction | Example |
|------------|-----------|---------|
| 2 conditions, used once | Named `$is*` / `$has*` variable | `$hasFileParam = $req !== null && $req->hasParam('file');` |
| 2+ conditions, used in multiple places | Dedicated method/function | `ErrorChecker::isFatalError($error)` |
| Static flag combination | Named constant | `const EDITABLE = 'PUT, PATCH';` |

### Rule 4: Blank line before `return` when preceded by other statements

If a block contains statements before `return`, insert **one blank line** before the `return`. If `return` is the **only statement**, no blank line is needed.

```php
// ❌ FORBIDDEN: No blank line before return
if (ErrorChecker::isInvalidPdoExtension()) {
    $this->logger->error('PDO/SQLite not available');
    return $this->envelope->error('SQLite support not available', 500);
}

// ✅ REQUIRED: Blank line separates logic from exit
if (ErrorChecker::isInvalidPdoExtension()) {
    $this->logger->error('PDO/SQLite not available');

    return $this->envelope->error('SQLite support not available', 500);
}

// ✅ OK: Return is the only statement — no blank line needed
if ($error === null) {
    return false;
}
```

### Rule 5: Blank line after closing `}` when followed by more code

If code continues after a closing `}` (i.e., not followed by another `}` or end of function), insert **one blank line** after it.

```php
// ❌ FORBIDDEN: No blank line after block when code follows
if ($this->initialized) {
    return;
}
$this->initialized = true;
add_action(Hook::Init->value, [$this, 'setup']);

// ✅ REQUIRED: Blank line after block when code follows
if ($this->initialized) {
    return;
}

$this->initialized = true;
add_action(Hook::Init->value, [$this, 'setup']);
```

---

### Rule 6: Maximum 15 lines per function

> **Canonical source:** [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rule 6

Every function/method body must be **15 lines or fewer** (excluding blank lines, comments, and the signature). Extract logic into small, well-named helper functions.

```php
// ❌ FORBIDDEN: 25+ line function
public function handleUpload($request) {
    // validation, processing, logging, response... all inline
}

// ✅ REQUIRED: Short top-level, helpers do the work
public function handleUpload(WP_REST_Request $request): WP_REST_Response {
    $params = $this->extractUploadParams($request);
    $this->validateUpload($params);
    $result = $this->processUpload($params);
    $this->logUpload($result);

    return $this->envelope->success($result);
}
```

---

## Forbidden Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `catch (Exception $e)` | Misses PHP 7+ `Error` types | `catch (Throwable $e)` |
| Magic strings in hooks | Unmaintainable, typo-prone | `HookType::*->value` enum cases |
| Inline concatenation at call site | Hard to read, duplicated | Compose a named constant first |
| Magic strings in handlers | Unmaintainable | `constants.php` |
| `wp_die()` in REST handlers | Breaks JSON responses | `wp_send_json_error()` |
| Manual path concatenation | Fragile paths | `PathHelper` fully-typed accessors |
| `getDataDir() . '/file.db'` | Partial accessor, still magic | Add a typed accessor to `PathHelper` |
| Constructor WordPress calls | Load order issues | Lazy initialization |
| `error_log()` for diagnostics | No structure | Use `FileLogger` / `Logger` |
| Inline `!class_exists('PDO')` checks | Duplicated logic | `ErrorChecker::isInvalidPdoExtension()` |
| Nested `if` | **Zero tolerance** — absolute ban | Flatten with early returns or combined conditions |
| Functions > 15 lines | Hard to read, test, review | Extract helpers |
| `return` without blank line after statements | Poor readability | Blank line before `return` |
| Single-line `if (...) return;` | Easy to miss, inconsistent | Always use braces `{ }` |
| Inline multi-part `if` condition (2+ operators) | Hard to read, not reusable | Extract to named `$is_*` variable or method |
| `BooleanHelpers::isFalsy/isTruthy/...` | Trivial wrappers (deprecated) | Native PHP operators |
| `!$obj->isActive()` | Easy to miss negation | `$obj->isDisabled()` |
| `!file_exists()` / `!is_dir()` | Raw negation | `isFileMissing()` / `isDirMissing()` |
| `current_user_can('manage_options')` | Magic string | `CapabilityType::ManageOptions->value` |
| `'POST'` in routes | Inconsistent | `HttpMethodType::Post->value` |
| Untyped function parameters | No runtime safety | Add type declarations (see [Strict Typing](../coding-guidelines/strict-typing.md)) |
| Untyped return values | No contract enforcement | Add return type declarations |
| Redundant `@param` on typed signatures | Noisy duplication | Remove; keep summary only (see [Strict Typing](../coding-guidelines/strict-typing.md)) |
| Boolean flag changing operation meaning | Unreadable call sites | Split into named methods (see [Function Naming](../coding-guidelines/function-naming.md)) |

---

## Database Wrapper — `TypedQuery`

All database queries SHOULD use the generic `TypedQuery` class. It wraps `PDO` and returns typed result envelopes with automatic stack traces.

### Result Types

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| `DbResult<T>` | Single-row query | `isDefined()`, `isEmpty()`, `hasError()`, `isSafe()`, `value()`, `error()`, `stackTrace()` |
| `DbResultSet<T>` | Multi-row query | `hasAny()`, `isEmpty()`, `count()`, `hasError()`, `isSafe()`, `items()`, `first()`, `error()`, `stackTrace()` |
| `DbExecResult` | INSERT/UPDATE/DELETE | `isEmpty()`, `hasError()`, `isSafe()`, `affectedRows()`, `lastInsertId()`, `error()`, `stackTrace()` |

### Usage

```php
$tq = new TypedQuery($pdo);

// Single row — returns DbResult<PluginInfo>
$result = $tq->queryOne(
    'SELECT * FROM plugins WHERE id = :id',
    [':id' => $id],
    fn(array $row): PluginInfo => PluginInfo::fromRow($row),
);

if ($result->hasError()) { /* handle */ }
if ($result->isEmpty()) { /* not found */ }
$plugin = $result->value();

// Multiple rows — returns DbResultSet<SiteInfo>
$set = $tq->queryMany(
    'SELECT * FROM sites ORDER BY name',
    [],
    fn(array $row): SiteInfo => SiteInfo::fromRow($row),
);
foreach ($set->items() as $site) { /* ... */ }

// Exec — returns DbExecResult
$res = $tq->exec('DELETE FROM plugins WHERE id = :id', [':id' => $id]);
if ($res->hasError()) { /* handle */ }
echo $res->affectedRows();
```

### Mapper Closures

Callers provide a `Closure(array): T` mapper for type-safe row mapping (equivalent to Go's scanner functions). Use static `fromRow()` factory methods on domain models for consistency.

---

## Cross-References

- [WordPress Plugin Development Spec](../../11-imported/wordpress-plugin-development/) — Full 10-document guide
- [Error Handling Spec](../../11-imported/error-management/01-error-handling/) — Cross-language error strategy
- [Generic Enforce Spec](../../11-imported/generic-enforce/) — Type safety rules
- [DRY Principles](../coding-guidelines/dry-principles.md) — Cross-language DRY rules
- [Cross-Language Code Style](../coding-guidelines/code-style.md) — Braces, nesting & spacing rules (canonical)
- [Function Naming](../coding-guidelines/function-naming.md) — No boolean flag parameters (all languages)
- [Strict Typing](../coding-guidelines/strict-typing.md) — Type declarations & docblock rules (all languages)

---

*PHP standards specification v5.0.0 — 2026-02-14*
