# Issue #06: Workspace Name Overwritten by DOM Observer

**Version**: v7.9.20 → v7.9.22
**Severity**: High — Status bar always shows wrong workspace (P01 instead of actual)
**Status**: Fixed in v7.9.22

---

## Summary

The MacroLoop status bar workspace name (yellow text) consistently displayed the first workspace (P01) instead of the project's actual workspace, despite the `POST /projects/{id}/mark-viewed` API correctly returning the right `workspace_id`.

---

## Root Cause Analysis (RCA)

### Primary Cause: `workspaceFromApi` Guard Never Activated

The `state.workspaceFromApi` flag was introduced in v7.9.16 as a guard to prevent DOM observers from overwriting the API-detected workspace name. However:

1. **The flag was declared** (`state.workspaceFromApi = false` at initialization)
2. **But never set to `true`** in any code path — not in `autoDetectLoopCurrentWorkspace`, not in `detectWorkspaceFromDom`, not in `moveToWorkspace`
3. **And never checked** by any of the 4 DOM-based workspace setter paths

This meant the DOM MutationObserver (which watches the Lovable nav sidebar) would freely overwrite `state.workspaceName` with whatever text it found in the nav element. The nav element typically shows the first workspace name.

### Execution Timeline (Race Condition)

```
T=0.0s  Script injects, observer starts watching nav element
T=0.5s  Nav element text available → observer reads "P01 D2v2..." 
        → isKnownWorkspaceName? perWs is empty → SKIP (blocked by v7.9.18)
T=2.0s  fetchLoopCredits() fires → GET /user/workspaces  
T=2.5s  parseLoopApiResponse() → builds perWs, wsById
T=2.5s  Observer fires again (perWs now populated) → reads "P01 D2v2..."
        → isKnownWorkspaceName("P01 D2v2...")? YES (it's a real workspace!)
        → state.workspaceFromApi? false (never set!) → OVERWRITES to P01
T=2.6s  autoDetectLoopCurrentWorkspace() → POST mark-viewed → gets correct workspace_id
T=3.0s  Matched in wsById → sets state.workspaceName to correct workspace
        → But observer might fire AGAIN and overwrite!
```

The race between the async mark-viewed API call and the synchronous MutationObserver made the result timing-dependent. On most page loads, the observer won.

### Secondary Cause: Insufficient Diagnostic Logging

The mark-viewed response was parsed but not logged in full. When the workspace_id lookup failed (e.g., due to key format mismatch), the log only showed "not in wsById" without listing the available keys, making remote debugging impossible.

---

## Fix Description (v7.9.22)

### 1. Activated `workspaceFromApi` Guard

Set `state.workspaceFromApi = true` in all authoritative detection paths:
- `autoDetectLoopCurrentWorkspace()` — after successful mark-viewed → wsById match
- `detectWorkspaceFromDom()` — all match paths (exact, partial)
- `moveToWorkspace()` — after successful PUT move

### 2. Added Guard Checks to All 4 DOM Setter Paths

| Path | Location | Guard Added |
|------|----------|-------------|
| `fetchWorkspaceName()` | XPath-based reader | Check `state.workspaceFromApi` before setting |
| `fetchWorkspaceNameFromNav()` | Nav element reader | Check + early return `true` |
| Observer init | `startWorkspaceObserver()` initial read | Check before setting |
| MutationObserver callback | Real-time nav text change | Check + early return |

### 3. Hardened mark-viewed Response Parsing

```javascript
// Try multiple paths to find workspace_id
var wsId = data.workspace_id 
  || (data.project && data.project.workspace_id) 
  || data.workspaceId 
  || '';
```

### 4. Added Comprehensive Diagnostics

- Raw JSON response dump (first 400 chars) in activity log
- wsById keys listed before and on failed lookup
- Response object keys listed when workspace_id is missing
- `window.__loopDiag()` function for manual state inspection

---

## Iterations History

| Version | Change | Result |
|---------|--------|--------|
| v7.9.16 | Defined `workspaceFromApi` flag + `isKnownWorkspaceName` validation | Flag declared but never used; DOM observer still overwrites |
| v7.9.19 | Added DOM fallback detection, stopped blind perWs[0] default | Improved fallback chain but observer race remained |
| v7.9.20 | Switched to POST mark-viewed, added wsById O(1) lookup | Correct API call added but result overwritten by observer |
| v7.9.21 | Set `workspaceFromApi = true` after API match, added DOM guards | Should have fixed it but response parsing may have issues |
| **v7.9.22** | Added response JSON dump, multiple response paths, `__loopDiag()` | Full diagnostic visibility + robust parsing |

---

## Prevention / Non-Regression

1. **Rule**: Any guard flag (`state.xxxFromApi`) MUST be both SET and CHECKED in the same PR. A declared-but-unused flag is a latent bug.
2. **Rule**: Any async state setter (API-based) must have a guard that prevents synchronous observers from overwriting it.
3. **Test**: After deploying, run `window.__loopDiag()` in JS Executor to verify `workspaceFromApi: true` and `workspaceName` matches the expected workspace.
4. **Test**: Check activity log for `"✅ Matched via wsById"` entry to confirm mark-viewed succeeded.
