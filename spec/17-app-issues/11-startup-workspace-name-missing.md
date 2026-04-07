# Issue #11 — Startup Workspace Name Missing on Controller Load

**Component**: `standalone-scripts/macro-controller/src/macro-looping.ts` (startup flow)
**Version affected**: v1.56.0
**Status**: Fixed
**Date**: 2026-03-22

---

## Symptom

When the macro controller first loads (injection), the **workspace name** is empty/missing in the status bar. The Check button works correctly and updates the workspace name as expected when clicked manually.

## Root Cause Analysis

### RCA-1: DOM Not Ready at Startup (200ms Too Early)

The startup sequence runs inside a `setTimeout(..., 200)` after injection. At 200ms:

1. The Lovable page's React app may not have fully rendered the navigation bar
2. The **Project Button** (`/html/body/div[2]/div/div[2]/nav/div/div/div/div[1]/div[1]/button`) doesn't exist in the DOM yet
3. `autoDetectLoopCurrentWorkspace()` Tier 2 (XPath dialog detection) fails because it can't find/click the project button
4. Tier 1 (API match) may also fail if the project-to-workspace mapping isn't resolved yet

### RCA-2: No Retry After Initial Failure

The original `loadWorkspacesOnStartup()` made a **single attempt** with no retry. If Tier 1 and Tier 2 both failed, `state.workspaceName` remained empty permanently until the user clicked Check manually.

### RCA-3: Check Button Works Because Page is Fully Loaded

By the time the user manually clicks Check, the page DOM is fully rendered (typically 2-5 seconds after load). The 3-step XPath protocol succeeds because all elements exist.

---

## Fix

### Delayed Retry with Backoff

Added `scheduleWorkspaceRetry(attempt)` to `loadWorkspacesOnStartup()`:

1. After initial detection completes, check if `state.workspaceName` is still empty
2. If empty, schedule retry #1 at **3 seconds** delay
3. If still empty, schedule retry #2 at **6 seconds** delay
4. Maximum 2 retries (configurable via `STARTUP_WS_MAX_RETRIES`)
5. Skip retry if workspace was already resolved (e.g., user clicked Check)
6. Reset `state.workspaceFromApi = false` before retry to allow fresh detection

### Guard: Skip If Already Resolved

Each retry checks `state.workspaceName` before running. If a manual Check or loop cycle already resolved the workspace, the retry is skipped to avoid unnecessary dialog interactions.

---

## Code References

- **Startup flow**: `macro-looping.ts` → `loadWorkspacesOnStartup()` + `scheduleWorkspaceRetry()`
- **Workspace detection**: `workspace-detection.ts` → `autoDetectLoopCurrentWorkspace()`
- **Check button (working)**: `loop-engine.ts` → `runCheck()` (3-step XPath protocol)
- **XPath protocol**: `spec/11-chrome-extension/60-check-button-spec.md`

---

## Non-Regression Rules

| # | Rule | Anti-pattern |
|---|------|-------------|
| NR-11-A | Startup workspace detection MUST have at least 1 retry with ≥3s delay | ❌ Single-attempt detection at 200ms |
| NR-11-B | Retries must check `state.workspaceName` before running to avoid redundant dialog opens | ❌ Always retrying even if workspace already resolved |
| NR-11-C | Retry must reset `workspaceFromApi = false` to allow fresh Tier 1/2 detection | ❌ Guard blocking retry from running detection |

---

## Acceptance Criteria

1. Workspace name appears in status bar within 6 seconds of controller injection
2. If page loads slowly, retry at 3s and 6s catches the workspace name
3. Check button continues to work correctly (no regression)
4. If workspace is resolved by Check before retry fires, retry is skipped

---

*Issue #11 — 2026-03-22*
