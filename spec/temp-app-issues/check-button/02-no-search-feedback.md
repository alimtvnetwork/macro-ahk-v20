# Issue #25: Check Button Skips Workspace Detection & No UI Feedback

## Issue ID
`CHECK-BTN-NO-SEARCH-v7.11`

## Date
2026-02-25

## Severity
**Medium** — Manual Check button fails to detect workspace when credits aren't loaded yet; no visual feedback during search.

---

## Symptom

Clicking the **Check** button in the MacroLoop controller either:
1. Shows no "Searching..." feedback — the user doesn't know if anything is happening.
2. Defaults to P01 (first workspace) instead of detecting the actual workspace via XPath.
3. Skips workspace detection entirely when `perWorkspace` is empty (first load / no credits fetched yet).

## Root Cause

Three problems in `runCheck()`:

### 1. No UI Feedback
The function logs to the activity log but never updates the visible status bar. The user sees no indication that a workspace search is in progress.

### 2. Fire-and-Forget Credit Fetch
When `perWs.length === 0` (no workspaces loaded), the code calls `fetchLoopCredits()` without awaiting it, then immediately calls `continueCheck()`. Since `fetchLoopCredits` is async, the workspace list is still empty when `continueCheck` runs — workspace detection is effectively skipped.

```javascript
// BUG: fetchLoopCredits is async but not awaited
} else {
  log('Step 1 skipped: no workspaces loaded — fetching credits first', 'warn');
  fetchLoopCredits();       // ← fire-and-forget
  continueCheck();          // ← runs immediately, perWs still empty
}
```

### 3. No Workspace Detection After Credit Fetch
Even if `fetchLoopCredits` were awaited, the `else` branch never calls `detectWorkspaceViaProjectDialog` or `autoDetectLoopCurrentWorkspace` — it just skips to `continueCheck()` (progress bar check only).

## Fix (v7.11.3)

1. **Add UI feedback**: Set status bar to "🔍 Searching for workspace..." before starting detection.
2. **Make credit fetch awaitable**: Convert `fetchLoopCredits` path to wait for completion, then retry workspace detection with the freshly loaded `perWs`.
3. **Always attempt workspace detection**: After credits are loaded, call `detectWorkspaceViaProjectDialog` to find the workspace via XPath.

## Files Changed

| File | Change |
|------|--------|
| `macro-looping.js` | Rewrote `runCheck()` to show search feedback, await credit fetch, and always attempt workspace detection |

## Related Issues
- [Issue #24: Workspace State Clobber](../24-macro-loop-workspace-name-clobber-on-cycle.md) — Same `perWs[0]` default pattern
- [v7.11.1 Workspace Detection Fix](../../.lovable/memory/workflow/completed/07-workspace-detection-overhaul.md) — Tier 1 cookie auth fix
