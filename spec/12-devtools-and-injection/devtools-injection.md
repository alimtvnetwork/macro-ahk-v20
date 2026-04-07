# 08 — DevTools Injection Specification

**Version**: v7.17
**Last Updated**: 2026-02-25

---

## Overview

AHK injects JavaScript into Chrome by pasting code into the DevTools Console. This is the most critical and fragile part of the system — multiple bugs have been caused by incorrect Console focus management.

---

## Injection Functions

### InjectViaDevTools(js) — Full Injection

```
First call (devToolsOpened == false):
  1. ClickPageContent() — anchor page execution context
  2. Ctrl+Shift+J — open DevTools Console (always targets page)
  3. Wait consoleOpenDelayMs (800ms)
  4. F6 — ensure cursor in console input
  5. PasteAndExecute(js)
  6. Set devToolsOpened = true

Subsequent calls (devToolsOpened == true):
  1. F12 — close DevTools (toggle off)
  2. ClickPageContent() — anchor page context
  3. Ctrl+Shift+J — reopen DevTools on Console tab
  4. Wait consoleOpenDelayMs
  5. PasteAndExecute(js)
```

### InjectJSQuick(js) — Lightweight (v7.8+, fixed v7.9.51)

```
NO window activation, NO DevTools toggle
Only: PasteAndExecute(js)
Assumes Console is already focused from preceding InjectViaDevTools()
```

**CRITICAL**: InjectJSQuick MUST NOT call `ActivateBrowserPage()`. This was the root cause of issue #13 — it stole focus from detached Console back to the browser page, causing paste to go to the address bar (413 errors).

### ClickPageContent() — Context Anchoring (v7.9.1)

```
Clicks at upper 1/3 of browser window:
  centerX = winX + winW / 2
  centerY = winY + Max(100, winH / 3)  ← safe zone above bottom-docked DevTools
Then WinActivate to re-anchor focus to page document
```

**Why upper 1/3**: Previous implementation clicked at lower 2/3, which landed ON bottom-docked DevTools, making DevTools the active execution context → DOMAIN GUARD ABORT.

### PasteAndExecute(js, label)

```
1. Save current clipboard
2. Set clipboard to js
3. ClipWait 2 seconds
4. Ctrl+V (paste)
5. Wait pasteDelayMs (200ms)
6. Enter (execute)
7. Wait executeDelayMs (300ms)
8. Restore clipboard
```

---

## Two-Branch Strategy (v7.9.41)

| Scenario | Strategy | Why |
|----------|----------|-----|
| First call (DevTools closed) | ClickPageContent → Ctrl+Shift+J | F12 would open to wrong panel |
| Subsequent call (DevTools open) | F12 (close) → ClickPageContent → Ctrl+Shift+J | Ensures Console tab regardless of current panel |

**REVERTED from v7.9.38**: The "always close-then-reopen" strategy caused DOMAIN GUARD ABORT because F12 on first call opened DevTools to a random panel.

---

## Domain Guard

Both controllers validate hostname on initialization:

```javascript
var allowed = ['lovable.dev', 'localhost', '127.0.0.1'];
if (allowed.indexOf(window.location.hostname) === -1) {
  console.error('[Controller] DOMAIN GUARD ABORT (hostname: ' + window.location.hostname + ')');
  return;
}
```

Prevents execution in `devtools://` context (hostname = `devtools`).

---

## Known Issues and Learnings

| Issue | Root Cause | Fix | Version |
|-------|-----------|-----|---------|
| Script pasted to address bar | InjectJSQuick called ActivateBrowserPage() | Removed activation | v7.9.51 |
| DOMAIN GUARD ABORT | ClickPageContent hit bottom DevTools panel | Click upper 1/3 | v7.9.1 |
| F12 opens wrong panel on first call | DevTools remembers last panel; F12 doesn't guarantee Console | Use Ctrl+Shift+J only on first call | v7.9.41 |
| Ctrl+Shift+J toggles Console closed | If Console was already active, Ctrl+Shift+J closes it | Two-branch: close first via F12 on subsequent calls | v7.9.45 |
| Multiple DevTools windows | AHK sent Ctrl+Shift+J on every injection | devToolsOpened flag | v4.9 |
| F6 opens new console panels | F6 cycles between DevTools panels | Removed F6 from injection; added back only for console input focus | v5.4/v7.9.45 |

---

## User Requirements

1. **Keep DevTools open**: After first injection, leave DevTools open
2. **Never close manually**: Script assumes DevTools stays open for subsequent calls
3. **If closed accidentally**: Restart AHK to re-trigger open sequence

---

## CDP Injection Fallback (Tier 5)

The AHK DevTools injection method above is **legacy** (archived in `skipped/`). The current Chrome extension uses a 5-tier programmatic injection chain:

1. MAIN (Blob URL)
2. `chrome.userScripts` API
3. ISOLATED (Blob URL)
4. ISOLATED (Indirect Eval)
5. **CDP (`chrome.debugger`)** — last resort

See **`spec/11-chrome-extension/47-cdp-injection-fallback.md`** for full CDP architecture, `chrome.debugger` vs WebSocket approaches, security considerations, and implementation plan.
