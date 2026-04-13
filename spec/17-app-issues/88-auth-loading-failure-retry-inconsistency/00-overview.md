# Issue #88: Auth Loading Failure & Unauthorized Retry Logic

**Created**: 2026-04-13  
**Status**: Open  
**Priority**: P0 — Critical  
**Version**: v2.135.0  
**Diagram**: `/mnt/documents/auth-retry-inconsistencies.mmd`

---

## Issue Summary

The macro controller contains unauthorized exponential backoff retry logic and recursive retry mechanisms that were never part of the spec. These cause compounding delays, race conditions in token resolution, and the persistent "Auth failed — no token after 12s" toast. The injection pipeline spec explicitly states: **no retry**. If auth fails, the operation should fail immediately.

---

## Root Cause Analysis

### RCA-1: Exponential Backoff in loop-cycle.ts (NEVER SPECIFIED)

`handleCycleFetchError()` (line 209) implements a full exponential backoff retry system:
- `state.retryCount++` up to `state.maxRetries` (3)
- `backoffMs = 2000 * Math.pow(2, retryCount - 1)` → 2s, 4s, 8s delays
- Schedules `setTimeout(() => runCycle())` to re-execute the entire cycle
- Uses `state.__cycleRetryPending` flag to block concurrent cycles

**This was never in the spec.** The spec says: if a cycle fails, skip it and move to the next scheduled cycle. No retry, no backoff.

### RCA-2: Retry State Fields in ControllerState (NEVER SPECIFIED)

`shared-state-runtime.ts` (line 132-163) defines:
- `retryCount: 0`
- `maxRetries: 3` (hardcoded, not from config)
- `retryBackoffMs: 2000` (hardcoded)
- `lastRetryError: null`
- `__cycleRetryPending: false`

These fields exist solely to support the unauthorized retry logic. They have no spec backing.

### RCA-3: Recursive Self-Calling in credit-fetch.ts

`fetchLoopCredits()` (line 201) calls itself recursively on auth failure:
```typescript
fetchLoopCredits(true, autoDetectFn);  // recursive self-call
```

`fetchLoopCreditsAsync()` (line 294) does the same:
```typescript
return fetchLoopCreditsAsync(true);  // recursive self-call
```

While a single retry after token refresh is acceptable per the credit monitoring spec, the recursive call pattern is fragile and can stack if the auth recovery itself triggers another fetch.

### RCA-4: credit-balance.ts Also Retries Independently

`fetchCreditBalance()` (line 192) calls `recoverAuthOnce()` on 401, then recursively calls `fetchCreditBalance(wsId, true)`. This is a third independent retry path that can race with the other two.

### RCA-5: Multiple Token Recovery Paths Racing

When auth fails, up to 4 different code paths attempt token recovery simultaneously:
1. `handleCycleFetchError` → exponential backoff → `runCycle()` → `resolveToken()`
2. `handleFallbackAuthRecovery` → `recoverAuthOnce()` → `doCycleFetchWithToken(true)`
3. `handleAuthRecovery` (credit-fetch) → `getBearerToken({ force: true })`
4. `handleAsyncAuthFailure` → `getBearerToken({ force: true })`

These race against each other, causing:
- Multiple concurrent `recoverAuthOnce()` calls
- Token state corruption (one path refreshes while another reads stale)
- Compounding delays that exceed the 12s timeout

---

## Iterations History

| Date | Version | What Changed | Result |
|------|---------|-------------|--------|
| 2026-04-07 | v2.130.0 | Injection pipeline spec created, NO retry specified | Spec correct |
| 2026-04-07 | v2.131.0 | AI added exponential backoff to loop-cycle.ts | **Unauthorized** — not in spec |
| 2026-04-10 | v2.133.0 | Retry fields added to ControllerState types | **Unauthorized** — supports unauthorized retry |
| 2026-04-13 | v2.135.0 | Auth timeout errors persisting in production | Current issue |

---

## Fix Description

### Phase 1: Remove Unauthorized Retry Logic

1. **loop-cycle.ts**: Remove `handleCycleFetchError()` entirely. Replace with:
   - Log the error
   - Release cycle lock
   - Let the next scheduled cycle handle it naturally
   - Do NOT call `stopLoop()` on cycle failure — the loop continues on its interval

2. **shared-state-runtime.ts**: Remove retry fields from state:
   - `retryCount`, `maxRetries`, `retryBackoffMs`, `lastRetryError`, `__cycleRetryPending`

3. **types/config-types.ts**: Remove `RetryConfig` interface and retry fields from `ControllerState`

### Phase 2: Simplify Credit Fetch Auth Recovery

4. **credit-fetch.ts**: Keep single-retry-on-401 via `getBearerToken({ force: true })` but remove recursive self-calls. Use a sequential pattern:
   ```
   token = getBearerToken()
   response = fetch()
   if 401 → token = getBearerToken({ force: true }) → response = fetch()
   if still fails → emit error, done
   ```

5. **credit-balance.ts**: Same pattern — no recursive `fetchCreditBalance(wsId, true)`.

### Phase 3: Unify Token Resolution

6. All token consumers use `getBearerToken()` only. No direct `recoverAuthOnce()` calls except inside `getBearerToken` itself.

---

## Prevention & Non-Regression

1. **No retry logic may be added without explicit spec approval.** If a retry is needed, it must be documented in the spec first.
2. **ControllerState must not have retry fields.** Cycle failures are transient — the loop interval is the natural retry mechanism.
3. **Token recovery must be single-path.** Only `getBearerToken()` performs recovery. No module calls `recoverAuthOnce()` directly.
4. **No recursive function calls for fetch operations.** Use sequential if/else, not recursive self-invocation.

---

## TODO & Follow-ups

- [ ] Remove exponential backoff from `loop-cycle.ts`
- [ ] Remove retry state fields from `shared-state-runtime.ts` and `ControllerState` type
- [ ] Remove `RetryConfig` interface from `config-types.ts`
- [ ] Refactor `credit-fetch.ts` to sequential (non-recursive) retry pattern
- [ ] Refactor `credit-balance.ts` to sequential (non-recursive) pattern
- [ ] Remove `__cycleRetryPending` checks from `runCycle()` and `releaseCycleLock()`
- [ ] Update E2E test `e2e-13-backoff.spec.ts` — this test validates behavior that should NOT exist
- [ ] Verify auth timeout toast no longer appears on real session after fixes

---

## Done Checklist

- [x] Root cause analysis complete
- [x] Inconsistency diagram created
- [ ] Code fixes implemented
- [ ] Tests updated
- [ ] Memory updated
- [ ] Verified on real session
