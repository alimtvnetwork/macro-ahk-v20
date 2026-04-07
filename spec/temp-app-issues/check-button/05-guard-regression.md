# Issue #32: Check Button Guard Regression + Macro Auth Panel Controls Missing

**Version:** v7.19.x  
**Severity:** High  
**Components:** `macro-looping.js`, `01-script-direct-copy-paste.js`, `macro-controller.js`, `default-scripts-seeder.ts`  
**Status:** Fixed

---

## Issue Summary

Two regressions were reported:

1. **Manual Check button appeared broken** during normal loop runtime.
2. **Macro Auth panel** (injected controller UI) could not be moved, minimized reliably, or closed.

## Root Cause Analysis

### A) Check button regression

`checkBtn.onclick` had a strict runtime guard:

- blocked while `state.running && state.countdown > 10`

This made manual checks feel randomly unavailable for most of the cycle window, despite no active move/delegation conflict.

### B) Macro Auth panel control gaps

The injected auth panel had only partial minimize logic and no close/drag behavior in the extension-seeded script path. This created a mismatch between expected UX and actual controls.

## Fix Description

### Check button

- Replaced countdown-based block with a targeted safety check:
  - block only when `state.isDelegating === true`
- Added async error capture:
  - `runCheck().catch(...)` logs failures instead of silent breakage.

### Macro Auth panel

Implemented full panel controls in both standalone + extension-seeded controller code:

- **Drag:** header pointer drag with fixed positioning handoff (`right/bottom` → `left/top`).
- **Minimize:** hides content body and preserves header controls.
- **Close:** removes panel with reopen hint (`window.__MARCO__.showAuthPanel()`).

## Files Changed

- `marco-script-ahk-v7.latest/macro-looping.js`
- `01-script-direct-copy-paste.js`
- `standalone-scripts/macro-controller/macro-controller.js`
- `chrome-extension/src/background/default-scripts-seeder.ts`

## Prevention / Non-Regression

- Do not use broad countdown windows as availability gates for manual diagnostics actions.
- Keep standalone and seeded script variants functionally aligned for UI controls.
- Manual action buttons must fail loudly (`catch + log`) rather than silently.
