# Issue 04: Workspace Detection Fails — GET /projects/{id} Returns 405

**Version**: v7.9.19
**Date**: 2026-02-23
**Status**: Resolved

---

## Issue Summary

### What happened

The MacroLoop (and ComboSwitch) controller displayed **the wrong workspace** (P01 instead of P20) in the top-level status bar, and showed P01's credit data (including 🎁100 granted credits). The user was actually working in a P20 workspace project.

### Where it happened

- **Feature**: Workspace auto-detection in both controllers
- **Files**: `macro-looping.js` (`autoDetectLoopCurrentWorkspace`), `combo.js` (`autoDetectCurrentWorkspace`)
- **API Endpoint**: `GET https://api.lovable.dev/projects/{projectId}` — returns **HTTP 405 Method Not Allowed**

### Symptoms and impact

- Top-level status bar shows wrong workspace name (P01 instead of P20)
- Credit progress bar shows P01's credits (🎁100, ⚡132/289) instead of P20's
- "Double-click to move" shows "no move needed" because it thinks user is already on P01
- User cannot tell which workspace they're actually on
- **Misleading credit data** — user sees another workspace's granted credits

### How it was discovered

User observed: (1) wrong workspace name in header, (2) progress bar doesn't match expected credits, (3) console shows `HTTP 405` from project API, (4) tooltip shows P01's data when user is on P20.

---

## Root Cause Analysis

### Direct cause

The `GET /projects/{projectId}` API endpoint now returns **HTTP 405 (Method Not Allowed)**. This was the primary mechanism for detecting which workspace the current project belongs to. When this API call fails, the system fell back to using `perWs[0]` (the first workspace alphabetically), which is P01 — but the user is on P20.

### Contributing factors

1. **Blind default to first workspace** — `parseLoopApiResponse()` at line 400 unconditionally set `loopCreditState.currentWs = perWs[0]` before workspace detection even ran. This created a "pre-loaded" wrong answer.

2. **"Keep valid existing" fallback preserves wrong answer** — When the API failed (405), the catch handler checked `isKnownWorkspaceName(state.workspaceName)`. Since P01 IS a valid workspace name, it passed validation and was kept. The validation was checking "is this a real workspace?" when it should have been checking "is this the RIGHT workspace?".

3. **No DOM-based fallback** — The system had no alternative detection method when the API failed. The workspace name WAS visible in the page DOM (sidebar nav), but no code attempted to read it from there as a fallback.

4. **isKnownWorkspaceName returning true for empty list** — Before v7.9.18, the function returned `true` when the workspace list was empty, allowing "Preview" to be set. Fixed in v7.9.18 to return `false`, but the API 405 failure was the deeper issue.

### Triggering conditions

- `GET /projects/{id}` API returns 405 (possibly an API change/deprecation)
- User has multiple workspaces (>1) — single workspace would be correct by default
- The first workspace alphabetically is NOT the one the user is working in

### Why the existing spec did not prevent it

- The workspace detection spec assumed the project API would always work (or at most return 401, with a cookie retry)
- No spec or test scenario covered "project API permanently broken"
- The "Known-Good State Wins" principle was applied incorrectly — `perWs[0]` was treated as a "known-good" state when it was actually an arbitrary default

---

## Fix Description

### What was changed

1. **DOM-based fallback** — New function `detectWorkspaceFromDom()` (macro-looping.js) and `detectWorkspaceFromDomCombo()` (combo.js) that:
   - Reads the workspace name from the nav element (via XPath config or auto-discovery)
   - Matches it against the loaded workspace list (exact, then case-insensitive partial)
   - Sets `state.workspaceName` / `window.__wsCurrentName` and `currentWs` on match
   - Only falls back to `perWs[0]` if DOM detection also fails

2. **Removed blind `perWs[0]` default** — `parseLoopApiResponse` no longer sets `currentWs = perWs[0]`. It only sets `currentWs` if `state.workspaceName` already matches a known workspace (from a previous detection).

3. **All fallback paths use DOM detection** — The three error paths (no workspace_id, unmatched workspace_id, API failure) all call `detectWorkspaceFromDom()` instead of blindly defaulting.

### The new rules or constraints added

- **RULE**: When the project API fails, ALWAYS attempt DOM-based workspace detection before defaulting to `perWs[0]`. The DOM (sidebar nav) is a more reliable source than an arbitrary list position.
- **RULE**: Never set `currentWs = perWs[0]` unconditionally. This creates a "pre-loaded wrong answer" that passes validation checks downstream.

### Detection chain (updated, v7.9.19)

```
1. GET /projects/{id} → workspace_id → match in perWorkspace       (preferred)
2. GET /projects/{id} 401 → retry without bearer token              (auth fallback)  
3. GET /projects/{id} 405/fail → DOM nav element → match in perWs   (NEW: DOM fallback)
4. DOM nav element not found or no match → perWs[0]                 (ultimate fallback)
```

### Config changes or defaults affected

None.

### Logging or diagnostics

- `"API failed: HTTP 405 — trying DOM fallback"` — logged when project API fails
- `"✅ DOM fallback matched: ..."` — logged when DOM detection succeeds
- `"DOM found ... but no workspace match — defaulting to first"` — logged when DOM name doesn't match any workspace

---

## Iterations History

**Iteration 1 (v7.9.17)**: Fixed top-level bar credit formulas. Did NOT address workspace detection.

**Iteration 2 (v7.9.18)**: Added `isKnownWorkspaceName()` validation to fallback paths. Fixed `isKnownWorkspaceName` to return `false` when list is empty. Partially mitigated — prevented "Preview" but did NOT prevent defaulting to wrong workspace (P01).

**Iteration 3 (v7.9.19, final)**: Added DOM-based fallback detection. Removed blind `perWs[0]` default from `parseLoopApiResponse`. All fallback paths now use DOM detection. Applied to both controllers.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Every workspace detection fallback MUST attempt DOM-based detection before defaulting to `perWs[0]`. Never treat the first workspace as "current" without positive confirmation from API or DOM.

> **RULE**: The project API (`GET /projects/{id}`) may return non-200 responses. All consumers must handle 405, 404, 500 gracefully with DOM fallback.

### Acceptance criteria / test scenarios

1. With `GET /projects/{id}` returning 405: the top-level status bar should show the correct workspace name (matching sidebar nav) and that workspace's credit data.
2. With multiple workspaces, the first workspace should NOT be auto-selected unless it's actually the current one.
3. Double-clicking the current workspace should correctly show "no move needed" only when the detection is accurate.
4. The DOM fallback should work even if the nav XPath is not configured (via auto-discovery).

### Guardrails

- Search for `perWs[0]` in workspace detection code — every occurrence should be inside `detectWorkspaceFromDom` as the ultimate fallback, never as a first-choice default.
- Search for `currentWs = perWs` — should only be set after positive matching, never unconditionally.

### References to spec sections updated

- `/spec/17-app-issues/04-workspace-detection-405-api-failure.md` (this file)
- `/spec/10-macro-controller/workspace-detection.md` — Detection chain updated with DOM fallback

---

## TODO and Follow-Ups

1. [ ] Investigate if `GET /projects/{id}` is permanently deprecated or if there's a replacement endpoint
2. [ ] Consider caching the last-known workspace per project in localStorage to survive page reloads
3. [ ] Add the project API 405 scenario to the E2E test plan (S-011)

---

## Done Checklist

- [x] Spec updated (detection chain updated with DOM fallback)
- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Both controllers fixed (macro-looping.js + combo.js)
- [x] Acceptance criteria documented
- [x] Iterations recorded (3 iterations: v7.9.17, v7.9.18 partial, v7.9.19 complete)
