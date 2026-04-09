# Issue #26: Check Button Does Not Update Workspace Name

**Version:** v7.11.3
**Severity:** High
**Component:** `macro-looping.js` → `runCheck()` / `detectWorkspaceViaProjectDialog()`
**Status:** Fixed in v7.11.4

---

## Symptom

When clicking the **Check** button manually:
1. The workspace name in the header/status bar is **NOT updated** — it keeps showing the old/stale workspace name
2. Credit numbers remain stale (tied to old workspace)
3. Progress bar detection works correctly (reports "NOT FOUND" as expected)
4. Console shows `Workspace dropdown populated: 160 workspaces` confirming data is loaded, but no workspace update log

## Root Cause Analysis

**Two cascading failures prevent workspace re-detection on manual Check:**

### Failure 1: Guard blocks update when workspace already set (v7.11.2 regression)

Issue #24 (v7.11.2) added guards to all three fallback paths in `detectWorkspaceViaProjectDialog()`:
```javascript
if (!state.workspaceName) {
  state.workspaceName = perWs[0].fullName || perWs[0].name;
} else {
  log(fn + ': Keeping existing workspace: ' + state.workspaceName, 'warn');
}
```

This correctly prevents **automatic cycle** clobbering. However, when the **manual Check** button is pressed, the user explicitly wants a fresh re-detection. The guard treats manual Check the same as an auto-cycle — if XPath matching fails for any reason, the stale name is preserved instead of being refreshed.

### Failure 2: Dialog state race — click closes instead of opens

When the project dialog happens to already be open (e.g., user was browsing), the detection code checks:
```javascript
var isExpanded = btn.getAttribute('aria-expanded') === 'true';
if (!isExpanded) { reactClick(btn); }  // click to open
else { /* "already open" — skip click */ }
```

If the dialog is in a transitional state or was left open by a prior Check, the XPath polling may find stale DOM nodes that don't match any workspace name. Combined with Failure 1's guard, the workspace is never updated.

### Failure 3: No forced refresh of `loopCreditState.currentWs`

Even when workspace XPath detection succeeds, `syncCreditStateFromApi()` reads from `loopCreditState.currentWs`. If this wasn't updated (due to guard blocking), the credit numbers shown in the status bar remain from the old workspace.

## Fix (v7.11.4)

### Change 1: Save & clear workspace for forced re-detection in `runCheck()`
```javascript
// In runCheck(), before calling detectWorkspaceViaProjectDialog:
var previousWsName = state.workspaceName;
state.workspaceName = '';  // Clear to bypass guard — force fresh detection
```

### Change 2: Restore on total failure
```javascript
// After detection completes, if still empty → restore backup
if (!state.workspaceName && previousWsName) {
  state.workspaceName = previousWsName;
  log('Restored previous workspace (detection failed): ' + previousWsName, 'warn');
}
```

### Change 3: Force dialog close-then-reopen for clean state
```javascript
// If dialog is already open, close it first, then reopen
if (isExpanded) {
  reactClick(btn);  // close
  // wait, then reopen
}
```

## Files Changed
- `marco-script-ahk-v7.latest/macro-looping.js`
- `marco-script-ahk-v7.latest/specs/changelog.md`

## Testing
1. Inject MacroLoop controller
2. Navigate to a workspace (e.g., P05)
3. Click Check — verify header shows correct workspace name
4. Navigate to a different workspace (e.g., P10)
5. Click Check again — verify header updates to P10
6. Verify credit numbers match the detected workspace
