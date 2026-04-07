# Issue: Authentication Failure Causes UI Freeze and Retry Storm

**Severity**: Critical (P0)
**Status**: FIXED (v7.39)
**Date**: 2026-03-21
**Affected Files**: `credit-fetch.ts`, `loop-engine.ts`, `macro-looping.ts`, `auth.ts`, `toast.ts`

---

## Symptoms

1. UI becomes unresponsive after authentication errors (401/403)
2. Multiple toast notifications stack on screen
3. Screen appears "frozen" — user cannot interact with the page
4. Repeated API calls flood the server
5. The error compounds: each retry path triggers its own retry, creating exponential calls

---

## Root Cause Analysis

### RCA-1: Recursive Retry Without Concurrency Guard

**Location**: `credit-fetch.ts` lines 137-143 and 212-217

```
fetchLoopCredits() → 401 → invalidate token → fetchLoopCredits(true)   [sync recursion]
fetchLoopCreditsAsync() → 401 → fetchLoopCreditsAsync(true)            [promise chain recursion]
```

**Problem**: On 401/403, both `fetchLoopCredits` and `fetchLoopCreditsAsync` call themselves recursively with `isRetry=true`. If the retry also fails (which it will if no valid token exists), the `.catch()` in the caller (`loadWorkspacesOnStartup`) triggers a *second* attempt with `setTimeout(1000)`. This creates a chain:

```
Startup: loadWorkspacesOnStartup(1)
  → fetchLoopCreditsAsync(false)
    → 401 → fetchLoopCreditsAsync(true)   [inner retry]
      → 401 → throws
  → catch → setTimeout(1000) → loadWorkspacesOnStartup(2)
    → fetchLoopCreditsAsync(false)
      → 401 → fetchLoopCreditsAsync(true)  [inner retry again]
```

**Total API calls on double failure**: 4 requests in ~1.2 seconds (2 per attempt × 2 attempts).

### RCA-2: Parallel Retry Paths Fire Simultaneously

**Location**: `loop-engine.ts` lines 391-408 and `macro-looping.ts` lines 3984-4005

During loop execution, `runCheck()` (line 248) and `FETCH_CREDITS` (line 248) both fire. Both independently hit the API with the same expired token. Both independently trigger their own 401 retry flows:

```
startLoop()
  → runCheck() → fetchLoopCreditsAsync() → 401 → retry
  → FETCH_CREDITS → fetchLoopCredits() → 401 → retry
```

**Total API calls**: Up to 4 simultaneous requests, all with invalid tokens, all triggering toasts.

### RCA-3: Toast Accumulation Creates Perceived Freeze

**Location**: `toast.ts` lines 56-174, `credit-fetch.ts` lines 141, 216, `loop-engine.ts` line 396

Each retry shows a toast: `'Auth 401 — token "xxx" expired, retrying with fallback...'`. With 4+ retry calls, 4+ toasts stack in rapid succession. Combined with the error toast's `stopLoop` behavior (line 166-171), this creates:

- Multiple overlapping toasts
- Loop stop triggered, then loop start re-triggered
- Visual chaos that feels like a freeze

### RCA-4: No Global In-Flight Guard

There is no flag like `isAuthRecoveryInProgress` to prevent multiple code paths from attempting token recovery simultaneously. Both `refreshBearerTokenFromBestSource` calls (from different callers) hit the extension bridge concurrently, creating race conditions on `localStorage` writes.

### RCA-5: `markBearerTokenExpired` Is a No-Op

**Location**: `auth.ts` lines 226-228

```typescript
export function markBearerTokenExpired(controller: string): void {
  log('[' + controller + '] Bearer token expired...', 'warn');
}
```

This function **only logs** — it does NOT actually invalidate the token. So `resolveToken()` continues returning the same expired token on subsequent calls unless `invalidateSessionBridgeKey` happens to remove it from localStorage. If the token came from cookies, it's never invalidated.

---

## Impact Analysis

| Impact | Description |
|--------|-------------|
| **UX** | User sees frozen screen, cannot dismiss errors, must reload page |
| **Server** | 4-8 unnecessary API calls per failure event |
| **State** | Race conditions corrupt token storage |
| **Loop** | Error guard stops loop, but user has no clear path to recovery |

---

## Fix Strategy

### Fix 1: Global Auth Recovery Lock (Prevents RCA-1, RCA-2, RCA-4)

Add a module-level flag in `auth.ts`:

```typescript
let _authRecoveryInFlight = false;

export async function recoverAuthOnce(): Promise<string> {
  if (_authRecoveryInFlight) {
    // Another recovery is already running — wait for it
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (!_authRecoveryInFlight) {
          clearInterval(check);
          resolve(resolveToken());
        }
      }, 200);
      // Safety timeout: 8s max wait
      setTimeout(() => { clearInterval(check); resolve(''); }, 8000);
    });
  }

  _authRecoveryInFlight = true;
  try {
    // Step 1: Try session cookie (synchronous, fast)
    const cookieToken = getBearerTokenFromCookie();
    if (cookieToken) {
      persistResolvedBearerToken(cookieToken);
      setLastTokenSource('cookie[recovery]');
      updateAuthBadge(true, 'cookie[recovery]');
      return cookieToken;
    }

    // Step 2: Try extension bridge (async, 2.5s timeout)
    return await new Promise<string>(resolve => {
      refreshBearerTokenFromBestSource((token, source) => {
        if (token) {
          setLastTokenSource(source);
          updateAuthBadge(true, source);
        }
        resolve(token);
      });
    });
  } finally {
    _authRecoveryInFlight = false;
  }
}
```

### Fix 2: Single Retry with Delay (Prevents RCA-1)

Replace recursive self-calls in `credit-fetch.ts` with controlled single retry:

```typescript
export async function fetchLoopCreditsAsync(isRetry?: boolean): Promise<void> {
  // ... fetch logic ...
  // On 401/403:
  if ((resp.status === 401 || resp.status === 403) && !isRetry) {
    markBearerTokenExpired('credit-fetch');
    invalidateSessionBridgeKey(token);
    log('Auth failed — attempting recovery before retry...', 'warn');
    showToast('Auth failed — recovering session...', 'warn');

    // Wait 2.5s, then recover, then retry ONCE
    await delay(2500);
    const newToken = await recoverAuthOnce();
    if (!newToken) {
      showToast('Authentication recovery failed. Please re-login.', 'error', { noStop: true });
      throw new Error('AUTH_RECOVERY_FAILED');
    }
    return fetchLoopCreditsAsync(true);  // single retry
  }

  // On retry also failing — do NOT recurse again
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status);
  }
}
```

### Fix 3: Startup Max-Once Retry (Prevents RCA-2)

In `macro-looping.ts`, reduce `loadWorkspacesOnStartup` to a single attempt with recovery:

```typescript
async function loadWorkspacesOnStartup() {
  try {
    await fetchLoopCreditsAsync(false);
    // ... success path (detect workspace, updateUI) ...
  } catch (err) {
    log('Startup: workspace load failed — ' + err.message, 'warn');
    showToast('Could not load workspaces — click Credits to retry', 'warn', { noStop: true });
    updateUI();
    // NO automatic retry — user clicks Credits manually
  }
}
```

### Fix 4: Toast Deduplication (Prevents RCA-3)

Add message dedup to `showToast`:

```typescript
const _recentToasts: Map<string, number> = new Map();
const TOAST_DEDUP_MS = 5000;

export function showToast(message: string, level?: string, opts?: ToastOpts): void {
  const dedupeKey = (level || 'error') + ':' + message;
  const lastShown = _recentToasts.get(dedupeKey) || 0;
  if (Date.now() - lastShown < TOAST_DEDUP_MS) {
    log('[Toast/dedup] Suppressed duplicate: ' + message, 'debug');
    return;
  }
  _recentToasts.set(dedupeKey, Date.now());
  // ... rest of existing logic ...
}
```

### Fix 5: Make `markBearerTokenExpired` Actually Invalidate (Prevents RCA-5)

```typescript
export function markBearerTokenExpired(controller: string): void {
  log('[' + controller + '] Bearer token expired (401/403) — clearing cached tokens', 'warn');
  try {
    localStorage.removeItem('marco_bearer_token');
    // Don't remove session bridge keys here — invalidateSessionBridgeKey handles those
  } catch (_e) { /* ignore */ }
  updateAuthBadge(false, 'expired');
}
```

---

## Corrected Execution Flow

```
[API Call: Load Workspaces]
      |
      v
[HTTP 401/403?] --No--> [Parse Response] --> [UpdateUI] --> Done
      |
      Yes
      |
      v
[Is Recovery Already In Flight?] --Yes--> [Wait for it] --> [Use recovered token]
      |
      No
      |
      v
[Set Recovery Lock]
      |
      v
[Step 1: Read Session Cookie]
      |
      v
[Token Found?] --Yes--> [Persist + Retry Once] --> Done
      |
      No
      |
      v
[Step 2: Extension Bridge (2.5s timeout)]
      |
      v
[Token Found?] --Yes--> [Persist + Retry Once] --> Done
      |
      No
      |
      v
[Show Error Toast (non-blocking, dismissible)]
[Release Recovery Lock]
[Do NOT retry further — user must re-login or click Credits]
```

---

## Implementation Plan

| Step | Description | File(s) | Risk |
|------|-------------|---------|------|
| 1 | Add `recoverAuthOnce()` with lock | `auth.ts` | Low |
| 2 | Add toast deduplication | `toast.ts` | Low |
| 3 | Replace recursive retries in `fetchLoopCreditsAsync` | `credit-fetch.ts` | Medium |
| 4 | Replace recursive retries in `fetchLoopCredits` | `credit-fetch.ts` | Medium |
| 5 | Simplify `loadWorkspacesOnStartup` (1 attempt + recovery) | `macro-looping.ts` | Medium |
| 6 | Fix `markBearerTokenExpired` to actually invalidate | `auth.ts` | Low |
| 7 | Add concurrency guard to loop-engine cycle fetch | `loop-engine.ts` | Medium |
| 8 | Verify with expired token scenario | Manual test | — |

---

## Non-Blocking Toast Rules

1. Toast container uses `pointer-events: none` on wrapper, `pointer-events: auto` on individual toasts — **this is already correct** (line 74, 79 of `toast.ts`)
2. No modal overlay is created by the toast system — **already correct**
3. Auth-related toasts should use `{ noStop: true }` to avoid stopping the loop for non-fatal auth warnings
4. Maximum 1 auth-related toast visible at a time (via dedup)

---

## Acceptance Criteria

- [ ] UI never freezes on auth failure
- [ ] Maximum 2 API calls per failure event (original + 1 retry after recovery)
- [ ] Maximum 1 auth-related toast visible at a time
- [ ] Token recovery attempts session cookie before extension bridge
- [ ] No recursive `fetchLoopCredits*` self-calls
- [ ] `markBearerTokenExpired` actually clears cached token
- [ ] Recovery lock prevents parallel recovery attempts
- [ ] User can always dismiss toasts and interact with UI

---

## References

- `spec/10-macro-controller/ts-migration-v2/01-initialization-fix.md` — startup flow
- `memory/auth/session-token-resolution` — token resolution priority
- `memory/features/macro-controller/error-handling-v2` — toast error guard
