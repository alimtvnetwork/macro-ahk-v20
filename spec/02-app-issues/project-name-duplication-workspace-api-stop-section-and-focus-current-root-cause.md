# Project Name Duplication, Workspace API, Stop Section & Focus Current — Root Cause Analysis

**Version**: v2.104.0
**Date**: 2026-04-07
**Status**: Fixed
**Spec**: /spec/02-app-issues/project-name-duplication-workspace-api-stop-section-and-focus-current-root-cause

---

## Symptom Summary

| # | Symptom | Severity |
|---|---------|----------|
| 1 | Project name displayed twice in the panel header | UI defect |
| 2 | Stop section did not show workspace name | Functional defect |
| 3 | "Focus Current" targeted stale/incorrect workspace | Functional defect |
| 4 | Workspace name still resolved via XPath DOM scraping | Architectural debt |

---

## Root Cause 1: Duplicate Project Name in Header

### Technical Cause
The panel title bar contained **two separate elements** both displaying the project name:
- `projectNameEl` (id=`loop-project-name`) — white text, populated via `getDisplayProjectName()`
- `wsNameEl` (id=`loop-title-ws-name`) — gold badge, also populated via `getDisplayProjectName()`

During Phase 5F (panel-header.ts extraction), `wsNameEl` was originally intended to show the **workspace** name but was repurposed to display the project name as a fallback. The redundant `projectNameEl` was never removed, creating visible duplication.

### Process Cause
- No UI validation existed to ensure the project name renders only once.
- The title bar elements were not reviewed for semantic overlap during extraction.
- The distinction between "project name" and "workspace name" was not enforced at the component level.

### Fix Applied
- Removed `projectNameEl` entirely from `_buildTitleElements()` and `_assembleTitleRow()`.
- `wsNameEl` now follows a strict priority: `state.workspaceName` → `loopCreditState.currentWs` → `getDisplayProjectName()` (fallback).

---

## Root Cause 2: Stop Section Not Showing Workspace Name

### Technical Cause
`renderStoppedStatus()` in `ui-status-renderer.ts` reads `state.workspaceName`. This value is only set by Tier 1 mark-viewed API detection. If mark-viewed fails (project not recently viewed, token issue), `state.workspaceName` stays empty — even though `loopCreditState.currentWs` may already be resolved from the `/user/workspaces` API.

The stop section update was effectively **coupled to loop execution state** because workspace detection only triggered during bootstrap or Check button clicks.

### Process Cause
- No explicit requirement existed to keep the stop section updated independently of loop state.
- The workspace name source (`state.workspaceName`) was a single point of failure without fallback to `loopCreditState.currentWs`.

### Fix Applied
- `updateTitleBarWorkspaceName()` now syncs from `loopCreditState.currentWs` when `state.workspaceName` is empty.
- The stop section inherits this through the normal `updateUI()` → `updateStatus()` → `renderStoppedStatus()` chain.
- Workspace name display is now independent of loop running state.

---

## Root Cause 3: Focus Current Targeting Wrong Workspace

### Technical Cause
`handleFocusCurrent()` in `ws-dropdown-builder.ts` had a fallback path:
```typescript
if (!currentName) {
  try { currentName = readWorkspaceFromDialog(); }
  catch (ex) { ... }
}
```

`readWorkspaceFromDialog()` scraped the Transfer dialog DOM using CSS selectors (`div[role="dialog"] p.truncate`). This was:
1. **Fragile** — dependent on Lovable's internal DOM structure.
2. **Stale** — read whatever dialog was last open, not necessarily the current workspace.
3. **Side-effecting** — mutated `state.workspaceName` directly from DOM text.

### Process Cause
- Legacy DOM scraping code was never removed when API-based detection was introduced.
- No architectural rule prevented DOM-based workspace resolution from coexisting with API resolution.
- The "source of truth" for workspace name was ambiguous — DOM, API, and cache all competed.

### Fix Applied
- Removed `readWorkspaceFromDialog()` entirely.
- `handleFocusCurrent()` now uses: `state.workspaceName` → `loopCreditState.currentWs` → API re-detection via `autoDetectLoopCurrentWorkspace()`.
- Zero DOM scraping for workspace name.

---

## Root Cause 4: XPath Prioritized Over API for Project Name

### Technical Cause
`getDisplayProjectName()` in `logging.ts` checked DOM XPath **first**, API name **second**:
```typescript
const domName = getProjectNameFromDom(); // XPath — priority 1
if (domName) return domName;
if (state.projectNameFromApi) return state.projectNameFromApi; // API — priority 2
```

This meant even when the API had resolved the correct project name, the XPath DOM result (which may be stale or incorrect) took precedence.

### Process Cause
- The function predated the API-based project name extraction.
- When `state.projectNameFromApi` was introduced, it was added as a fallback instead of replacing the DOM source.

### Fix Applied
- Flipped priority: API first (`state.projectNameFromApi`), DOM XPath second (legacy fallback only).

---

## Unified Workspace Resolution Flow (Post-Fix)

```
┌─────────────────────────────────────────────────┐
│           Workspace Name Resolution             │
│                                                 │
│  1. state.workspaceName                         │
│     ↓ (empty?)                                  │
│  2. loopCreditState.currentWs.fullName/name     │
│     ↓ (empty?)                                  │
│  3. API re-detection (autoDetectLoopCurrent...) │
│     ↓ (failed?)                                 │
│  4. getDisplayProjectName() as label fallback   │
│                                                 │
│  ⛔ NO DOM scraping for workspace name          │
│  ⛔ NO XPath for workspace resolution           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           Project Name Resolution               │
│                                                 │
│  1. state.projectNameFromApi  (API source)      │
│     ↓ (empty?)                                  │
│  2. getProjectNameFromDom()   (XPath fallback)  │
│     ↓ (empty?)                                  │
│  3. document.title parse                        │
│     ↓ (empty?)                                  │
│  4. Truncated project ID from URL               │
└─────────────────────────────────────────────────┘
```

---

## Regression Prevention

| # | Prevention Measure | Type |
|---|-------------------|------|
| 1 | `readWorkspaceFromDialog()` deleted — cannot be reintroduced without review | Code removal |
| 2 | `getDisplayProjectName()` now prioritizes API over DOM | Priority fix |
| 3 | Single `wsNameEl` element in title bar — no duplicate rendering possible | Structural |
| 4 | `handleFocusCurrent()` uses `loopCreditState.currentWs` — no DOM dependency | API-first |
| 5 | This RCA documented at known spec path for future reference | Process |

---

## Acceptance Criteria Verification

| # | Criteria | Status |
|---|---------|--------|
| 1 | Repeated project name removed from header | ✅ `projectNameEl` deleted |
| 2 | XPath-based workspace extraction no longer used | ✅ `readWorkspaceFromDialog` removed |
| 3 | Workspace name resolved from API | ✅ `loopCreditState.currentWs` / mark-viewed |
| 4 | Stop section shows workspace name regardless of loop state | ✅ `renderStoppedStatus` reads `state.workspaceName` |
| 5 | Focus Current targets actual active workspace | ✅ Uses `loopCreditState.currentWs` |
| 6 | Root cause analysis created | ✅ This document |
| 7 | Regression prevention identified | ✅ See table above |

---

## Files Modified

- `standalone-scripts/macro-controller/src/ui/panel-header.ts` — Removed `projectNameEl`, updated `wsNameEl` to show workspace name
- `standalone-scripts/macro-controller/src/ui/ui-updaters.ts` — `updateTitleBarWorkspaceName()` prioritizes workspace over project name
- `standalone-scripts/macro-controller/src/ui/ws-dropdown-builder.ts` — Removed `readWorkspaceFromDialog()`, `handleFocusCurrent()` uses API
- `standalone-scripts/macro-controller/src/logging.ts` — `getDisplayProjectName()` now prioritizes API over XPath

---

*RCA v2.104.0 — 2026-04-07*
