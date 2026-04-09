# Issue #11: DevTools Toggle-Close and Context Injection Bug

**Version**: v7.9.42 → v7.9.43 → v7.9.44 → Fixed in v7.9.45
**Severity**: Critical — complete injection failure, scripts execute in wrong context, no logs visible
**Date**: 2026-02-23
**Status**: Resolved

---

## Issue Summary

### What happened

A series of regressions in the DevTools injection sequence caused scripts to either:
1. Execute in the `devtools://` context instead of the page context (DOMAIN GUARD ABORT)
2. Close the DevTools console entirely, leaving no logs visible
3. Trigger accidental page navigation by clicking interactive elements

### Where it happened

- **Feature**: JS Injection (DevTools console paste-and-execute)
- **Files**: `Includes/JsInject.ahk`, `Includes/Combo.ahk`
- **Functions**: `InjectViaDevTools()`, `OpenDevToolsIfNeeded()`

### Symptoms and impact

- **v7.9.42**: `ClickPageContent()` function was introduced. Physical clicks hit links/buttons on the page, causing navigation to unrelated pages and multiple DevTools windows opening.
- **v7.9.43**: `ClickPageContent()` removed, but conditional DevTools logic (`devToolsOpened` flag) caused toggle-close: `Ctrl+Shift+J` would close the console if it was already focused, leaving user with no console and failed injection.
- **v7.9.44**: F12→Ctrl+Shift+J "unified path" introduced. F12 shifted focus to the DevTools frame. Subsequent `Ctrl+Shift+J` targeted `devtools://` context instead of page context. Domain guard correctly aborted, but script never injected. Screenshot shows `hostname: devtools` and `href: devtools://devtools/bundled/...`.

### How it was discovered

User report with screenshot showing DOMAIN GUARD ABORT with `hostname: devtools`. Previously reported as "several pages opening" and "console closing."

---

## Root Cause Analysis

### Direct cause

**F12 changes the focus context.** When F12 opens DevTools (from a closed state), browser focus shifts to the DevTools frame. A subsequent `Ctrl+Shift+J` is then interpreted within the DevTools context, opening a Console that targets `devtools://` instead of the page. The pasted script runs in the wrong execution context.

### Contributing factors

1. **Incorrect assumption about F12 behavior**: The v7.9.44 fix assumed F12 was a "clean slate" toggle that wouldn't affect where `Ctrl+Shift+J` targets. In reality, F12 shifts focus context.
2. **ClickPageContent() in v7.9.42**: Physical page clicks are inherently unsafe in an automation context — they hit whatever element is under the cursor, causing unpredictable side effects.
3. **State tracking (`devToolsOpened` flag) in v7.9.43**: Cross-tab state was unreliable. The flag from Tab A would influence behavior on Tab B, causing incorrect toggle decisions.
4. **Lack of issue documentation**: This bug class (injection context) recurred across 3+ versions because the root cause was never formally analyzed and documented. Each fix addressed a symptom without understanding the underlying focus-context mechanics.
5. **No regression testing protocol**: No acceptance criteria existed for "script must execute in page context, not DevTools context."

### Triggering conditions

- Any injection attempt where DevTools was previously closed
- F12 opens DevTools → focus shifts to DevTools frame → Ctrl+Shift+J opens Console in DevTools context
- Most visible when the "What's new" tab or other DevTools panel is the last-active panel

### Why the existing spec did not prevent it

The spec documented the injection lifecycle (detect → inject → execute) but did not specify:
- Which keyboard shortcuts are safe for targeting page context vs. DevTools context
- That F12 changes focus context as a side effect
- That physical page clicks are prohibited in injection paths
- That `Ctrl+Shift+J` behavior depends on which frame has focus

---

## Fix Description (v7.9.45)

### What was changed

Removed F12 entirely from the injection sequence. The new approach:

```
Ctrl+Shift+J → F6 → Ctrl+V → Enter
```

1. **`Ctrl+Shift+J`**: Opens DevTools Console targeting the PAGE context. This shortcut is specifically designed by Chrome to open the JavaScript console for the active page, regardless of DevTools state.
2. **`F6`**: Focuses the console input prompt (ensures cursor is in the right place for paste).
3. **`Ctrl+V`**: Pastes the script.
4. **`Enter`**: Executes.

### The new rules or constraints added

> **RULE-INJ-1**: The injection sequence MUST NOT use F12. F12 shifts focus to the DevTools frame, causing subsequent shortcuts to target the wrong context.

> **RULE-INJ-2**: Physical page clicks (`ClickPageContent()` or equivalent) are PERMANENTLY PROHIBITED in any injection code path. They cause accidental navigation and element interaction.

> **RULE-INJ-3**: `Ctrl+Shift+J` is the ONLY permitted shortcut for opening the DevTools Console. It always targets the page context when invoked from the browser window.

> **RULE-INJ-4**: No DevTools state tracking flags (`devToolsOpened`, etc.) shall be used. They are unreliable across tabs and create conditional branches that are difficult to reason about.

### Why the fix resolves the root cause

`Ctrl+Shift+J` is Chrome's dedicated "Open JavaScript Console" shortcut. Unlike F12 (which toggles DevTools generically), `Ctrl+Shift+J` specifically targets the page's JavaScript context. By removing F12 and using only `Ctrl+Shift+J`, we guarantee the Console is opened in the correct execution context every time.

This matches the original v6.55 approach (`Send("^+j")` → `Send("{F6}")` → `Send("^v")` → `Send("{Enter}")`) which was stable for the entire v6.x lifecycle.

### Config changes or defaults affected

- `ScriptVersion` bumped to `7.9.45`

### Logging or diagnostics required

- Existing `VerifyInjectionSuccess()` checks for `devtools://` in window title and tracks consecutive failures with TrayTip notification after 3 failures.
- Domain guard in combo.js and macro-looping.js logs hostname and href on abort.

---

## Iterations History

**Iteration 1 (v7.9.42)**: Added `ClickPageContent()` to ensure page focus before injection. **FAILED** — physical clicks hit interactive elements (links, buttons), causing accidental navigation and multiple DevTools windows.

**Iteration 2 (v7.9.43)**: Removed `ClickPageContent()`, reverted to `Ctrl+Shift+J` with `devToolsOpened` state flag for conditional DevTools management. **FAILED** — state flag was unreliable across tabs. When flag said "open" but DevTools was closed (different tab), `Ctrl+Shift+J` would toggle-close the console.

**Iteration 3 (v7.9.44)**: Removed state flag, introduced "unified path": F12 (close/reset) → Ctrl+Shift+J (open Console fresh). **FAILED** — F12 shifts focus to DevTools frame. Subsequent `Ctrl+Shift+J` targets `devtools://` context instead of page context. Domain guard correctly aborts, but script never injects.

**Iteration 4 (v7.9.45)**: Removed F12 entirely. Uses `Ctrl+Shift+J` only (matching stable v6.55). Added `F6` for console input focus. **RESOLVED**.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: NEVER use F12 in the injection sequence. ONLY use `Ctrl+Shift+J` to open DevTools Console — it is the only shortcut guaranteed to target the page execution context.

### Acceptance criteria / test scenarios

1. **Page context**: After injection, run `console.log(window.location.hostname)` — must show `lovable.dev`, `lovable.app`, or `localhost`. Must NOT show `devtools`.
2. **Console stays open**: After injection, the DevTools Console panel must remain visible with logs from the injected script.
3. **No navigation**: Injection must not cause the browser to navigate to a different page or URL.
4. **Multi-tab**: Switch between two project tabs, inject on each — both must succeed without cross-contamination.
5. **Consecutive injections**: Run ComboSwitch (which calls InjectJS then InjectJSQuick) — both injections must succeed in page context.

### Guardrails

- Domain guard in combo.js and macro-looping.js validates `window.location.hostname` before executing any UI injection.
- `VerifyInjectionSuccess()` in JsInject.ahk detects `devtools://` in window title and alerts after 3 consecutive failures.
- Code review: Any PR touching `JsInject.ahk` must verify no F12 or physical click functions are introduced.

### References to spec sections updated

- `specs/changelog.md` — v7.9.45 entry
- This file — `/spec/17-app-issues/11-devtools-toggle-close-bug.md`

---

## TODO and Follow-Ups

1. [x] Remove F12 from injection sequence
2. [x] Update version markers to v7.9.45
3. [x] Document issue with full RCA and iterations
4. [ ] Update `/spec/10-macro-controller/` with injection rules (RULE-INJ-1 through RULE-INJ-4)

---

## Done Checklist

- [ ] Spec updated under `/spec/10-macro-controller/`
- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Memory updated with summary and prevention rule
- [x] Acceptance criteria updated or added
- [x] Iterations recorded (4 iterations documented)
