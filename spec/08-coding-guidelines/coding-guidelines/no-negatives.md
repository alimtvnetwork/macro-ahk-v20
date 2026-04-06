# Cross-Language Rule: No Raw Negations — Use Positive Guard Functions

> **Version:** 2.0.0  
> **Updated:** 2026-02-16  
> **Applies to:** PHP, TypeScript, Go

---

## Principle

**Never use raw negation operators (`!`, `not`) on function calls or existence checks in conditions.** Instead, wrap every negative check in a **positively named utility function** that reads as a single intent.

Raw negations are easy to miss during code review, cause cognitive overhead, and scatter low-level logic across call sites. A named guard function centralizes the check, is self-documenting, and eliminates the visual noise of `!`.

---

## The Rule

| ❌ Forbidden | ✅ Required | Why |
|-------------|------------|-----|
| `!file_exists($path)` | `PathHelper::isFileMissing($path)` | Positive name; no `!` to overlook |
| `!is_dir($path)` | `PathHelper::isDirMissing($path)` | Self-documenting intent |
| `!class_exists('X')` | `BooleanHelpers::isClassMissing('X')` | Centralized, testable |
| `!function_exists('f')` | `BooleanHelpers::isFuncMissing('f')` | Same principle |
| `!extension_loaded('e')` | `BooleanHelpers::isExtensionMissing('e')` | Same principle |
| `!$obj->isActive()` | `$obj->isDisabled()` | Semantic inverse on object |
| `!arr.includes(x)` | `isMissing(arr, x)` | Named guard |
| `!strings.Contains(s, x)` | `IsMissing(s, x)` | Named guard |

### Key: Every negative check becomes a **positively named function**

The function name must express the **positive assertion** of what is being checked:
- "is missing" not "is not existing"
- "is disabled" not "is not active"  
- "is empty" not "is not filled"
- "is disconnected" not "is not connected"

---

## Language-Specific Examples

### PHP (camelCase methods)

```php
// ❌ FORBIDDEN: Raw negation on function call
if (!file_exists($path)) {
    return false;
}

if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

if (!class_exists('PDO')) {
    throw new RuntimeException('PDO not available');
}

// ✅ REQUIRED: Positive guard function from PathHelper / BooleanHelpers
use RiseupAsia\Helpers\PathHelper;
use RiseupAsia\Helpers\BooleanHelpers;

if (PathHelper::isFileMissing($path)) {
    return false;
}

if (PathHelper::isDirMissing($dir)) {
    mkdir($dir, 0755, true);
}

if (BooleanHelpers::isClassMissing('PDO')) {
    throw new RuntimeException('PDO not available');
}
```

**Utility classes:**
- `PathHelper` (`RiseupAsia\Helpers\PathHelper`) — file/directory guards
- `BooleanHelpers` (`RiseupAsia\Helpers\BooleanHelpers`) — function/class/extension/database guards

| Guard Method | Replaces | Class |
|-------------|----------|-------|
| `isFileMissing($path)` | `!file_exists($path)` | `PathHelper` |
| `isFileExists($path)` | `file_exists($path)` (with null guard) | `PathHelper` |
| `isDirMissing($path)` | `!is_dir($path)` | `PathHelper` |
| `isDirExists($path)` | `is_dir($path)` (with null guard) | `PathHelper` |
| `isDirWritable($path)` | `is_dir($path) && is_writable($path)` | `PathHelper` |
| `isDirReadonly($path)` | `!is_dir($path) \|\| !is_writable($path)` | `PathHelper` |
| `isClassMissing($name)` | `!class_exists($name)` | `BooleanHelpers` |
| `isClassExists($name)` | `class_exists($name)` | `BooleanHelpers` |
| `isFuncMissing($name)` | `!function_exists($name)` | `BooleanHelpers` |
| `isFuncExists($name)` | `function_exists($name)` | `BooleanHelpers` |
| `isExtensionMissing($name)` | `!extension_loaded($name)` | `BooleanHelpers` |
| `isExtensionLoaded($name)` | `extension_loaded($name)` | `BooleanHelpers` |
| `isDbConnected($db)` | `$db !== null && $db->isConnected()` | `BooleanHelpers` |
| `isDbDisconnected($db)` | `$db === null \|\| !$db->isConnected()` | `BooleanHelpers` |

### TypeScript (camelCase functions)

```typescript
// ❌ FORBIDDEN: Raw negation
if (!fs.existsSync(path)) {
    throw new Error('File not found');
}

if (!response.ok) {
    handleError(response);
}

if (!array.includes(item)) {
    array.push(item);
}

// ✅ REQUIRED: Positive guard function
if (isFileMissing(path)) {
    throw new Error('File not found');
}

if (isResponseFailed(response)) {
    handleError(response);
}

if (isItemMissing(array, item)) {
    array.push(item);
}
```

**Utility location:** `src/utils/guards.ts` or domain-specific guard files

| Guard Function | Replaces |
|---------------|----------|
| `isFileMissing(path)` | `!fs.existsSync(path)` |
| `isFileExists(path)` | `fs.existsSync(path)` |
| `isResponseFailed(res)` | `!res.ok` |
| `isResponseSuccess(res)` | `res.ok` |
| `isArrayEmpty(arr)` | `!arr.length` or `arr.length === 0` |
| `hasItems(arr)` | `arr.length > 0` |
| `isNullish(val)` | `val == null` |
| `isPresent(val)` | `val != null` |
| `isStringEmpty(str)` | `!str` or `str === ''` |
| `hasContent(str)` | `!!str` or `str.length > 0` |

### Go (PascalCase exported functions)

```go
// ❌ FORBIDDEN: Raw negation
if !fileExists(path) {
    return fmt.Errorf("file not found: %s", path)
}

if !strings.Contains(s, substr) {
    return apperror.New("E4010", "missing required field")
}

// ✅ REQUIRED: Positive guard function
if IsFileMissing(path) {
    return apperror.New("E4010", "file not found: "+path)
}

if IsMissingSubstring(s, substr) {
    return apperror.New("E4010", "missing required field")
}
```

**Utility package:** `pkg/guards/` or `internal/guards/`

| Guard Function | Replaces |
|---------------|----------|
| `IsFileMissing(path)` | `!fileExists(path)` |
| `IsFileExists(path)` | `fileExists(path)` |
| `IsDirMissing(path)` | `!dirExists(path)` |
| `IsDirExists(path)` | `dirExists(path)` |
| `IsStringEmpty(s)` | `s == ""` or `len(s) == 0` |
| `HasContent(s)` | `s != ""` or `len(s) > 0` |
| `IsSliceEmpty(s)` | `len(s) == 0` |
| `HasItems(s)` | `len(s) > 0` |
| `IsMissingSubstring(s, sub)` | `!strings.Contains(s, sub)` |
| `ContainsSubstring(s, sub)` | `strings.Contains(s, sub)` |

---

## Object-Level Semantic Inverses

Every boolean method on an object **must have a semantic inverse** — never negate a method call with `!`.

```php
// ❌ FORBIDDEN
if (!$plugin->isActive()) { ... }
if (!$user->hasPermission('admin')) { ... }

// ✅ REQUIRED
if ($plugin->isDisabled()) { ... }
if ($user->lacksPermission('admin')) { ... }
```

```typescript
// ❌ FORBIDDEN
if (!plugin.isActive()) { ... }
if (!user.hasPermission('admin')) { ... }

// ✅ REQUIRED
if (plugin.isDisabled()) { ... }
if (user.lacksPermission('admin')) { ... }
```

```go
// ❌ FORBIDDEN
if !plugin.IsActive() { ... }
if !user.HasPermission("admin") { ... }

// ✅ REQUIRED
if plugin.IsDisabled() { ... }
if user.LacksPermission("admin") { ... }
```

---

## When Raw `!` Is Still Acceptable

Raw negation is **only** acceptable for:

1. **Simple boolean variable checks** where the variable is already a positively named `is_*`/`has_*` boolean:
   ```php
   if (!$isInitialized) { ... }  // ✅ OK — variable is already semantic
   ```

2. **Logical operators in extracted named booleans** (inside the variable/method definition, not at the call site):
   ```php
   $isInvalid = !$isValid && !$hasOverride;  // ✅ OK — inside named boolean
   if ($isInvalid) { ... }                    // ✅ Call site is clean
   ```

3. **Native type coercion** where no function exists:
   ```php
   if (!$value) { ... }  // ✅ OK — simple falsy check on primitive
   ```

---

## Checklist Summary (Copy for PRs)

```
[ ] No `!file_exists()` — use `PathHelper::isFileMissing()`
[ ] No `!is_dir()` — use `PathHelper::isDirMissing()`
[ ] No `!class_exists()` — use `BooleanHelpers::isClassMissing()` / guard function
[ ] No `!function_exists()` — use `BooleanHelpers::isFuncMissing()` / guard function
[ ] No `!extension_loaded()` — use `BooleanHelpers::isExtensionMissing()` / guard function
[ ] No `!$obj->isActive()` — use `$obj->isDisabled()` / semantic inverse
[ ] No `!array.includes()` — use `isItemMissing()` / guard function
[ ] No `!strings.Contains()` — use `IsMissingSubstring()` / guard function
[ ] Guard functions live in dedicated utility classes/packages
[ ] Every boolean method on objects has a semantic inverse
[ ] No mixed-polarity conditions (`isX && !y`) — extract to a named boolean (see P6 in boolean-principles.md)
```

---

## Cross-References

- [PHP Boolean Logic](../php-standards/readme.md#boolean-logic) — PHP-specific helpers
- [PHP Forbidden Patterns](../php-standards/forbidden-patterns.md) — Pattern 4.x
- [Cross-Language Code Style](./code-style.md) — Braces, nesting, spacing
- [TypeScript Standards](../typescript-standards/readme.md)
- [Golang Standards](../golang-standards/readme.md)
- [Go Readable Conditions (RC1–RC4)](../golang-standards/03-readable-conditions.md) — Named booleans, decomposed comparisons, compound conditions & whitespace rules

---

*No-negatives specification v2.1.0 — 2026-02-17*
