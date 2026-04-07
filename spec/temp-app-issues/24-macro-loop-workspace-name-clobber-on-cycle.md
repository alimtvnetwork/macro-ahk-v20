# Issue 24: MacroLoop Workspace Name Clobbers to P01 on Cycle

**Version**: v7.11.1
**Date**: 2026-02-25
**Status**: Resolved (v7.11.2)

---

## Issue Summary

### What happened

While the MacroLoop controller is running, the workspace name in the header (🚀/📍) and the current workspace marker reverts to the **first workspace** (e.g., P01) after a few minutes — even though the project has not actually moved. The correct workspace was displayed initially or after a manual switch, but it gets overwritten during a subsequent `runCycle()` iteration.

### Where it happened

- **Feature**: MacroLoop controller — workspace detection during automated cycles
- **File**: `marco-script-ahk-v7.latest/macro-looping.js`
- **Functions**: `detectWorkspaceViaProjectDialog()`, `closeDialogAndDefault()`

### Symptoms and impact

- Header shows wrong workspace name (P01 instead of actual, e.g., P05)
- Wrong 📍 marker in workspace list
- Credit data shown for wrong workspace
- Force move (⏫/⏬) operates relative to wrong position
- Does NOT actually move the project — only the UI display is wrong

### How it was discovered

User observation: "After running it for some time, the workspace name always changes to P01 or the first one. It does not change the workspace, but it changes the header workspace name."

---

## Root Cause Analysis

### Direct cause

In `macro-looping.js`, the Tier 2 (XPath dialog) fallback paths **unconditionally overwrite** `state.workspaceName` with `perWs[0]` when:

1. **Project button not found** (line ~785): `state.workspaceName = perWs[0].fullName || perWs[0].name;`
2. **XPath nodes don't match any known workspace** (line ~860): Same unconditional overwrite
3. **Dialog timeout — XPath not found** (line ~881 via `closeDialogAndDefault`): Same unconditional overwrite

None of these paths check whether `state.workspaceName` is already set to a valid, known workspace name.

### Contributing factors

1. **`runCycle()` resets `state.workspaceFromApi = false`** every ~50 seconds (line 2843). This is intentional (to catch external workspace changes — see Issue #20), but it means the authoritative guard is removed before every detection attempt.

2. **Tier 1 (mark-viewed API) can fail** intermittently due to session expiry, rate limiting, or network issues. When it fails, Tier 2 takes over.

3. **Tier 2 XPath is fragile** — Lovable UI updates can change the DOM structure, causing `WorkspaceNameXPath` to find zero matching nodes or the wrong elements.

4. **combo.js has the guard but macro-looping.js does not.** In `combo.js`, all equivalent fallback paths check `if (!window.__wsCurrentName)` before defaulting. This asymmetry was introduced when the detection code was copied between controllers without maintaining parity.

### Timeline of the bug (per cycle)

1. MacroLoop is running, `state.workspaceName = "P05 ..."` (correct)
2. `runCycle()` fires → resets `state.workspaceFromApi = false`
3. `autoDetectLoopCurrentWorkspace()` → Tier 1 (mark-viewed API) → **fails** (e.g., 401, network error)
4. Falls to Tier 2: `detectWorkspaceViaProjectDialog()`
5. XPath fails to find project button, or dialog doesn't render, or no XPath node matches a known workspace
6. Fallback fires: `state.workspaceName = perWs[0].fullName` → **"P01 ..."** — **WRONG**
7. `updateUI()` re-renders header/status with P01 data

### Why the previous fix (v7.9) didn't fully solve it

The v7.9 fix (spec-issues-v7.9-workspace-state-clobber.md) addressed `autoDetectCurrentWorkspace()` in the initial detection path but did NOT add guards to the Tier 2 fallback functions (`detectWorkspaceViaProjectDialog`, `closeDialogAndDefault`) which are only invoked during running cycles.

---

## Fix Description

### What was changed

Added guard checks to **all four** `perWs[0]` fallback paths in `macro-looping.js`:

1. `detectWorkspaceViaProjectDialog()` — project button not found (line ~785)
2. `detectWorkspaceViaProjectDialog()` — no XPath node matches (line ~860)
3. `closeDialogAndDefault()` — dialog timeout (line ~881)

Each now checks:
```javascript
if (!state.workspaceName) {
  state.workspaceName = perWs[0].fullName || perWs[0].name;
  loopCreditState.currentWs = perWs[0];
  log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
} else {
  log(fn + ': Keeping existing workspace: ' + state.workspaceName, 'warn');
}
```

### Why the fix resolves the root cause

When Tier 1 and Tier 2 both fail, the existing `state.workspaceName` (set by a previous successful detection or manual switch) is preserved. The controller only defaults to `perWs[0]` when there is genuinely no workspace name set at all (e.g., truly first load with all tiers failing).

### Principle applied

**"Known-Good State Wins"** — Same principle from Issue v7.9 (spec-issues-v7.9-workspace-state-clobber.md). A known-good workspace name from a prior successful detection or user action must never be overwritten by a fallback/guess.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Any code path that defaults `state.workspaceName` to `perWs[0]` (or any fallback) MUST first check whether `state.workspaceName` is already set to a valid value. Unconditional overwrites with `perWs[0]` are forbidden.

### Acceptance criteria

1. After successful initial workspace detection, running for 10+ minutes does NOT change the displayed workspace name (unless an actual move occurs)
2. If Tier 1 fails intermittently during cycles, the workspace name remains stable
3. If both Tier 1 and Tier 2 fail on first-ever load (no prior state), P01 is correctly used as last resort
4. Activity log shows "Keeping existing workspace" messages (not "Defaulted to first")

---

## Related Issues

| Issue | Relationship |
|-------|-------------|
| v7.9 Workspace State Clobber | Same root cause pattern — stale poll/fallback overwrites fresh state |
| Issue #20 (Workspace Guard Blocks Redetection) | The `workspaceFromApi = false` reset in `runCycle` is necessary but creates the window for this bug |
| Issue #23 (Wrong on Initial Load) | Fixed Tier 1 API for first load; this issue is about subsequent cycles |

---

## Done Checklist

- [x] Root cause analysis documented
- [x] Code fixed in `macro-looping.js` — all 3 fallback paths guarded
- [x] Issue write-up created
- [x] CHANGELOG updated (v7.11.2)
