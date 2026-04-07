# Issue #21: InjectViaDevTools — Ctrl+Shift+J Sent Before Window Ready

**Status**: FIXED  
**Version**: v7.10.1  
**Severity**: High — DevTools fails to open on first attempt  
**Category**: Window Activation / Timing  

## Symptom

DevTools Console does not open when `InjectViaDevTools` sends `Ctrl+Shift+J`. The injection silently fails. Works on second attempt or after manual retry. v7.32 (which uses the older generic `WinActivate`) worked fine.

## Root Cause

Same pattern as Issue #19. `ActivateBrowserPage()` was introduced in v7.9.49 to skip DevTools windows, but the function returns after only `Sleep(browserActivateDelayMs)` (150ms). `InjectViaDevTools` then immediately sends `Ctrl+Shift+J` — before the window is ready to receive keyboard input.

v7.32 worked because it used the simpler `WinActivate("ahk_exe " browserExe)` + `Sleep(browserActivateDelayMs)`, which had enough settle time by coincidence. The new `ActivateBrowserPage()` is faster (returns sooner) but the window isn't ready yet.

The retry path had the same bug — `ActivateBrowserPage()` without `WinWaitActive` before the second `Ctrl+Shift+J`.

## Fix

Added `WinWaitActive("ahk_id " hwnd, , 3)` + `Sleep(browserActivateDelayMs)` after both `ActivateBrowserPage()` calls in `InjectViaDevTools`:

1. **Attempt 1** (line ~150): After initial `ActivateBrowserPage()`, wait for HWND to be active + settle before `Ctrl+Shift+J`
2. **Retry** (line ~170): After retry `ActivateBrowserPage()`, same wait before second `Ctrl+Shift+J`

Both paths also handle the fallback case (HWND=0) with a 300ms sleep.

## Prevention

- **Standard #19 (WinWaitActive Mandatory)**: After activating a window for keyboard input, ALWAYS use `WinWaitActive` + `Sleep` before sending keystrokes. This rule now applies to ALL `ActivateBrowserPage()` call sites, not just `GetCurrentUrl`.
- **Pattern**: Any time `ActivateBrowserPage()` is followed by a `SendKey()`, the HWND must be waited on first.

## Files Changed

- `Includes/JsInject.ahk` (v7.0) — Added WinWaitActive + settle delay after both ActivateBrowserPage() calls in InjectViaDevTools
