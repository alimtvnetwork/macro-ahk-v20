# Code Quality Improvement — Master Rules

> **Process Name**: Code Quality Improvement  
> **Version**: 1.0.0  
> **Last updated**: 2026-03-29  
> **Scope**: All languages (TypeScript, Go, PHP, etc.)

---

## 1. Exported Object Constants — PascalCase (Rule CQ1)

Exported `const` objects MUST use **PascalCase** names.

```typescript
// ❌ FORBIDDEN — UPPER_SNAKE_CASE for object constants
export const WS_TIER_LABELS: WsTierLabelMap = { ... };

// ✅ REQUIRED — PascalCase
export const WsTierLabels: WsTierLabelMap = { ... };
```

Simple scalar constants (`string`, `number`, `boolean`) still use `UPPER_SNAKE_CASE`:

```typescript
export const MAX_RETRY_COUNT = 3;          // ✅ scalar — UPPER_SNAKE_CASE
export const DEFAULT_TIMEOUT_MS = 5000;    // ✅ scalar — UPPER_SNAKE_CASE
```

---

## 2. No Inline Type Definitions — Extract & Reuse (Rule CQ2)

Never define types inline. Extract them into a named `type` or `interface` and reuse.

```typescript
// ❌ FORBIDDEN — inline type definition
export const WsTierLabels: Record<string, { label: string; bg: string; fg: string }> = { ... };

// ✅ REQUIRED — extracted type
export interface TierLabelStyle {
  label: string;
  bg: string;
  fg: string;
}

export type WsTierLabelMap = Record<string, TierLabelStyle>;

export const WsTierLabels: WsTierLabelMap = { ... };
```

---

## 3. No Magic Strings — Enums or Constants (Rule CQ3)

Every string literal used in comparisons or branching MUST be replaced:

| Pattern | Solution |
|---------|----------|
| Group of related values (e.g., status, tier, direction) | `enum` |
| Single standalone value (e.g., storage key, URL) | Named `const` |

```typescript
// ❌ FORBIDDEN — magic string in comparison
if (plan === "pro") { ... }

// ✅ REQUIRED — enum
enum PlanType {
  Free = 'free',
  Lite = 'lite',
  Pro = 'pro',
}

if (plan === PlanType.Pro) { ... }
```

```typescript
// ❌ FORBIDDEN — magic string as standalone value
localStorage.setItem("marco_state", data);

// ✅ REQUIRED — named constant
const STORAGE_KEY_STATE = "marco_state";
localStorage.setItem(STORAGE_KEY_STATE, data);
```

---

## 4. Function Size Limits (Rule CQ4)

| Metric | Target | Hard Max |
|--------|--------|----------|
| Lines per function | **≤ 8** | **25** |

- Do NOT compress multiple statements onto one line to meet the limit.
- Break large functions into smaller, well-named helper functions.
- Each helper should do **one thing** with a **verb-led name**.

```typescript
// ❌ FORBIDDEN — 30-line function
function processWorkspace(ws: Workspace): void {
  // ... 30 lines of mixed logic
}

// ✅ REQUIRED — decomposed
function processWorkspace(ws: Workspace): void {
  const credits = extractCredits(ws);
  const tier = resolveWorkspaceTier(ws);
  updateCreditDisplay(credits, tier);
  syncStateAfterProcess(ws);
}
```

---

## 5. Simple Conditions — No Complex Logic in `if` (Rule CQ5)

`if` conditions must be **single, named booleans**. Never combine `&&`, `||`, or comparisons inline.

```typescript
// ❌ FORBIDDEN — complex inline condition
if (ws.plan === "pro" && ws.credits > 0 && !ws.isExpired) { ... }

// ✅ REQUIRED — extract into named boolean or function
const isActiveProWorkspace = isProPlan(ws) && hasAvailableCredits(ws) && isNotExpired(ws);

if (isActiveProWorkspace) { ... }
```

For reusable conditions, extract into a **boolean-returning function**:

```typescript
function isActiveProWorkspace(ws: Workspace): boolean {
  const isProPlan = ws.plan === PlanType.Pro;
  const hasCredits = ws.credits > 0;
  const isActive = ws.isExpired === false;

  return isProPlan && hasCredits && isActive;
}
```

---

## 6. No Negation in Conditions (Rule CQ6)

Never use `!`, `not`, or negative checks directly in `if`. Create a **positive counterpart**.

```typescript
// ❌ FORBIDDEN
if (!isConnected) { ... }
if (!hasPermission) { ... }

// ✅ REQUIRED — positive counterpart
const isDisconnected = !isConnected;
if (isDisconnected) { ... }

const isRestricted = !hasPermission;
if (isRestricted) { ... }
```

---

## 7. Boolean Naming — `is` / `has` Prefix (Rule CQ7)

ALL booleans (variables, constants, function return values) MUST use `is` or `has` prefix.

```typescript
// ❌ FORBIDDEN
const ready = true;
const permission = checkAccess();
function checkValid(): boolean { ... }

// ✅ REQUIRED
const isReady = true;
const hasPermission = checkAccess();
function isValid(): boolean { ... }
```

---

## 8. Meaningful Variable Names (Rule CQ8)

No single-letter or abbreviated variable names. Every name must describe its purpose.

```typescript
// ❌ FORBIDDEN
const s = getStatus();
const x = ws.credits;
const d = new Date();

// ✅ REQUIRED
const currentStatus = getStatus();
const availableCredits = ws.credits;
const currentDate = new Date();
```

**Exception**: `i`, `j`, `k` in simple `for` loops.

---

## 9. Self-Documenting Code (Rule CQ9)

Code should explain itself through naming and structure. If a block needs a comment to explain *what* it does, refactor it into a well-named function instead.

```typescript
// ❌ FORBIDDEN — comment explains what code does
// Check if workspace has expired and has no credits
if (ws.expiry < Date.now() && ws.credits === 0) { ... }

// ✅ REQUIRED — function name explains intent
if (isExpiredWithNoCredits(ws)) { ... }
```

---

## 10. Conversion Documentation (Rule CQ10)

When refactoring code to follow these rules, include a **before/after example** in a JSDoc or linked spec file, so reviewers can trace the change.

```typescript
/**
 * Resolves workspace tier from plan and billing data.
 *
 * @see spec/08-coding-guidelines/01-code-quality-improvement.md — Rule CQ1, CQ2, CQ3
 *
 * Conversion example:
 *   Before: export const WS_TIER_LABELS: Record<string, { label: string; bg: string; fg: string }> = { ... }
 *   After:  export const WsTierLabels: WsTierLabelMap = { ... }  (with extracted TierLabelStyle interface)
 */
```

---

## Quick Reference

| Rule | Summary | Severity |
|------|---------|----------|
| CQ1 | Exported object constants → PascalCase | High |
| CQ2 | No inline types → extract & reuse | High |
| CQ3 | No magic strings → enum or const | High |
| CQ4 | Functions ≤ 8 lines (max 25) | High |
| CQ5 | Simple conditions → named booleans | High |
| CQ6 | No negation in `if` → positive counterpart | High |
| CQ7 | Booleans prefixed `is` / `has` | High |
| CQ8 | Meaningful variable names | High |
| CQ9 | Self-documenting code over comments | High |
| CQ10 | Before/after examples for conversions | Medium |
| CQ11 | No mutable module-level `let` — use class or immutable flow | 🔴 Critical |
| CQ12 | Immutable data flow — no `.push()`/`.splice()` on shared refs | 🔴 Critical |
| CQ13 | `for-of` over C-style `for` loops | High |
| CQ14 | Curly braces on all `if`/`else` + newlines between blocks | High |
| CQ15 | Newline before every `return` | High |
| CQ16 | No nested function definitions | High |
| CQ17 | Class encapsulation for stateful modules | High |
| CQ18 | Retry/timeout as SDK utilities, not inline | High |

---

## Cross-References

- [TypeScript Immutability Standards (CQ11–CQ18)](02-typescript-immutability-standards.md)
- [Naming Conventions](../07-chrome-extension/coding-guidelines/01-naming-conventions.md)
- [Boolean Logic](../07-chrome-extension/coding-guidelines/03-boolean-logic.md)
- [Function Standards](../07-chrome-extension/coding-guidelines/02-function-standards.md)
- [TypeScript Standards](../typescript-standards/readme.md)
- [No Negatives](../08-coding-guidelines/coding-guidelines/no-negatives.md)
- [Cyclomatic Complexity](../08-coding-guidelines/coding-guidelines/cyclomatic-complexity.md)

*Code Quality Improvement v1.1.0 — 2026-03-31*
