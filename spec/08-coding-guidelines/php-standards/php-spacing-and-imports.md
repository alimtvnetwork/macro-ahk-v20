# PHP Spacing and Import Rules

> **Version:** 1.0.0  
> **Updated:** 2026-02-26  
> **Applies to:** All PHP files in the `RiseupAsia` namespace

---

## Overview

This document codifies three critical PHP formatting rules that are frequently violated. Each rule includes a **wrong** example, the **correct** version, and the rationale. These rules are derived from the [cross-language code-style spec](../coding-guidelines/code-style.md) (Rules 4, 8, 10) but are presented here with **PHP-specific examples** for maximum clarity.

---

## Rule 1: Blank Line Before `if` When Preceded by Statements

When an `if` block is preceded by **one or more statements** (assignments, method calls, etc.), insert **one blank line** before the `if`.

**Exception:** No blank line is needed when the `if` is the **first statement** in a function/method body, or immediately follows another closing `}`.

### Example: First Statement in Function — No Blank Line

```php
// ✅ CORRECT — if is the first statement, no blank line needed
public function handleScan(): void
{
    if ($this->isRunning()) {
        return;
    }

    $this->startScan();
}
```

### Example: Preceded by Statement — Blank Line Required

```php
// ❌ WRONG — no blank line between statement and if
$existingRunning = $this->findRunningProcess();
if ($existingRunning !== null) {
    Logger::warning('Scan already running', array('existingId' => $existingRunning->id));

    throw new RuntimeException('A scan is already in progress', 14100);
}

// ✅ CORRECT — blank line separates setup from decision
$existingRunning = $this->findRunningProcess();

if ($existingRunning !== null) {
    Logger::warning('Scan already running', array('existingId' => $existingRunning->id));

    throw new RuntimeException('A scan is already in progress', 14100);
}
```

### Example: After Closing Brace — Rule 5 Applies Instead

```php
// ✅ CORRECT — if follows }, Rule 5 provides the blank line
if ($guardA) {
    return;
}

if ($guardB) {
    return;
}
```

---

## Rule 2: Blank Line Before `throw` When Preceded by Statements

Same as `return`: if a `throw` is preceded by **one or more statements** in the same block, insert **one blank line** before it. If `throw` is the **only statement**, no blank line is needed.

### Example: Throw After Logger — Blank Line Required

```php
// ❌ WRONG — no blank line before throw
if ($existingRunning !== null) {
    Logger::warning('Scan already running', array('existingId' => $existingRunning->id));
    throw new RuntimeException('A scan is already in progress', 14100);
}

// ✅ CORRECT — blank line before throw
if ($existingRunning !== null) {
    Logger::warning('Scan already running', array('existingId' => $existingRunning->id));

    throw new RuntimeException('A scan is already in progress', 14100);
}
```

### Example: Throw Is Sole Statement — No Blank Line

```php
// ✅ CORRECT — throw is the only statement, no blank line needed
if ($input === null) {
    throw new InvalidArgumentException('Input is required');
}
```

---

## Rule 3: No Leading Backslash — Use `use` Import

In namespaced PHP files, **never** reference global types with a leading backslash (`\Throwable`, `\RuntimeException`, `\PDO`). Instead, add a `use` import at the top of the file.

### Why

- Consistency: all type references are unqualified
- Readability: class names read naturally without namespace noise
- Discoverability: the `use` block at the top shows all dependencies

### Example: Exception Classes

```php
// ❌ WRONG — leading backslash
throw new \RuntimeException('A scan is already in progress', 14100);
catch (\Throwable $e) { ... }
$pdo = new \PDO($dsn);
$query = new \WP_Query($args);

// ✅ CORRECT — use import at file top
use RuntimeException;
use Throwable;
use PDO;
use WP_Query;

// Then use unqualified names in the body:
throw new RuntimeException('A scan is already in progress', 14100);
catch (Throwable $e) { ... }
$pdo = new PDO($dsn);
$query = new WP_Query($args);
```

### Exemptions

- **Autoloader.php** — Must remain self-contained; `use` imports are not available before the autoloader is registered.
- **Main plugin bootstrap file** (`riseup-asia-uploader.php`) — May use backslash-qualified names if the `catch` block runs before the autoloader is fully bootstrapped.

---

## Rule 4: Log Context Keys — Reusable Keys Must Use Enums

Log context array keys (the second argument to `$this->log()` or `$this->fileLogger->info()`) follow **camelCase** naming. However:

- **One-off descriptive keys** may remain as raw camelCase strings (e.g., `'ageMinutes'`, `'masterDir'`).
- **Reusable keys** that appear in **3+ log calls** across different files must be defined as a constant or `ResponseKeyType` enum case.

### Example

```php
// ❌ WRONG — 'existingId' appears in 5+ files as a raw string
Logger::warning('Scan already running', array('existingId' => $existingRunning->id));
$this->fileLogger->info('Export found', array('existingId' => $existing['Id']));

// ✅ CORRECT — use enum for reusable key
Logger::warning('Scan already running', array(ResponseKeyType::ExistingId->value => $existingRunning->id));
```

---

## Combined Example — All Rules Applied

```php
// ❌ WRONG — four violations in one block
$existingRunning = $this->findRunningProcess();
if ($existingRunning !== null) {
    Logger::warning('Scan already running', ['existing_id' => $existingRunning->id]);
    throw new \RuntimeException('A scan is already in progress', 14100);
}

// ✅ CORRECT — all rules applied
$existingRunning = $this->findRunningProcess();

if ($existingRunning !== null) {
    Logger::warning('Scan already running', array('existingId' => $existingRunning->id));

    throw new RuntimeException('A scan is already in progress', 14100);
}
```

**Violations fixed:**
1. ✅ Blank line before `if` (Rule 1 — preceded by `$existingRunning` assignment)
2. ✅ Blank line before `throw` (Rule 2 — preceded by `Logger::warning`)
3. ✅ No `\RuntimeException` — use `use RuntimeException;` import (Rule 3)
4. ✅ camelCase log key `'existingId'` (not snake_case `'existing_id'`)

---

## Cross-References

- [Cross-Language Code Style](../coding-guidelines/code-style.md) — Rules 4, 8, 10
- [PHP Naming Conventions](./naming-conventions.md) — Array key casing rules
- [PHP Forbidden Patterns](./forbidden-patterns.md) — Banned patterns checklist
