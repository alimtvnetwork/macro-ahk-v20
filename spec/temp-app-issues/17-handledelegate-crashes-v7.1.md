# Issue 17: HandleDelegate Crashes & Tab Detection Failures

**Version**: v7.1–v7.2
**Date**: 2026-02-20
**Status**: Resolved

---

## Issue Summary

### What happened

Four issues in quick succession after v7.0 refactor:

1. **HandleDelegate crash**: Missing `global` declarations for `macroLoopRunning` and `macroLoopDirection` → AHK v2 treated them as uninitialized locals → crash.
2. **Settings tab never reused**: `GetTabInfoFromTitle()` checked `hasProjectId` by looking for UUID in title, but Lovable titles show project **name**, not UUID → exact match always failed → opened new tab every time.
3. **`__delegateComplete not defined` warning**: `CallLoopFunction()` used `typeof` checks with bare variable names instead of `window.` prefix.
4. **HandleDelegate over-engineered**: 460 lines / 7 sub-functions of accumulated complexity from v6.55–v6.56 optimizations.

---

## Fix Description

### v7.1.4 Hotfix
1. Added `global macroLoopRunning, macroLoopDirection` to HandleDelegate
2. Relaxed tab matching: accept `isSettings` alone as fallback
3. Added `window.` prefix to typeof checks

### v7.2 Rewrite
Replaced entire HandleDelegate with clean 7-step linear process:
- Went from **460 lines / 7 sub-functions** to **~190 lines / 0 sub-functions**
- Removed: SmartProjectReturn, ReInjectAndRestoreLoop, all title marker circus
- Added: getElementById check for controller existence, shortcut-first approach

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: When AHK v2 functions access module-level variables, they MUST be declared `global`. Title-based tab matching must not depend on UUIDs that aren't displayed.

---

## Done Checklist

- [x] Hotfix applied (v7.1.4)
- [x] Full rewrite completed (v7.2)
- [x] Issue write-up created
