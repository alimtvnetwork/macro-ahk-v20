# Check Button Issue #08 — workspaceFromApi Race & Over-Complex Detection

**Component**: `loop-engine.ts` → `runCheck()`, `workspace-detection.ts`, `credit-fetch.ts`
**Version affected**: v7.38 → v7.41
**Status**: Fixed in v7.42
**Original**: Issue #08 (Check-button series)

---

## Symptom

Clicking the **Check** button does **not** update the status line.
The UI shows `[=] Stopped | Cycles: 0` with no workspace name, even though:
- The user is on a valid project page
- The project dialog contains the correct workspace name
- The progress bar is visible/absent as expected

## Root Cause Analysis

### RCA-1: `workspaceFromApi` flag blocks XPath detection

The `autoDetectLoopCurrentWorkspace()` function (called from `fetchLoopCredits` callback)
sets `state.workspaceFromApi = true` when it matches a workspace via the `POST mark-viewed`
API (Tier 1). Once this flag is `true`, **all XPath-based detection functions** skip their
results:

- `fetchWorkspaceName()` (line 1169): `if (state.workspaceFromApi) { ... ignoring ... }`
- `fetchWorkspaceNameFromNav()` (line 1219): `if (state.workspaceFromApi) { ... ignoring ... }`
- `startWorkspaceObserver()` mutation handler (line 1386): `if (state.workspaceFromApi) { ... ignoring ... }`

**Race sequence:**
1. Credit fetch runs (startup, auto-refresh, or manual Credits button)
2. `fetchLoopCredits()` callback calls `autoDetectLoopCurrentWorkspace(token)`
3. Tier 1 API succeeds → `state.workspaceFromApi = true`
4. User clicks Check → `runCheck()` opens dialog, reads XPath nodes
5. `fetchWorkspaceName` / nav observer finds name but **skips** it because `workspaceFromApi === true`
6. Workspace name stays stale or empty

### RCA-2: `runCheck()` was over-complex

Instead of following the simple 3-step flow:
1. Click Project Button → open dialog
2. Read Workspace Name from dialog XPath
3. Check Progress Bar for credit status

`runCheck()` had complex candidate matching, ambiguous resolution, and no guarantee that
`workspaceFromApi` was cleared before AND after detection.

### RCA-3: `autoDetectLoopCurrentWorkspace` called from credit fetch

The `fetchLoopCreditsWithDetect()` wrapper passes `autoDetectLoopCurrentWorkspace` as a
callback to `fetchLoopCredits()`. This means **every credit fetch** runs Tier 1 API
detection and can set `workspaceFromApi = true`, undoing any `runCheck()` reset.

---

## Fix (v7.42)

### 1. `runCheck()` rewritten to follow exact 3-step spec flow

```
Step 1: Click Project Button XPath → open dialog
Step 2: Read Workspace Name from WORKSPACE_XPATH → update state.workspaceName
Step 3: Check PROGRESS_XPATH → update state.isIdle / state.hasFreeCredit
Always: state.workspaceFromApi = false (manual Check is XPath-authoritative)
Always: syncCreditStateFromApi() + updateUI() at end
```

### 2. `state.isManualCheck` guard flag

Set `true` during `runCheck()`, prevents `autoDetectLoopCurrentWorkspace` from
overriding `workspaceFromApi` during a manual Check.

### 3. Progress bar check always updates credit state

Regardless of whether the loop is running, the progress bar XPath check updates
`state.hasFreeCredit` and `state.isIdle`.

---

## Non-Regression Rules

| # | Rule | Anti-pattern |
|---|------|-------------|
| R1 | `runCheck()` must ONLY use XPath DOM detection | ❌ Calling `mark-viewed` API |
| R2 | `runCheck()` must set `workspaceFromApi = false` at start AND end | ❌ Leaving it true |
| R3 | `runCheck()` must follow 3-step flow: Project Btn → WS Name → Progress Bar | ❌ Skipping/reordering |
| R4 | `autoDetect` must NOT override during manual Check (`isManualCheck` guard) | ❌ Credit fetch racing |
| R5 | Progress bar check must update `state.hasFreeCredit` regardless of loop state | ❌ Skipping when stopped |
| R6 | Check button must show "⏳ Checking…" + opacity 0.6 during flight | ❌ Silent runCheck |
| R7 | Check button must reset on success AND error | ❌ Button stuck disabled |
| R8 | `checkInFlight` guard prevents double-click | ❌ No cooldown |

---

## XPaths Referenced

| Element | XPath | Config Key |
|---------|-------|------------|
| Project Button | `/html/body/div[2]/div/div[2]/nav/div/div/div/div[1]/div[1]/button` | `CONFIG.PROJECT_BUTTON_XPATH` |
| Workspace Name | `/html/body/div[6]/div/div[2]/div[1]/p` | `CONFIG.WORKSPACE_XPATH` |
| Progress Bar | `/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]` | `CONFIG.PROGRESS_XPATH` |

---

## Cross-References

- [Check Button Master Overview](01-overview.md)
- [Chrome Extension Check Button Spec](../../../spec/11-chrome-extension/60-check-button-spec.md)
- [Wrong Detection Path (Issue #28)](04-wrong-detection-path.md)
- [Guard Regression (Issue #32)](05-guard-regression.md)
- [Auth Bridge Stall (Issue #46)](07-auth-bridge-stall.md)
