# Issue #20: Workspace Name Stuck After External Change — Guard Blocks Re-Detection

**Status**: FIXED  
**Version**: v7.10.1  
**Severity**: High — controller shows wrong workspace indefinitely  
**Category**: Workspace Detection / State Guard  

## Symptom

MacroLoop controller header shows "P01 D2v2 Orinmax's Lovable v2" but the actual workspace (visible in the project dialog) is "P03 D62.83 Orinmax's Lovable v2". The workspace name never updates, even after 50s cycles.

## Root Cause

`autoDetectLoopCurrentWorkspace()` has a **guard clause** (v7.9.34):

```javascript
if (state.workspaceFromApi && state.workspaceName) {
  // Skip XPath detection entirely — returns immediately
  return Promise.resolve();
}
```

This guard was added to prevent the 2-second post-move credit refresh from overwriting the correct workspace name with stale DOM data (Issue #08/#09). However, it has a critical side effect:

**Once `workspaceFromApi` is set to `true`, ALL subsequent calls skip XPath detection — forever.** This includes the 50-second loop cycles and manual Check clicks. If the workspace changes externally (e.g., user manually transfers, or another controller moves the project), the guard prevents re-detection, and the controller stays stuck showing the old workspace.

## Evidence from Screenshots

- Project dialog: "P03 D62.83 Orinmax's Lovable v2" (actual workspace)
- Controller header: "P01 D2v2 Orinmax's Lovable v2" (stale cached name)
- The ✅ GUARD log confirms: "workspace already set authoritatively... (skipping XPath)"

## Fix

Reset `state.workspaceFromApi = false` before calling `autoDetectLoopCurrentWorkspace()` in three locations:

1. **`runCycle()`** — The 50s loop cycle. By the time this runs, the DOM has updated. Force fresh XPath detection.
2. **`runCheck()`** — Manual Check button. Always force fresh detection.
3. **Double-confirm** — The 2s re-check within a cycle. Also force fresh detection.

The post-move protection (Issue #08/#09) is preserved because:
- `performDirectMove` sets `workspaceFromApi = true` immediately after a successful move
- The 2-second `fetchLoopCredits()` that follows does NOT call `autoDetectLoopCurrentWorkspace` with guard reset
- By the time the next 50s cycle runs, the DOM has updated and fresh detection is correct

## Prevention

- **RULE-GUARD-1**: Time-based guards (like `workspaceFromApi`) that block detection MUST be reset on each cycle boundary. Guards that persist indefinitely are a desync risk.
- **RULE-DETECT-1**: Every 50s cycle and every manual Check MUST force fresh workspace detection via Project Dialog XPath. No cached state should persist across cycle boundaries.

## Files Changed

- `macro-looping.js` — Reset `workspaceFromApi = false` before detection in `runCycle`, `runCheck`, and double-confirm
