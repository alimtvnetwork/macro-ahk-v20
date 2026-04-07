# Issue #12: Ctrl+Shift+J Toggle-Close Causes Injection Failure

**Status**: FIXED  
**Version**: v7.9.47  
**Severity**: Critical — prevents all script injection  
**Category**: Injection / DevTools Management  

## Symptom

`window.__loopStart is not a function` — script never injected.  
`Storage.getStorageKey failed: "Frame tree node for given frame not found"` in DevTools.

## Root Cause

**`Ctrl+Shift+J` has TOGGLE behavior in Chrome:**

| DevTools State | Console Panel | Ctrl+Shift+J Result |
|---|---|---|
| Closed | N/A | **Opens** DevTools → Console |
| Open | Different panel | **Switches** to Console |
| Open | **Console** | **CLOSES DevTools** ❌ |

When DevTools Console is already open from a previous injection (DevTools stays open between runs), the next `Ctrl+Shift+J` **closes** DevTools entirely. The subsequent `F6` → `Ctrl+V` → `Enter` keystrokes go to the **browser URL bar** or page, not the console. The script is never executed.

## Timeline of Context Bugs

| Version | Approach | Problem |
|---|---|---|
| v7.9.42 | F12 + ClickPageContent | Physical clicks caused accidental navigation |
| v7.9.43 | F12 + devToolsOpened flag | Flag stale across tabs |
| v7.9.44 | F12 unified path | F12 shifts focus to devtools:// frame |
| v7.9.45 | Ctrl+Shift+J only | Toggle-close when Console already open |
| **v7.9.47** | **Probe-and-retry** | ✅ Detects toggle-close and auto-retries |
| **v7.9.48** | **Remove F6** | ✅ F6 focuses address bar in docked mode — removed |

## Fix: Probe-and-Retry (v7.9.47)

New `EnsureConsoleOpen()` function:

1. Send `Ctrl+Shift+J` + `F6`
2. Paste a **tiny probe script** that writes a unique marker into `document.title`
3. Check `WinGetTitle()` for the marker
4. **If marker found** → Console is open and receiving input ✅
5. **If marker NOT found** → Console was closed by toggle. Send `Ctrl+Shift+J` again (reopens) and retry probe
6. Max 2 attempts before falling back to best-effort

### Why This Works

- The probe is a ~60 char script: `void(document.title='__AHK_P{tick}__'+document.title)`
- If Console is closed, the paste goes to the URL bar — `document.title` is unchanged
- If Console is open, the probe executes and the title changes — verifiable via `WinGetTitle()`
- After successful probe, cleanup removes the marker from the title
- The real script is then injected into the verified-open Console

### Additional Fix: Stale Marker Detection (v7.9.47)

Both `macro-looping.js` and `combo.js` idempotency checks now verify global functions exist, not just the DOM marker. A previous crashed injection that placed the marker but failed before defining `window.__loopStart` no longer blocks re-injection.

## Rules Updated

- **RULE-INJ-5**: Every `InjectViaDevTools` call MUST verify Console is open via probe before injecting the real script.
- **RULE-INJ-6**: Idempotency checks MUST verify both DOM marker AND global functions. Stale markers from crashed injections must be auto-cleaned.

## Files Changed

- `Includes/JsInject.ahk` — Added `EnsureConsoleOpen()` with probe-and-retry
- `macro-looping.js` — Stale marker detection in idempotency check
- `combo.js` — Stale marker detection in idempotency check
