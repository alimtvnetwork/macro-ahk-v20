# Issue 14: Probe-On-Return Failure & Force Up/Down UI Feedback

**Version**: v6.55
**Date**: 2026-02-19
**Status**: Resolved

---

## Issue Summary

### What happened

Three issues addressed in v6.55:

1. **Probe-on-return failure**: After AHK delegation (Force Up/Down), returning to the project tab and probing for `window.__delegateComplete` sometimes produced NO_RESULT — neither `__AHK_LOOP_PROBED__` nor `__AHK_LOOP_MISSING__` appeared in the title. This triggered unnecessary full 50KB+ re-injections.
2. **Force Up/Down had no UI feedback**: Status showed generic "SWITCHING..." instead of "FORCE UP" / "FORCE DOWN".
3. **Workspace name not visible when loop stopped**: Required opening the project dialog (disruptive).

### Where it happened

- **Feature**: MacroLoop delegation, UI status display
- **Files**: `macro-looping.js`, `MacroLoop.ahk`

### How it was discovered

User testing during Force Up/Down operations.

---

## Root Cause Analysis

### Direct cause (Issue 1)

The probe sleep was too short (500ms) for title signal to propagate. When DevTools timing or focus was off, the title marker never appeared → NO_RESULT → unnecessary full re-injection.

### Direct cause (Issue 2)

`forceSwitch()` set `state.isDelegating = true` but no `state.forceDirection` field existed to distinguish force from auto-delegation.

---

## Fix Description

### Issue 1 fix
- Increased probe sleep from 500ms → 800ms
- Added NO_RESULT detection (when neither marker appears)
- Added retry-once logic: reset `devToolsOpened := false` and retry probe before full injection
- Added diagnostic logging: raw probe title (first 120 chars) and explicit flags

### Issue 2 fix
- Added `state.forceDirection` field (`null` / `'up'` / `'down'`)
- `forceSwitch()` sets `state.forceDirection = direction`
- `delegateComplete()` clears it
- `updateStatus()` shows `FORCE UP`/`FORCE DOWN` with orange color when active

### Issue 3 fix
- Added `startWorkspaceObserver()` with MutationObserver on nav element
- Added `fetchWorkspaceNameFromNav()` for non-disruptive workspace name reading

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Probe mechanisms that read title markers must have retry logic with DevTools state reset on NO_RESULT.

### References to spec sections updated

- `marco-script-ahk-v7.latest/specs/spec-issues-v6.55.md` — Original issue file

---

## Done Checklist

- [x] Fix implemented and tested
- [x] Issue write-up created
- [x] Prevention rules documented
