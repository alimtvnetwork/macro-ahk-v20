# Issue: Workspace Name Binding Bug (Recurring)

**Severity**: High
**Status**: FIXED (v7.39)
**Date**: 2026-03-21
**Affected Files**: `loop-engine.ts`, `credit-fetch.ts`, `macro-looping.ts`, `workspace-detection.ts`

---

## Symptoms

1. Workspace name displays incorrectly after startup or manual check
2. Wrong workspace selected for credit calculations → loop moves to wrong workspace
3. Workspace name reverts to first workspace in list after detection failure
4. Workspace name sometimes shows truncated (12 chars) instead of full name

---

## Root Cause Analysis

### RCA-1: runCheck() Destructively Clears Workspace Name

**Location**: `loop-engine.ts` line 44 (before fix)

```typescript
state.workspaceName = '';  // DESTRUCTIVE — loses known-good value
```

**Problem**: `runCheck()` blanked `state.workspaceName` before running workspace detection. If detection failed (API timeout, XPath not found, dialog didn't open), the `restoreOnFailure()` function would try to restore it, but any code path that set `state.workspaceName` to a wrong value (e.g., defaulting to first workspace) would prevent restoration.

**Fix**: Removed the destructive clear. The previous workspace name is now preserved in `previousWsName` as a fallback, but `state.workspaceName` is only updated on successful detection.

### RCA-2: Name Truncation Causes Matching Failures

**Location**: `credit-fetch.ts` (parseLoopApiResponse)

```typescript
name: (ws.name || 'WS' + i).substring(0, 12),  // truncated for display
fullName: ws.name || 'WS' + i,                    // full name preserved
```

**Problem**: The `name` field is truncated to 12 characters for compact display. However, workspace matching in `workspace-detection.ts` and `isKnownWorkspaceName()` compared against both `name` and `fullName`. For workspaces with names > 12 characters, the truncated `name` could cause:

- False negative: XPath text "My Long Workspace Name" doesn't match `name` "My Long Work"
- False positive with partial matching: "My Long" matches "My Long Work" via `indexOf`

**Impact**: This is a DATA issue, not a display issue. The `name` field is intentionally short for the UI dropdown. All matching logic must use `fullName`.

### RCA-3: Overly Loose Partial Matching

**Location**: `macro-looping.ts` isKnownWorkspaceName()

```typescript
// OLD (broken): Partial match allows "Pro" to match "Production"
if (ws.fullName.toLowerCase().indexOf(name.toLowerCase()) !== -1) return true;
```

**Problem**: `indexOf` substring matching accepted any substring match. If workspace names shared common prefixes (e.g., "Team Alpha" and "Team Alpha Dev"), the observer could match the wrong workspace.

**Fix**: Replaced with exact matching (case-insensitive) only.

### RCA-4: Dialog XPath Returned Multiple Workspace Nodes (Ambiguous Match)

**Location**: `workspace-detection.ts` (`pollForWorkspaceName`, `findWorkspaceNameViaCss`)

**Problem**: Workspace XPath/CSS queries can return multiple nodes (entire workspace list). The old logic accepted the first matching text and also used partial `indexOf` checks, which could bind to a non-selected workspace (often the first item in the list) and update the header incorrectly.

**Fix**:

- Added normalized exact matching helper (`matchWorkspaceByName`) using canonicalized `fullName` text
- Removed all partial `indexOf` matching in dialog/CSS fallback paths
- Added selected-node prioritization (`aria-selected`, `data-state`, `aria-current`, selected/active classes)
- If multiple candidates remain ambiguous, preserve existing workspace instead of binding a wrong one
- Removed default-to-first fallback in dialog failure paths to prevent accidental workspace flips

---

## CRITICAL RULE — Do Not Repeat

> **NEVER clear `state.workspaceName` to an empty string before detection.**
> Always preserve the existing value and only update it on **confirmed successful** detection.
> Use `previousWsName` as a safety net, not as the primary mechanism.

> **NEVER use `indexOf` for workspace name matching.**
> Always use exact equality (`===`) or case-insensitive exact match.
> The `name` field is truncated — always prefer `fullName` for matching.

---

## Changes Made (v7.39)

| File | Change |
|------|--------|
| `loop-engine.ts` | Removed destructive clear + restore previous workspace when detected name is not an exact known workspace |
| `macro-looping.ts` | Tightened `isKnownWorkspaceName()` to exact matches only |
| `workspace-detection.ts` | Removed partial matching, added normalized exact matching + selected-node prioritization, removed default-first fallback on dialog miss |

---

## Verification

After fix, the following scenarios must work correctly:

1. **Fresh injection**: Workspace loads via Tier 1 API → correct `fullName` set
2. **Manual Check**: Existing workspace preserved if detection has no better result
3. **Observer mutation**: Only exact workspace names accepted from DOM
4. **Multiple workspaces with similar names**: No false cross-matching
5. **Workspaces with names > 12 chars**: Matched via `fullName`, not truncated `name`
6. **Dialog XPath returns multiple workspace nodes**: Selected workspace is prioritized; ambiguous matches do not overwrite existing workspace

---

## References

- `spec/10-macro-controller/ts-migration-v2/01-initialization-fix.md` — Phase 01 spec
- `spec/17-app-issues/authentication-freeze-and-retry-loop.md` — related auth fix
- `memory/features/macro-controller/bulk-rename-system` — rename uses workspace IDs, not names
