# Memory: constraints/no-retry-policy
Updated: 2026-04-13

---
name: No-retry policy for controller operations
description: NEVER add retry/backoff logic to cycle, credit fetch, or auth recovery. Cycle failures are transient — the loop interval is the natural retry.
type: constraint
---

## Policy

**ABSOLUTE RULE**: No retry logic, no exponential backoff, no retryCount, no recursive self-calls in:
- `loop-cycle.ts` — if a cycle fails, log error, release lock, done. Next interval handles it.
- `credit-fetch.ts` — single sequential recovery via `getBearerToken({ force: true })` then one more API call. No recursive `fetchLoopCredits(true)`.
- `credit-balance.ts` — same sequential pattern. No recursive `fetchCreditBalance(wsId, true)`.
- `shared-state-runtime.ts` — ControllerState must NOT have `retryCount`, `maxRetries`, `retryBackoffMs`, `lastRetryError`, or `__cycleRetryPending`.

## Why

Retry logic caused:
1. Exponential delays (2s + 4s + 8s) compounding with the 12s auth timeout
2. Multiple competing token recovery paths racing and corrupting token state
3. The persistent "Auth failed — no token after 12s" toast

## Reference Files

- **Issue**: `spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md`
- **Diagram**: `standalone-scripts/macro-controller/diagrams/inconsistencies/auth-retry-inconsistencies.mmd`
- **Spec**: `spec/08-design-diagram/mermaid-design-diagram-spec/01-diagram-spec/injection-pipeline-workflow-clarification-and-correction.md`

## Correct Pattern

```typescript
// CORRECT: Sequential, fail-fast
const resp = await apiFetchWorkspaces();
if (!resp.ok && isAuthFailure(resp.status)) {
  const newToken = await getBearerToken({ force: true });
  if (!newToken) { logError(...); return; }
  const retryResp = await apiFetchWorkspaces();
  if (!retryResp.ok) { logError(...); return; }
  // process retryResp
}

// WRONG: Recursive self-call (FORBIDDEN)
// fetchLoopCredits(true);           // ← NEVER DO THIS
// fetchCreditBalance(wsId, true);   // ← NEVER DO THIS
// state.retryCount++;               // ← NEVER DO THIS
```

## Unified Auth Contract (v2.136)

All runtime auth consumers MUST use `getBearerToken()` for token resolution. No module may call `resolveToken()` or `recoverAuthOnce()` directly for operational token needs. The only allowed patterns are:

1. **Normal token read**: `const token = await getBearerToken()`
2. **One forced refresh after 401/403**: `const token = await getBearerToken({ force: true })`
3. **Cycle path**: fail this cycle immediately on auth error — no recovery, no second attempt

`resolveToken()` remains available for diagnostic/display only. `recoverAuthOnce()` is deprecated.

Files migrated in v2.136: loop-cycle, credit-fetch, credit-balance, startup, ws-move, rename-api, ws-adjacent, loop-controls, panel-header, check-button, ws-dropdown-builder, auth-diag-rows, panel-sections.
