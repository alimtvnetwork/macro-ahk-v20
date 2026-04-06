# 03 — Boolean & Condition Logic

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

## Purpose

Every `if` statement must read like a **plain English sentence**. No negation operators, no complex compound expressions, no raw comparisons. This is the single most important readability rule in the codebase.

---

## 1. No Negation in `if` Statements (Rule B1)

The `!` operator is **FORBIDDEN** at the `if` site. Instead, create a **positive counterpart variable** above the `if`.

```typescript
// ❌ FORBIDDEN — negation at if site
if (!isConnected) {
    reconnect();
}

// ❌ FORBIDDEN — comparing to false
if (isConnected === false) {
    reconnect();
}

// ✅ REQUIRED — positive counterpart
const isDisconnected = !isConnected;

if (isDisconnected) {
    reconnect();
}
```

```typescript
// ❌ FORBIDDEN
if (!hasPermission) {
    return showAccessDenied();
}

// ✅ REQUIRED
const isRestricted = !hasPermission;

if (isRestricted) {
    return showAccessDenied();
}
```

---

## 2. Single Condition Per `if` (Rule B2)

Each `if` statement **MUST** contain exactly **one boolean variable**. Compound conditions with `&&` or `||` must be decomposed into named intermediate booleans.

```typescript
// ❌ FORBIDDEN — compound condition
if (isActive && hasScripts) {
    injectAll();
}

// ✅ REQUIRED — decomposed with named compound
const isActive = project.status === "active";
const hasScripts = project.scripts.length > 0;
const isReadyForInjection = isActive && hasScripts;

if (isReadyForInjection) {
    injectAll();
}
```

```typescript
// ❌ FORBIDDEN — mixed negation and compound
if (!isLoading && results.length > 0) {
    renderResults(results);
}

// ✅ REQUIRED — fully decomposed, all positive
const isReady = !isLoading;
const hasResults = results.length > 0;
const isReadyWithResults = isReady && hasResults;

if (isReadyWithResults) {
    renderResults(results);
}
```

---

## 3. Decomposed Comparisons (Rule B3)

Raw comparisons (`> 0`, `=== ""`, `!== null`, `.length === 0`) are **FORBIDDEN** inside `if` statements. Extract them into named booleans with **business meaning**.

```typescript
// ❌ FORBIDDEN — raw comparison in if
if (retryCount > MAX_RETRIES) {
    return abortOperation();
}

// ✅ REQUIRED — named boolean
const hasExceededRetryLimit = retryCount > MAX_RETRIES;

if (hasExceededRetryLimit) {
    return abortOperation();
}
```

```typescript
// ❌ FORBIDDEN — raw length check
if (scriptQueue.length === 0) {
    return;
}

// ✅ REQUIRED — named boolean
const isQueueEmpty = scriptQueue.length === 0;

if (isQueueEmpty) {
    return;
}
```

```typescript
// ❌ FORBIDDEN — raw null/undefined check
if (config !== null && config !== undefined) {
    applyConfig(config);
}

// ✅ REQUIRED — named boolean
const hasConfig = config !== null && config !== undefined;

if (hasConfig) {
    applyConfig(config);
}
```

---

## 4. All Conditions Must Be Positive (Rule B4)

When combining booleans with `&&` or `||`, **every operand** must be a positive-named variable. Never mix `!` with `&&`/`||`.

```typescript
// ❌ FORBIDDEN — mixed negation with compound
const shouldInject = !isLoading && isActive;

// ✅ REQUIRED — all positive operands
const isReady = !isLoading;
const shouldInject = isReady && isActive;
```

```typescript
// ❌ FORBIDDEN — negation in OR compound
const isBlocked = !hasToken || !isConnected;

// ✅ REQUIRED — positive counterparts first
const isTokenMissing = !hasToken;
const isDisconnected = !isConnected;
const isBlocked = isTokenMissing || isDisconnected;
```

---

## 5. Blank Line Before `if` (Rule B5)

A **blank line** must appear between the named boolean declaration(s) and the `if` statement. When multiple booleans compose a compound, the blank line goes before the `if`, not between declarations.

```typescript
// ❌ FORBIDDEN — no blank line
const isReady = !isLoading;
if (isReady) {
    start();
}

// ✅ REQUIRED — blank line before if
const isReady = !isLoading;

if (isReady) {
    start();
}

// ✅ REQUIRED — grouped declarations, blank line before if
const isReady = !isLoading;
const hasData = items.length > 0;
const isReadyWithData = isReady && hasData;

if (isReadyWithData) {
    renderItems(items);
}
```

---

## 6. Boolean-Returning Functions (Rule B6)

Functions that return a boolean **MUST** use `is` or `has` prefix. This signals to the caller that the return value is a boolean.

```typescript
// ✅ REQUIRED
function isUrlMatch(pattern: string, url: string): boolean { ... }
function hasActiveProject(): boolean { ... }
function isTabInjectable(tabId: number): boolean { ... }

// ❌ FORBIDDEN
function checkUrl(pattern: string, url: string): boolean { ... }
function getActiveStatus(): boolean { ... }
```

---

## 7. Truthy/Falsy Check Prohibition (Rule B7)

Implicit truthy/falsy checks are **FORBIDDEN**. JavaScript's truthy coercion (`""`, `0`, `null`, `undefined`, `NaN` all being falsy) leads to subtle bugs. Always use **explicit comparisons** extracted into named booleans.

```typescript
// ❌ FORBIDDEN — implicit truthy check
if (token) {
    useToken(token);
}

// ❌ FORBIDDEN — implicit falsy check
if (!config) {
    loadDefaults();
}

// ✅ REQUIRED — explicit comparison, named boolean
const hasToken = token !== null && token !== undefined;

if (hasToken) {
    useToken(token);
}

const isConfigMissing = config === null || config === undefined;

if (isConfigMissing) {
    loadDefaults();
}
```

```typescript
// ❌ FORBIDDEN — truthy check on string
if (errorMessage) {
    showError(errorMessage);
}

// ✅ REQUIRED — explicit length check
const hasErrorMessage = errorMessage.length > 0;

if (hasErrorMessage) {
    showError(errorMessage);
}
```

```typescript
// ❌ FORBIDDEN — truthy check on number
if (retryCount) {
    retry();
}

// ✅ REQUIRED — explicit comparison
const hasRetriesRemaining = retryCount > 0;

if (hasRetriesRemaining) {
    retry();
}
```

### 7.1 — Nullish Coalescing Is Permitted (Rule B8)

The `??` operator is **permitted** for default values because it explicitly handles `null`/`undefined`:

```typescript
// ✅ PERMITTED — nullish coalescing for defaults
const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const projectName = options.name ?? "Untitled Project";
```

But `||` for defaults is **FORBIDDEN** (it catches `0`, `""`, `false`):

```typescript
// ❌ FORBIDDEN — || catches falsy values
const timeout = config.timeoutMs || 5000;  // Breaks if timeoutMs is 0

// ✅ REQUIRED
const timeout = config.timeoutMs ?? 5000;
```

---

## 8. Exemptions

The following patterns are **exempt** from decomposition:

### 8.1 — Simple Well-Named Boolean (Single Check)

When the variable is already a well-named `is*`/`has*` boolean, used alone:

```typescript
// ✅ EXEMPT — already semantic, single check
if (isEnabled) {
    start();
}

if (hasUnsavedChanges) {
    promptSave();
}
```

### 8.2 — Ternary for Simple Assignment

Simple ternaries with a single well-named boolean are permitted:

```typescript
// ✅ EXEMPT — simple ternary
const statusLabel = isActive ? "Running" : "Stopped";
```

### 8.3 — Loop Conditions

Standard loop conditions are exempt:

```typescript
// ✅ EXEMPT — loop condition
for (let i = 0; i < items.length; i++) { ... }
while (queue.length > 0) { ... }
```

---

## Quick Reference

| Rule | What | Example Fix |
|------|------|-------------|
| B1 | No `!` in `if` | `const isMissing = !isFound;` then `if (isMissing)` |
| B2 | One condition per `if` | Decompose `&&`/`||` into named intermediate |
| B3 | No raw comparisons in `if` | `const hasItems = list.length > 0;` |
| B4 | All operands positive | Invert each negative before combining |
| B5 | Blank line before `if` | Separate declaration from control flow |
| B6 | Boolean functions use `is`/`has` | `isValid()` not `validate()` returning bool |
| B7 | No truthy/falsy in `if` | `const hasToken = token !== null;` not `if (token)` |
| B8 | Use `??` not `||` for defaults | `config.x ?? default` not `config.x || default` |

---

## ESLint Enforcement

| Rule | ESLint Rule / Plugin | Enforces |
|------|---------------------|----------|
| B1 | `no-negation-in-lhs-of-in` + code review | No `!` at if site (partial — no full ESLint rule exists) |
| B2 | `complexity: [warn, { max: 4 }]` | Limits compound conditions indirectly |
| B3 | Code review | Named booleans for raw comparisons (no automated rule) |
| B5 | `padding-line-between-statements: [warn, { blankLine: "always", prev: "const", next: "if" }]` | Blank line before `if` after declarations |
| B7 | `@typescript-eslint/strict-boolean-expressions: [error, { allowNullableBoolean: false }]` | Prohibits truthy/falsy checks |
| B8 | `@typescript-eslint/prefer-nullish-coalescing: error` | Enforces `??` over `\|\|` for defaults |
| — | `no-implicit-coercion: error` | Prevents `!!value`, `+string`, etc. |

**Plugins required**: `@typescript-eslint/eslint-plugin` (with type-checked config)

> **Note**: Rules B1–B4 (positive naming, single condition per `if`, decomposed comparisons) cannot be fully automated. These are enforced via code review and AI agent instructions.

---

## Cross-References

- [Naming Conventions](01-naming-conventions.md) — Positive counterpart pairs table
- [Go Boolean Standards](../../golang-standards/02-boolean-standards.md) — Parallel Go rules
- [Go Readable Conditions](../../golang-standards/03-readable-conditions.md) — RC1–RC4 rules (same philosophy)
- [Engineering Standards §24](../../08-coding-guidelines/engineering-standards.md) — Positive conditions mandate

*Boolean & condition logic v1.2.0 — 2026-02-28*
