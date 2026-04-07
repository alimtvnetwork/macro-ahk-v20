# Issue 23: Workspace Name Wrong on Initial Load — mark-viewed API Restored

**Version**: v7.10.3
**Date**: 2026-02-25
**Status**: Resolved

---

## Issue Summary

### What happened

When the MacroLoop controller is first loaded, the workspace name in the header and the current workspace marker (📍) in the workspace list are incorrect. The controller shows the wrong workspace as current, causing the credit display and force-move direction to reference the wrong workspace.

### Where it happened

- **Feature**: MacroLoop & ComboSwitch controllers — workspace detection
- **Files**: `marco-script-ahk-v7.latest/macro-looping.js`, `marco-script-ahk-v7.latest/combo.js`
- **Functions**: `autoDetectLoopCurrentWorkspace()`, `autoDetectCurrentWorkspace()`

### Symptoms and impact

- Header shows blank workspace name or defaults to first workspace (perWs[0])
- Wrong 📍 marker in workspace list
- Credit data shown for wrong workspace
- Force move (⏫/⏬) operates relative to wrong position

### How it was discovered

User report: "the macro controller does not load the workspace name properly in the workspace section in the UI"

---

## Root Cause Analysis

### Direct cause

In v7.9.30, the `POST /projects/{id}/mark-viewed` API call (Tier 1) was removed from workspace detection with the comment "mark-viewed API removed — it returns nothing useful." This left XPath dialog clicking as the ONLY detection method. However:

1. XPaths are fragile — Lovable UI updates change the DOM structure
2. The dialog click + read flow has multiple failure points (button not found, dialog doesn't open, XPath returns wrong elements)
3. When XPath fails, detection falls to Tier 3 (first workspace) which is almost always wrong

### Contributing factors

1. The mark-viewed API was incorrectly characterized as "returning nothing useful" — it actually returns `{ workspace_id: "..." }` (documented in Issue #05, v7.9.20)
2. The `wsById` dictionary was still being built after API response parsing, but nothing was using it for detection
3. No fallback API path existed — only fragile DOM operations

### Why the existing spec did not prevent it

The spec at `/spec/10-macro-controller/workspace-management.md` listed mark-viewed as Tier 1 but the implementation had removed it. The spec and code were out of sync.

---

## Fix Description

### What was changed

1. **Restored mark-viewed API as Tier 1** in both `autoDetectLoopCurrentWorkspace()` (macro-looping.js) and `autoDetectCurrentWorkspace()` (combo.js)
2. Detection flow: `POST /projects/{projectId}/mark-viewed` → extract `workspace_id` → `wsById[workspace_id]` O(1) lookup → set workspace name authoritatively
3. On Tier 1 failure → falls through to Tier 2 (XPath dialog) → Tier 3 (default)

### Why the fix resolves the root cause

The mark-viewed API is a working endpoint that returns the correct `workspace_id` for the project. By using it as Tier 1 with the already-built `wsById` dictionary, workspace detection is reliable without needing to click any UI elements.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: The mark-viewed API (`POST /projects/{id}/mark-viewed`) is the authoritative workspace detection method. It MUST remain as Tier 1 in both controllers. XPath dialog detection is a fallback only.

### Acceptance criteria

1. On first load, workspace name matches the actual workspace the project is in
2. 📍 marker appears on the correct workspace in the list
3. If mark-viewed API fails, XPath dialog fallback still works
4. Activity log shows "Tier 1 matched" on successful API detection

---

## Done Checklist

- [x] Code fixed in `macro-looping.js` and `combo.js`
- [x] Issue write-up created
- [x] CHANGELOG updated (v7.10.3)
- [x] Workspace management spec updated
- [x] Engineering standards reference: #5 (API-First, DOM-Fallback)
