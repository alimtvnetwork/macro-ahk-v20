# Issue #05: Workspace Detection — Replace GET with POST mark-viewed

**Status**: FIXED  
**Version**: v7.9.20  
**Date**: 2026-02-23  
**Severity**: HIGH — Wrong workspace displayed, incorrect credit data shown  

## Symptom

The MacroLoop and ComboSwitch controllers consistently show the **wrong workspace** (e.g., P01 instead of P16/P20). The top-level status bar, progress bar, and credit data all reflect the first workspace in the list rather than the actual workspace the project belongs to.

## Root Cause

### Primary: `GET /projects/{id}` returns HTTP 405 Method Not Allowed

The workspace detection relied on `GET /projects/{projectId}` to retrieve the `workspace_id` for the current project. This endpoint returns **405 Method Not Allowed**, causing the entire detection chain to fall through to:

1. DOM fallback (unreliable — often scrapes "Preview" or project names instead of workspace names)
2. Default to `perWs[0]` (always wrong when the project is on any workspace other than the first)

### Secondary: Linear scan for workspace lookup

Even when the `workspace_id` was available, the code used a `for` loop to scan `perWorkspace[]` — inefficient and fragile.

### Tertiary: No workspace dictionary

The parsed workspace data was stored only as an array, requiring O(n) lookups every time a workspace needed to be found by ID.

## Fix (v7.9.20)

### 1. Replace `GET /projects/{id}` with `POST /projects/{id}/mark-viewed`

The `mark-viewed` endpoint:
- Is a **working** endpoint (not 405)
- Returns `{ workspace_id: "..." }` in its response
- Is already called by the Lovable UI naturally (non-destructive, idempotent)

**Before**: `GET /projects/{id}` → 405 → DOM fallback → wrong workspace  
**After**: `POST /projects/{id}/mark-viewed` → `workspace_id` → dictionary lookup → correct workspace

### 2. Build `wsById` dictionary after parsing workspaces

After `parseApiResponse` / `parseLoopApiResponse` parses the workspace list, a dictionary is built:

```javascript
creditState.wsById = {};
for (let w = 0; w < perWs.length; w++) {
  if (perWs[w].id) {
    creditState.wsById[perWs[w].id] = perWs[w];
  }
}
```

This enables O(1) lookup: `wsById[workspace_id]` instead of iterating.

### 3. Simplified detection flow

```
POST /projects/{id}/mark-viewed
  → response.workspace_id
  → wsById[workspace_id]  // O(1) lookup
  → Set state.workspaceName + currentWs
  → (fallback: DOM detection → perWs[0])
```

## Files Changed

| File | Change |
|------|--------|
| `combo.js` | `autoDetectCurrentWorkspace`: POST mark-viewed + wsById lookup |
| `combo.js` | `parseApiResponse`: Build `creditState.wsById` dictionary |
| `macro-looping.js` | `autoDetectLoopCurrentWorkspace`: POST mark-viewed + wsById lookup |
| `macro-looping.js` | `parseLoopApiResponse`: Build `loopCreditState.wsById` dictionary |

## Detection Hierarchy (Updated v7.9.20)

| Priority | Method | Endpoint |
|----------|--------|----------|
| 1 | API mark-viewed | `POST /projects/{id}/mark-viewed` → `workspace_id` → `wsById` dict |
| 2 | DOM sidebar scrape | XPath/auto-discover nav element → match against workspace list |
| 3 | Default first | `perWs[0]` (last resort only) |

## Principle Reinforced

**"Use working endpoints"** — Never rely on an API endpoint that returns 405. The `mark-viewed` endpoint is documented by actual network traffic and returns the data we need.
