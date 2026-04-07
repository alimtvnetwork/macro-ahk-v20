# Issue #13: WinActivate + Probe Causes DevTools/Address Bar Injection

**Status**: FIXED  
**Version**: v7.9.50  
**Severity**: Critical — prevents all script injection  
**Category**: Injection / Window Management  

## Symptom

Two distinct failure modes:
1. `[MacroLoop] DOMAIN GUARD ABORT` — script executes in `devtools://` context
2. JS code pasted into browser **address bar** — browser navigates to garbage URL

## Root Cause #1: WinActivate targets DevTools window (v7.9.49)

`WinActivate("ahk_exe chrome.exe")` can activate a **detached DevTools window** instead of the page window. Then `Ctrl+Shift+J` opens Console in that DevTools window → domain guard aborts.

**Fix**: `ActivateBrowserPage()` — enumerates Chrome windows, skips any with "DevTools -" in title.

## Root Cause #2: Probe pastes into address bar (v7.9.50)

The v7.9.47 "probe-and-retry" mechanism was **actively destructive**:

1. `Ctrl+Shift+J` **toggles** — if Console is already open, it **closes** DevTools
2. After DevTools closes, focus returns to the page/address bar
3. The probe's `Ctrl+V` + `Enter` pastes JS into the **address bar**
4. Browser navigates to `void(document.title='__AHK_P...')` as a URL
5. Page is destroyed, all state lost

### Why the toggle happens

| DevTools State | Console Panel | Ctrl+Shift+J Result |
|---|---|---|
| Closed | N/A | **Opens** → Console |
| Open | Different panel | **Switches** to Console |
| Open | **Console** (active) | **CLOSES DevTools** ❌ |

After a successful injection, Console is the active panel. The NEXT injection's `Ctrl+Shift+J` **closes** it.

## Fix: Direct Inject + Post-Inject Retry (v7.9.50)

**Removed the probe entirely.** New approach:

1. `ActivateBrowserPage()` — activate page window, skip DevTools
2. `Ctrl+Shift+J` — open/toggle Console
3. `Ctrl+V` + `Enter` — paste real script
4. `VerifyInjectionSuccess()` — check page title for failure indicators
5. **If failed**: `Ctrl+Shift+J` again (reopens Console since it was just closed) → re-paste → re-verify

### Why this is safe

When `Ctrl+Shift+J` **closes** DevTools (toggle-close):
- Focus returns to the **page body** (not address bar)
- `Ctrl+V` on page body is **harmless** (no effect on non-contenteditable pages)
- `Enter` on page body is **harmless**
- The script is silently lost, but no navigation occurs
- `VerifyInjectionSuccess` detects the failure
- Retry sends `Ctrl+Shift+J` which **reopens** Console (since it was just closed)
- Second paste succeeds ✅

## Timeline

| Version | Approach | Problem |
|---|---|---|
| v7.9.45 | `WinActivate` + `Ctrl+Shift+J` | Activates DevTools window; toggle-close |
| v7.9.47 | Probe-and-retry | **Probe pastes JS into address bar** ❌ |
| v7.9.48 | Removed F6 | F6 bug separate |
| v7.9.49 | `ActivateBrowserPage()` | Fixed window targeting |
| **v7.9.50** | **Direct inject + retry** | ✅ No probe, no address bar risk |

## Rules

- **RULE-INJ-7**: Never use raw `WinActivate("ahk_exe " browserExe)`. Use `ActivateBrowserPage()`.
- **RULE-INJ-8**: Title checks MUST use `GetPageWindowTitle()`.
- **RULE-INJ-9**: NEVER paste+Enter as a "probe" before the real injection. The toggle-close makes ANY pre-injection paste potentially destructive.
- **RULE-INJ-10**: On injection failure, retry by sending `Ctrl+Shift+J` again — it reopens Console after a toggle-close.

## Files Changed

- `Includes/JsInject.ahk` — Removed `EnsureConsoleOpen()` probe, added `PasteAndExecute()`, retry logic in `InjectViaDevTools()`
