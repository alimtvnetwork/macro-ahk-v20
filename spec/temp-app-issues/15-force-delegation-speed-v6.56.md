# Issue 15: Force Up/Down Extremely Slow (~42s per delegation)

**Version**: v6.56
**Date**: 2026-02-19
**Status**: Resolved

---

## Issue Summary

### What happened

Force Up/Down delegation took ~42 seconds per cycle due to cumulative inefficiencies: every `InjectJS` call did a full F12 close/reopen cycle (1.3s each × 8+ calls), tab search used keyboard-based URL extraction (600ms/tab), probe failures cascaded into full re-injections, and post-combo wait was a hardcoded 3000ms.

### Symptoms and impact

User had to wait ~42 seconds for each Force Up/Down operation. Disruptive and unusable for rapid workspace switching.

---

## Root Cause Analysis

### Direct cause

Six compounding inefficiencies:
1. Every `InjectJS` did F12→Ctrl+Shift+J→paste→enter = 1.3s minimum (×8 calls = 10.4s)
2. `GetCurrentUrl` used Ctrl+L/Ctrl+C/Escape per tab = 600ms × N tabs
3. Probe failures cascaded into full 110KB re-injections
4. Post-combo wait was hardcoded 3000ms
5. Signal cleanup used 2 separate InjectJS calls (2.6s overhead)
6. Full re-injection always happened on return even when script existed

---

## Fix Description (6 phases)

1. **SendKey() refactor**: Single wrapper for `LogKeyPress()` + `Send()` — foundation
2. **InjectJS speed**: Skip F12 close on subsequent calls (saved ~600ms per call × 8 calls)
3. **Title-based tab ID**: `WinGetTitle()` instant lookup instead of `GetCurrentUrl()` (1.2s → 0.02s)
4. **Combo probe + execution combined**: One InjectJS call for probe + execute + signal (saved ~4s)
5. **Return probe fix**: F12 reset before probing + combined probe/delegateComplete/cleanup (saved ~4s)
6. **Workspace MutationObserver**: Always-on workspace name via DOM observer

### Result

Happy path dropped from **~42s to ~6-10s** (~32s savings).

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Combine probe + execution + signal cleanup into single InjectJS calls where possible. Use title-based tab detection instead of keyboard URL extraction.

---

## Done Checklist

- [x] All 6 phases implemented
- [x] Speed improvement verified
- [x] Issue write-up created
