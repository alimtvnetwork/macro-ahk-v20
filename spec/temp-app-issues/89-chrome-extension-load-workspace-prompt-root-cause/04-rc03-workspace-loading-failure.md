# RC-03: Workspace Loading Failure

**Parent:** [01-overview.md](./01-overview.md)
**Status:** 🔴 Open

---

## Symptom

When the macro UI controller loads, workspaces are not populated. The header badge shows "⟳ detecting…" or remains empty.

## Prior Issues (Same Area)

This is a **recurring regression**. The following issues have previously addressed workspace loading:

| Issue | Version | Summary | Status |
|-------|---------|---------|--------|
| [#54](../54-startup-workspace-load-and-loop-button-regression.md) | v1.49.0 | Startup workspace auto-load fragile to auth timing | ✅ Fixed |
| [#84](../84-check-button-and-workspace-load-fixes.md) | v1.72.0 | `isKnownWorkspaceName()` gate blocked detection; insufficient retries | ✅ Fixed |
| [#23](../23-workspace-name-wrong-initial-load.md) | — | Wrong workspace name on initial load | — |
| [#27](../27-available-credits-wrong-and-workspace-default.md) | — | Available credits wrong + workspace default | — |

## Root Cause Analysis

### RCA-1: Token readiness race

`loadWorkspacesOnStartup()` calls `ensureTokenReady(2000)`. If the auth bridge is slow or the user hasn't logged in recently, this returns with `token = null`. The function then shows an error toast and creates the UI **without workspace data**.

**Evidence:** `startup.ts` lines 258-274.

### RCA-2: API failure chain

When token IS available, the workspace load path is:
1. `fetchLoopCreditsAsync()` — calls credit API
2. `fetchTier1Prefetch()` — calls mark-viewed API via SDK

Both require:
- Valid auth token (bearer)
- SDK `window.marco.api.workspace` to be available
- Network connectivity to the backend API

If SDK workspace API is unavailable (`startup.ts` line 378: `typeof workspaceApi.markViewed !== 'function'`), Tier 1 prefetch is skipped entirely.

### RCA-3: Retry exhaustion on slow pages

4 retries at 1.5s intervals (total 15s coverage). On very slow pages, or if the credit API consistently returns errors, all retries exhaust and workspace stays empty.

### RCA-4: UI creation timeout (5s)

If neither the success path nor retry path resolves within 5s, the timeout creates the UI without workspace data (`startup.ts` lines 108-113). This is a **correct fallback** but means the user sees an empty workspace list initially.

## Current Workspace Loading Flow

```
ensureTokenReady(2000)
  ├─ No token → error toast → create UI (empty)
  └─ Token ready →
      ├─ fetchLoopCreditsAsync() → populates loopCreditState
      ├─ fetchTier1Prefetch() → mark-viewed API
      │   ├─ SDK unavailable → skip
      │   └─ SDK available → markViewed(projectId) → workspace_id
      └─ Promise.all([credits, tier1])
          ├─ Success → resolveTier1Workspace or autoDetect
          └─ Failure → error toast → retry schedule
```

## Proposed Fix Path

1. **Add workspace loading state to UI** — show a "Loading workspaces..." indicator in the workspace list area instead of empty
2. **Extend retry window** — consider exponential backoff or event-driven retry (on token availability change)
3. **Cache last workspace** — already implemented via `workspace-cache.ts` and `getCachedWorkspaceName()`, but verify it's used as display fallback
4. **Decouple workspace from credit fetch** — workspace detection shouldn't require credit API to succeed first

## Acceptance Criteria

- [ ] Workspace name appears in header within 5s of injection under valid auth
- [ ] If workspace cannot be resolved, a clear "No workspace detected" message is shown (not empty)
- [ ] Workspace loading state is visible while fetching
- [ ] Cached workspace name is shown immediately as interim value
