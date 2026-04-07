# Issue #19: GetCurrentUrl — First Attempt Always Fails (Press Twice)

**Status**: FIXED  
**Version**: v7.10.1
**Severity**: High — first Ctrl+Shift+Down always fails  
**Category**: Window Activation / URL Reading  

## Symptom

User presses `Ctrl+Shift+Down` to attach MacroLoop controller. First attempt:
- `GetCurrentUrl` sends `Ctrl+L` (focus address bar) + `Ctrl+C` (copy URL)
- Clipboard comes back **empty** → "Not on lovable.dev, aborting"
- Second attempt works correctly

## Root Cause

`GetCurrentUrl()` used `WinActivate("ahk_exe " browserExe)` — the **generic** window activation that picks ANY chrome.exe window. When DevTools is detached (a separate window), AHK may activate the **DevTools window** instead of the page window.

In a DevTools window, `Ctrl+L` does **NOT** focus the browser address bar — it has no address bar. So `Ctrl+C` copies nothing, `ClipWait` times out silently, and the URL is empty.

The second attempt works because:
1. The first attempt's `Escape` keystroke was harmless
2. On the second call, Windows naturally re-activates the most recent foreground window (which the user switched back to)

## Evidence from Activity Log

```
[11:20:40] Activating browser window
  11:20 Browser activated successfully     ← May have activated DevTools window
[11:20:40] Sending: Ctrl + l (Focus address bar)
[11:20:41] Sending: Ctrl + c (Copy URL from address bar)
  11:20 Got URL:                           ← EMPTY — Ctrl+L had no effect in DevTools
[11:20:43] Not on https://lovable.dev/, aborting
```

## Fix

### Iteration 1 (v7.9.54) — Wrong diagnosis
Replaced `WinActivate("ahk_exe " browserExe)` with `ActivateBrowserPage()` to skip DevTools windows. Added `ClipWait` return value check. **Did NOT fix the issue** — logs showed the correct PAGE window was activated, but `Ctrl+L` still failed.

### Iteration 2 (v7.10.1) — Correct fix: Timing
The real root cause was **insufficient settle time** after window activation. `ActivateBrowserPage()` has only a 150ms internal sleep. The old code had `WinActivate` + `WinWaitActive(3s)` + `Sleep(browserActivateDelayMs)` — a much more robust wait. The window was activated but not yet ready to receive `Ctrl+L`.

**Fix**: After `ActivateBrowserPage()` returns the HWND, added:
1. `WinWaitActive("ahk_id " hwnd, , 3)` — blocks until the window is truly active (up to 3s)
2. `Sleep(browserActivateDelayMs)` — extra settle time for keyboard input readiness

## Prevention

- **RULE-WIN-1**: ALL browser window activations MUST use `ActivateBrowserPage()`, never generic `WinActivate("ahk_exe " browserExe)`.
- **RULE-WIN-2**: After activating a window for keyboard input, ALWAYS use `WinWaitActive` + `Sleep` before sending keystrokes. A `WinActivate` without `WinWaitActive` is unreliable.
- **RULE-CLIP-1**: Every `ClipWait()` call MUST check its return value and log an explicit error on timeout.

## Files Changed

- `Includes/MacroLoop/Routing.ahk` (v7.0 + v7.32) — `GetCurrentUrl()`: ActivateBrowserPage + WinWaitActive + settle delay
