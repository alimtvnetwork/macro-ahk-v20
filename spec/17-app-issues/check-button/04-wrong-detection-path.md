# Issue #28: Check Button Uses Wrong Detection Path

**Version:** v7.12.0–v7.13.0
**Severity:** High
**Component:** `macro-looping.js` → `runCheck()`
**Status:** Fixed in v7.14.0

---

## Symptom

When clicking the **Check** button:
1. Workspace defaults to first workspace (P01) instead of detecting actual workspace
2. Credit numbers reflect wrong workspace
3. Has persisted across multiple fix attempts (v7.11.3, v7.11.4, v7.12.0, v7.13.0)

## Root Cause

**`runCheck()` was calling the wrong detection function.** The Check button's purpose is simple:

1. Click the Project Button (XPath)
2. Read the workspace name from the dialog (XPath)
3. Update `state.workspaceName`

Instead, various versions introduced unnecessary complexity:

| Version | What runCheck() called | Problem |
|---------|----------------------|---------|
| v7.11.3 | `detectWorkspaceViaProjectDialog` (Tier 2) | Correct function, but fire-and-forget credit fetch |
| v7.11.4 | `detectWorkspaceViaProjectDialog` (Tier 2) | Added clear/restore but XPath still fragile without retries |
| v7.12.0 | `detectWorkspaceViaProjectDialog` (Tier 2) | Added button retry, but still Tier 2 only |
| v7.13.0 | `autoDetectLoopCurrentWorkspace` (Tier 1 API + Tier 2) | **Wrong**: added Tier 1 `POST mark-viewed` API call which is unnecessary and unreliable for manual Check. The API call (`workspaceFromApi`) should NOT be used — XPath is the correct and only needed approach for the Check button. |

### Why Tier 1 API is wrong for Check

The `POST /projects/{id}/mark-viewed` API call:
- Returns `workspace_id` which requires `wsById` dictionary lookup
- May return empty body or stale data
- Adds network dependency for what should be a pure DOM operation
- Sets `workspaceFromApi = true` which blocks future DOM updates

The Check button should **only** do what the user can see: click the project button, read the workspace name from the dialog, done.

## Fix (v7.14.0)

### Change 1: XPath-only detection in `runCheck()`
```javascript
// Call detectWorkspaceViaProjectDialog directly — NO Tier 1 API
function doXPathDetect(wsList) {
  return detectWorkspaceViaProjectDialog('runCheck', wsList).then(function() {
    restoreOnFailure();
    // v7.14.0: Do NOT set workspaceFromApi — this is a pure DOM operation
    state.workspaceFromApi = false;
    syncCreditStateFromApi();
    updateUI();
  });
}
```

### Change 2: Removed `workspaceFromApi = true` from XPath detection
`detectWorkspaceViaProjectDialog()` previously set `state.workspaceFromApi = true` on successful match (line 924). This was wrong — it's a DOM operation, not an API detection. The flag blocked future DOM-based workspace updates (MutationObserver, nav XPath, auto-discovery). Removed the flag from the shared function; only `autoDetectLoopCurrentWorkspace` (Tier 1 API) sets it.

### Change 3: Clear 4-step logging in `runCheck()`
Previous logging used vague "Step 1" / "Step 2" labels. Now logs:
- `Step 1: Opening Project Dialog...`
- `Step 2 complete: ✅ Workspace found = "..."` (after all XPath nodes checked)
- `Step 3: Checking Progress Bar...`
- `Step 4: Updating UI...`

### Change 4: Loop interval increased to 100s
Default `LoopIntervalMs` changed from 50000 to 100000 in `config.ini`.

## Files Changed
- `marco-script-ahk-v7.latest/macro-looping.js` — `runCheck()` rewritten with XPath-only + 4-step logging; `detectWorkspaceViaProjectDialog()` no longer sets `workspaceFromApi`
- `marco-script-ahk-v7.latest/config.ini` — `LoopIntervalMs=100000`, `ScriptVersion=7.14`
- `marco-script-ahk-v7.latest/specs/changelog.md`

## Testing
1. Inject MacroLoop controller
2. Navigate to workspace P05
3. Click Check — verify 4-step logs appear in console
4. Verify no `mark-viewed` API call in Network tab during Check
5. Verify `workspaceFromApi` is `false` after Check (`__loopState().workspaceFromApi`)
6. Navigate to workspace P10
7. Click Check — verify workspace updates to P10
