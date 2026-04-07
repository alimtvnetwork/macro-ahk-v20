# Issue #09: Post-Move Credit Refresh Overwrites Authoritative Workspace Name

**Version**: v7.9.32–v7.9.33 → Fixed in v7.9.34
**Severity**: High — workspace name in controller UI becomes wrong after every force move (Ctrl+Up/Down)
**Date**: 2026-02-23
**Related**: Issue #08 (same symptom, incomplete fix)

---

## Summary

After a successful workspace move via Ctrl+Up/Down (or button click), the workspace name in the controller resets to the first workspace in the list (`perWs[0]`) instead of showing the target workspace. The move itself succeeds — after ~30s the auto-refresh eventually corrects the name, but the immediate UI feedback is wrong.

---

## Root Cause Analysis

Issue #08 (v7.9.32) correctly identified that post-move XPath detection was the problem and removed it from the `moveToWorkspace()` success handler. However, the fix was **incomplete**.

The post-move handler in v7.9.32/v7.9.33 did this:

1. `state.workspaceName = targetWorkspaceName` ← **correct** (authoritative from API success)
2. `state.workspaceFromApi = true` ← **correct** (guard flag set)
3. Re-renders workspace list ← correct
4. After 2000ms delay: calls `fetchLoopCredits()` (macro) or `checkCreditsStatus('auto')` (combo)

**The problem**: Step 4 triggers the full credit-fetch pipeline:

- **macro-looping.js**: `fetchLoopCredits()` → `parseLoopApiResponse()` → `autoDetectLoopCurrentWorkspace()` → **`detectWorkspaceViaProjectDialog()`** → XPath reads stale DOM → overwrites `state.workspaceName`
- **combo.js**: `checkCreditsViaApi()` → `parseApiResponse()` → `autoDetectCurrentWorkspace()` → **`detectWorkspaceViaProjectDialogCombo()`** → XPath reads stale DOM → overwrites `window.__wsCurrentName`

The v7.9.32 fix removed the direct XPath call from the move handler, but the credit refresh **indirectly** calls the same XPath detection through the `autoDetect*` functions. These functions had no guard to check whether the workspace was already authoritatively known.

### Why XPath reads the wrong value

At the 2s mark after a move, the Project Dialog still reflects the **old** workspace. The XPath element either:
- Shows the old workspace name → which may or may not match (depending on timing)
- Fails to match → `closeDialogAndDefault()` falls back to `perWs[0]`

Both paths corrupt the state that was correctly set in step 1.

---

## Fix (v7.9.34)

Added an **authoritative guard** at the top of both auto-detect functions:

### macro-looping.js — `autoDetectLoopCurrentWorkspace()`
```javascript
// v7.9.34: GUARD — If workspace was already set authoritatively (e.g. post-move API success),
// skip XPath detection entirely. Just match the known name against the workspace list.
if (state.workspaceFromApi && state.workspaceName) {
  var matched = null;
  for (var g = 0; g < perWs.length; g++) {
    if (perWs[g].fullName === state.workspaceName || perWs[g].name === state.workspaceName) {
      matched = perWs[g];
      break;
    }
  }
  if (matched) {
    loopCreditState.currentWs = matched;
    log(fn + ': ✅ GUARD — workspace already set authoritatively (skipping XPath)', 'success');
    return Promise.resolve();
  }
  // Fall through to XPath if name doesn't match (shouldn't happen)
  state.workspaceFromApi = false;
}
```

### combo.js — `autoDetectCurrentWorkspace()`
Same pattern using `window.__wsCurrentName` instead of `state.workspaceName`.

### Why this works
- After a successful move, the guard flag is set and the workspace name matches the list → XPath is skipped
- On initial load or manual "Check" click, `workspaceFromApi` is false → XPath detection runs normally
- If the workspace name somehow doesn't match the list (edge case), the guard falls through to XPath as a safety net

---

## Prevention

1. **Engineering Standard**: Any function in the credit-refresh pipeline that can overwrite workspace state MUST check for an authoritative guard flag first. The credit pipeline exists to refresh *credit data*, not to re-detect which workspace the project is in.

2. **Rule**: `autoDetect*Workspace()` functions are for **initial detection only**. Post-mutation refreshes must treat the API response as the source of truth and only use the detect functions to match against the workspace list (not to re-read the DOM).

3. **Architecture Principle**: When fixing a bug, trace ALL call paths that reach the problematic function — not just the direct caller. The v7.9.32 fix only addressed the direct call but missed the indirect path through `fetchLoopCredits()`.

---

## Iterations

| Version | What was tried | Result |
|---------|---------------|--------|
| v7.9.32 | Removed XPath call from post-move handler directly | Partial fix — indirect path through `fetchLoopCredits` still triggered XPath |
| v7.9.33 | Changed shortcuts to Ctrl+Up/Down (unrelated to this bug) | Same bug persisted |
| v7.9.34 | Added authoritative guard to `autoDetect*` functions | ✅ Full fix — XPath skipped when workspace is already known |
