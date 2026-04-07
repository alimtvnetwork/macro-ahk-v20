# Issue #08: Post-Move Workspace Name Resets to perWs[0]

**Version**: v7.9.31 → Partially fixed in v7.9.32, **fully fixed in v7.9.34** (see Issue #09)
**Severity**: High — workspace name in controller UI becomes wrong after every move
**Date**: 2026-02-23

---

## Summary

After a successful workspace move via API (double-click, Move button, or force ⏫/⏬), the workspace name in the controller resets to the first workspace in the list (`perWs[0]`) instead of showing the target workspace.

---

## Root Cause Analysis

The v7.9.31 post-move handler ran this sequence after a successful `PUT /move-to-workspace`:

1. `state.workspaceName = targetWorkspaceName` ← **correct** (authoritative from API success)
2. `populateLoopWorkspaceDropdown()` ← correct (re-renders list with new current)
3. After 2000ms delay:
   - `autoDetectLoopCurrentWorkspace()` — opens the Project Dialog and reads `WorkspaceNameXPath`
   - `fetchLoopCredits()` — calls the API for fresh credit data

**The problem**: At the 2000ms mark, the page DOM has not yet fully reflected the workspace change. The Project Dialog still shows the **old** workspace name. The XPath detection reads this stale name, which either:
- Matches the old workspace → overwrites `state.workspaceName` back to the old name
- Fails validation → falls back to `perWs[0]`

Both paths corrupt the authoritative state that was already correctly set in step 1.

Additionally, `fetchLoopCredits()` calls `parseLoopApiResponse()`, which tries to match `state.workspaceName` against the workspace list. If XPath already corrupted the name, this match fails and `currentWs` stays null or defaults incorrectly.

---

## Fix (v7.9.32)

**Removed post-move XPath detection entirely.** The API success response is authoritative — if `PUT /move-to-workspace` returns 200, the project IS in the target workspace. No DOM verification needed.

Post-move handler now:
1. Sets `state.workspaceName = targetWorkspaceName` (authoritative)
2. Sets `state.workspaceFromApi = true` (guard flag)
3. Re-renders workspace list
4. After 2s delay: only calls `fetchLoopCredits()` to refresh credit data (which will match correctly since `state.workspaceName` is already set)

Applied to both `macro-looping.js` and `combo.js`.

---

## Additional Fixes in v7.9.32

1. **Alt+Shift+Up/Down → Alt+Up/Down**: The `Alt+Shift` combo was not registering in the browser. Changed to `Alt+Up`/`Alt+Down`.
2. **Button click animation**: Added scale pulse animation to ⏫/⏬ force move buttons for visual feedback.

---

## Prevention

- **Engineering Standard**: After a successful API mutation (move, transfer), do NOT run DOM-based verification that could overwrite the authoritative API state. Trust the API response.
- **Rule**: Post-mutation DOM reads must wait long enough for the page to reflect changes, OR be skipped entirely when the API response is sufficient.
