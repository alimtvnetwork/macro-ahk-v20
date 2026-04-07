# Plan: Workspace Detection Resilience Overhaul (v7.9.16–v7.9.25)

**Status**: COMPLETED
**Date Completed**: 2026-02-23
**Version**: v7.9.16 → v7.9.25

## Summary
Multi-version effort to achieve reliable workspace detection in MacroLoop. Progressed from DOM observer validation → API endpoint fix → guard flag activation → 4-tier detection hierarchy with Project Dialog fallback.

## Issues Fixed (with RCA references)

### 1. Workspace Name Shows Project Name (v7.9.16) — Issue #01
- **Root Cause**: DOM observer picked up project name from nav element
- **Fix**: `isKnownWorkspaceName()` validation on all DOM-sourced names

### 2. Status Bar Credit Display Mismatch (v7.9.17) — Issue #02
- **Root Cause**: Top-level bar used different credit formula than workspace items
- **Fix**: Uses shared `calcTotalCredits`/`calcAvailableCredits` helpers

### 3. Progress Bar Missing Granted + Stale Workspace (v7.9.18) — Issue #03
- **Root Cause**: No 🎁 segment for `credits_granted`; API fallbacks didn't validate existing workspace name
- **Fix**: Added segment; fallback paths use `isKnownWorkspaceName()`

### 4. Workspace Detection 405 API Failure (v7.9.19) — Issue #04
- **Root Cause**: `GET /projects/{id}` returns 405 Method Not Allowed
- **Fix**: DOM-based fallback; removed blind `perWs[0]` default

### 5. Replace GET with POST mark-viewed (v7.9.20) — Issue #05
- **Root Cause**: GET endpoint broken; POST mark-viewed works and returns `workspace_id`
- **Fix**: Switched to `POST /projects/{id}/mark-viewed`; built `wsById` O(1) dictionary

### 6. workspaceFromApi Guard Never Activated (v7.9.22) — Issue #06
- **Root Cause**: Guard flag declared but never set to `true`; DOM observer race condition always won
- **Fix**: Guard SET in all authoritative paths; CHECKED in all 4 DOM setter paths; `__loopDiag()` diagnostic added

### 7. Vague Fetch Logging / Empty Body Crash (v7.9.24) — Issue #07
- **Root Cause**: `resp.json()` crashed on empty 200 body; logs didn't include URL, auth, or response details
- **Fix**: Mandatory `resp.text()` + `JSON.parse()`; comprehensive fetch logging standard

### 8. Project Dialog Fallback (v7.9.25)
- **Root Cause**: When mark-viewed returns empty body, `reverseWorkspaceLookup` scanned body text and always matched P01
- **Fix**: Replaced with explicit Project Button click → XPath workspace name read → validation → dialog close

## Final Architecture: 4-Tier Detection Hierarchy

1. **Tier 1 — API**: `POST /projects/{id}/mark-viewed` → `workspace_id` → `wsById` lookup
2. **Tier 2 — Project Dialog DOM**: Click `ProjectButtonXPath` → read `WorkspaceNameXPath` → validate
3. **Tier 3 — Default**: `perWs[0]` (last resort only)
4. **Guard**: `state.workspaceFromApi` prevents DOM observers from overwriting verified data

## Principles Established
- **DOM Validation Required**: All DOM-scraped names must pass `isKnownWorkspaceName()`
- **Guard Flags Must Be SET and CHECKED**: A declared-but-unused flag is a latent bug
- **Use Working Endpoints**: Never rely on an API endpoint that returns 405

## Files Changed
- `macro-looping.js`, `combo.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`
- `spec/10-macro-controller/workspace-detection.md`, `spec/17-app-issues/01-07`
