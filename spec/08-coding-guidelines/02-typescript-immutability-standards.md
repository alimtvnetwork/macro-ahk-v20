# TypeScript Immutability & State Management Standards

> **Version**: 1.0.0  
> **Last updated**: 2026-03-31  
> **Scope**: All TypeScript code (macro-controller, chrome-extension, SDK, standalone scripts)

---

## Purpose

This document defines strict rules for state management, data flow, and iteration patterns in TypeScript. These rules prevent a class of bugs caused by mutable shared state, untracked side effects, and brittle imperative patterns.

---

## Rule CQ11 — No Mutable Module-Level State (CRITICAL)

**Severity**: 🔴 Critical / Blocking

Module-level `let` variables are **prohibited**. They create hidden shared mutable state that is:
- Impossible to test in isolation
- Prone to race conditions in async code
- Invisible to callers (action at a distance)

### ❌ Forbidden

```typescript
// file: auth-recovery.ts
let _authRecoveryInFlight = false;
let _authRecoveryWaiters: Array<(token: string) => void> = [];

export function recoverAuthOnce(): Promise<string> {
  _authRecoveryInFlight = true;  // mutating module state — WHO ELSE READS THIS?
  _authRecoveryWaiters.push(resolve);  // mutating shared array
  // ...
}
```

### ✅ Required — Class Encapsulation

```typescript
export class AuthRecoveryManager {
  private isRecoveryInFlight = false;
  private readonly waiters: Array<(token: string) => void> = [];
  private readonly timerMap = new Map<(token: string) => void, ReturnType<typeof setTimeout>>();

  recoverOnce(): Promise<string> {
    // state is scoped, controlled, testable
  }
}
```

### ✅ Alternative — Immutable Data Flow (for stateless transforms)

```typescript
interface RecoveryState {
  readonly isInFlight: boolean;
  readonly waiters: ReadonlyArray<(token: string) => void>;
}

function addWaiter(
  state: RecoveryState,
  waiter: (token: string) => void,
): RecoveryState {
  return {
    ...state,
    waiters: [...state.waiters, waiter],
  };
}
```

---

## Rule CQ12 — Immutable Data Flow (CRITICAL)

**Severity**: 🔴 Critical / Blocking

Never mutate arrays, maps, or objects that are shared across function boundaries. Instead:

1. **Pass data in** as function parameters
2. **Return new data** as the result
3. Let the **caller** decide what to do with the result

### ❌ Forbidden

```typescript
const errors: ErrorEntry[] = [];

function recordError(msg: string): void {
  errors.push({ msg, time: Date.now() });  // mutating shared array
  if (errors.length > 50) errors.splice(0, errors.length - 50);  // mutating in place
}
```

### ✅ Required

```typescript
function recordError(
  errors: ReadonlyArray<ErrorEntry>,
  msg: string,
): ErrorEntry[] {
  const updated = [...errors, { msg, time: Date.now() }];
  const isOverLimit = updated.length > 50;

  return isOverLimit ? updated.slice(-50) : updated;
}
```

---

## Rule CQ13 — for-of Over C-Style for Loops

**Severity**: 🟡 High

Always use `for (const item of array)` instead of index-based `for (let i = 0; ...)`.

### ❌ Forbidden

```typescript
for (let i = 0; i < waiters.length; i++) {
  const waiter = waiters[i];
  waiter(token);
}
```

### ✅ Required

```typescript
for (const waiter of waiters) {
  waiter(token);
}
```

**Exception**: When you genuinely need the index (e.g., parallel array correlation), use `entries()`:

```typescript
for (const [index, waiter] of waiters.entries()) {
  // ...
}
```

**Exception**: Performance-critical hot paths with benchmarks proving `for-of` is slower (rare in modern V8).

---

## Rule CQ14 — Curly Braces on All if/else

**Severity**: 🟡 High

Every `if`, `else if`, `else` must use `{ }` block syntax, even for single statements. Add a blank line between consecutive `if` blocks.

### ❌ Forbidden

```typescript
if (token) return token;
if (idx !== -1) _waiters.splice(idx, 1);
```

### ✅ Required

```typescript
if (token) {
  return token;
}

if (idx !== -1) {
  _waiters.splice(idx, 1);
}
```

---

## Rule CQ15 — Newline Before Return

**Severity**: 🟡 High

Every `return` statement must be preceded by a blank line, unless it is the **only** statement in the block.

### ❌ Forbidden

```typescript
function getToken(): string {
  const token = resolveToken();
  return token;
}
```

### ✅ Required

```typescript
function getToken(): string {
  const token = resolveToken();

  return token;
}
```

### ✅ OK — Single statement

```typescript
function getToken(): string {
  return resolveToken();
}
```

---

## Rule CQ16 — No Nested Function Definitions

**Severity**: 🟡 High

Do not define named functions inside other functions. This creates closures over mutable state that are hard to test and reason about.

### ❌ Forbidden

```typescript
export function recoverAuthOnce(): Promise<string> {
  return new Promise(function (resolve) {
    function finishRecovery(token: string): void {  // nested function
      // ...
    }
    // ...
  });
}
```

### ✅ Required — Extract to module scope or class method

```typescript
function finishRecovery(state: RecoveryState, token: string): RecoveryState {
  // pure function at module scope
}

export function recoverAuthOnce(): Promise<string> {
  // calls finishRecovery(state, token)
}
```

---

## Rule CQ17 — Class Encapsulation for Stateful Modules

**Severity**: 🟡 High

When a module requires mutable state (flags, arrays, maps, timers, counters), it **must** be wrapped in a class.

### ❌ Forbidden — "Setter function" pattern

```typescript
let _callback: ((ok: boolean) => void) | null = null;

export function setCallback(fn: (ok: boolean) => void): void {
  _callback = fn;
}

export function doWork(): void {
  if (_callback) { _callback(true); }
}
```

### ✅ Required — Class with private state

```typescript
export class WorkRunner {
  private callback: ((ok: boolean) => void) | null = null;

  setCallback(fn: (ok: boolean) => void): void {
    this.callback = fn;
  }

  doWork(): void {
    if (this.callback) {
      this.callback(true);
    }
  }
}
```

---

## Rule CQ18 — Retry/Timeout as SDK Utilities

**Severity**: 🟡 High

Never implement retry logic, polling, or concurrency locks inline in business code. Extract to reusable utilities:

### ❌ Forbidden — Inline retry with setTimeout

```typescript
function recoverAuth(): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _waiters.splice(idx, 1);  // cleanup + retry mixed with business logic
      resolve(fallback());
    }, 10000);
    _waiters.push(resolve);
    _timers.set(resolve, timer);
  });
}
```

### ✅ Required — SDK utility

```typescript
// In SDK or shared utilities
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> { ... }
function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> { ... }
function withConcurrencyLock<T>(key: string, fn: () => Promise<T>): Promise<T> { ... }

// In business code — clean and declarative
async function recoverAuth(): Promise<string> {
  return withConcurrencyLock('auth-recovery', async () => {
    return withTimeout(refreshFromBestSource(), 10000, '');
  });
}
```

---

## Performance Considerations

| Concern | Answer |
|---------|--------|
| Class instantiation overhead? | Negligible — V8 optimizes classes better than closure-captured `let` variables. Classes have hidden class optimization. |
| Immutable spread `[...arr, item]` cost? | For arrays < 10,000 elements, immutable spread is fast. Auth waiters never exceed ~10 items. |
| `for-of` vs `for (let i)` speed? | Identical in modern V8/SpiderMonkey. `for-of` compiles to the same bytecode for arrays. |
| Nested functions vs module-scope? | Module-scope functions are allocated once. Nested functions are re-allocated on every call. Module-scope is **faster**. |

---

## Codebase Audit Checklist

When touching any file, check for:

- [ ] No `let` at module scope (CQ11)
- [ ] No `.push()` / `.splice()` / `.pop()` on module-level arrays (CQ12)
- [ ] No `for (let i = 0; ...)` loops (CQ13)
- [ ] All `if` blocks have `{ }` (CQ14)
- [ ] Blank line before `return` (CQ15)
- [ ] No `function` definitions inside other functions (CQ16)
- [ ] Stateful modules use classes (CQ17)
- [ ] No inline retry/timeout/lock logic (CQ18)

---

## Cross-References

- [Code Quality Improvement (CQ1–CQ10)](01-code-quality-improvement.md)
- [Naming Conventions](../07-chrome-extension/coding-guidelines/01-naming-conventions.md)
- [Function Standards](../07-chrome-extension/coding-guidelines/02-function-standards.md)
- [DRY Principles](coding-guidelines/dry-principles.md)
- [Cyclomatic Complexity](coding-guidelines/cyclomatic-complexity.md)
- [Strict Typing](coding-guidelines/strict-typing.md)

*TypeScript Immutability Standards v1.0.0 — 2026-03-31*
