# 01 — Naming Conventions

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

## Purpose

Every identifier in the codebase must be **self-documenting**. A reader should understand the purpose of a variable, function, or file without reading its implementation.

---

## 1. Variables

### 1.1 — Descriptive Names (Rule N1)

Variable names must describe **what the value represents**, not its type or shape.

```typescript
// ❌ FORBIDDEN — vague or abbreviated
const d = new Date();
const arr = getItems();
const tmp = process(input);
const x = config.retryCount;

// ✅ REQUIRED — descriptive
const currentDate = new Date();
const activeProjects = getItems();
const sanitizedInput = process(input);
const maxRetryCount = config.retryCount;
```

### 1.2 — Boolean Variables (Rule N2)

Boolean variables **MUST** use `is` or `has` prefix. The name must describe the **positive** state.

```typescript
// ✅ REQUIRED
const isLoaded = true;
const hasPermission = checkAccess(user);
const isConnectionActive = socket.readyState === WebSocket.OPEN;
const hasUnsavedChanges = dirtyFields.length > 0;

// ❌ FORBIDDEN — no prefix
const loaded = true;
const permission = checkAccess(user);

// ❌ FORBIDDEN — negative naming
const isNotReady = false;
const hasNoResults = list.length === 0;
```

### 1.3 — Positive Counterparts (Rule N3)

When you need the inverse of a boolean, create a **new variable with a positive name** that describes the inverted state. Never use `!` inline at the usage site.

```typescript
// Given:
const isFound = lookupItem(id);

// ❌ FORBIDDEN — negation at usage site
if (!isFound) {
    return handleMissing();
}

// ✅ REQUIRED — positive counterpart
const isMissing = !isFound;

if (isMissing) {
    return handleMissing();
}
```

Common positive counterpart pairs:

| Original | Counterpart |
|----------|-------------|
| `isFound` | `isMissing` |
| `isEnabled` | `isDisabled` |
| `isConnected` | `isDisconnected` |
| `isValid` | `isInvalid` |
| `isOpen` | `isClosed` |
| `isEmpty` | `hasItems` |
| `isLoading` | `isReady` |
| `hasAccess` | `isRestricted` |
| `isOnline` | `isOffline` |
| `isActive` | `isInactive` |

### 1.4 — Constants (Rule N4)

Constants use `UPPER_SNAKE_CASE` for module-level values and `camelCase` for function-scoped values.

```typescript
// ✅ Module-level constants
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const STORAGE_KEY_PREFIX = "marco_";

// ✅ Function-scoped constants
const maxRetries = config.maxRetryCount ?? MAX_RETRY_COUNT;
```

---

## 2. Functions

### 2.1 — Verb-Led Names (Rule N5)

Function names **MUST** start with a verb describing the action performed.

```typescript
// ✅ REQUIRED — verb-led
function fetchProjects(): Project[] { ... }
function validateUrl(url: string): boolean { ... }
function buildInjectionPayload(script: StoredScript): string { ... }
function handleTabNavigation(tabId: number): void { ... }

// ❌ FORBIDDEN — noun-only
function projects(): Project[] { ... }
function urlCheck(url: string): boolean { ... }
```

### 2.2 — Boolean-Returning Functions (Rule N6)

Functions that return a boolean **MUST** use `is` or `has` prefix.

```typescript
// ✅ REQUIRED
function isUrlMatch(pattern: string, url: string): boolean { ... }
function hasValidToken(cookies: Cookie[]): boolean { ... }
function isProjectActive(project: Project): boolean { ... }

// ❌ FORBIDDEN — no boolean prefix
function checkUrl(pattern: string, url: string): boolean { ... }
function validateToken(cookies: Cookie[]): boolean { ... }
```

---

## 3. Files & Folders

### 3.1 — File Naming (Rule N7)

- Source files: `kebab-case.ts` (e.g., `message-router.ts`, `url-matcher.ts`)
- Type files: `kebab-case.types.ts` when separated from implementation
- Test files: `kebab-case.test.ts`
- Constants: `constants.ts` or `kebab-case.constants.ts`

### 3.2 — Folder Naming (Rule N8)

Folders use `kebab-case` and describe their **domain**, not their file type.

```
src/
  background/       ← domain: service worker
  popup/            ← domain: popup UI
  options/          ← domain: options page
  shared/           ← domain: cross-module utilities
  content-scripts/  ← domain: injected scripts
```

---

## 4. Prohibited Patterns

| Pattern | Why | Fix |
|---------|-----|-----|
| Single-letter variables (`x`, `d`, `i` outside loops) | Unreadable | Use descriptive name |
| Abbreviations (`cfg`, `btn`, `msg`) | Ambiguous | Spell out: `config`, `button`, `message` |
| Hungarian notation (`strName`, `arrItems`) | Redundant with TypeScript | Drop prefix |
| `not` prefix (`notReady`, `notFound`) | Negative naming | Use positive counterpart |
| `no` prefix (`noResults`, `noPermission`) | Negative naming | Use `is`/`has` positive form |

**Exception**: `i`, `j`, `k` are permitted as loop index variables in simple `for` loops.

---

## ESLint Enforcement

| Rule | ESLint Rule / Plugin | Enforces |
|------|---------------------|----------|
| N1 | `id-length: [warn, { min: 2, exceptions: ["i", "j", "k"] }]` | Minimum identifier length |
| N4 | `@typescript-eslint/naming-convention` | UPPER_SNAKE_CASE for module constants, camelCase for variables |
| N5 | Custom rule or review | Verb-led function names (no automated rule available) |
| N7 | `unicorn/filename-case: [error, { case: "kebabCase" }]` | kebab-case file names |

**Plugins required**: `eslint-plugin-unicorn`, `@typescript-eslint/eslint-plugin`

---

## Cross-References

- [Boolean & Condition Logic](03-boolean-logic.md) — Positive condition rules
- [Function Standards](02-function-standards.md) — Size and parameter rules
- [Go Boolean Standards](../golang-standards/02-boolean-standards.md) — Parallel Go naming rules

*Naming conventions v1.1.0 — 2026-02-28*
