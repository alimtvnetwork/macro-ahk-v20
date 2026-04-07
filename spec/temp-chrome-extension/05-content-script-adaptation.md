# Chrome Extension — Content Script Adaptation

**Version**: v0.2 (Updated — Injection Model Resolved)  
**Date**: 2026-02-28  
**Fixes**: Risk R-03 (Injection Model Contradiction)

---

## Purpose

Document the changes needed to adapt `combo.js` and `macro-looping.js` from AHK-injected scripts to Chrome Extension scripts injected via the programmatic injection model.

---

## ⚠️ CRITICAL DECISION: Programmatic Injection Only

**All script injection uses `chrome.scripting.executeScript()` (programmatic)**. There are NO `content_scripts` entries in `manifest.json`.

**Why**:
1. The project model (`12-project-model-and-url-rules.md`) requires dynamic URL matching with exact/prefix/regex rules — static `content_scripts.matches` can't express this
2. User-uploaded scripts can't be added to manifest `content_scripts` at runtime
3. Injection conditions (require element, require cookie, delay) require programmatic control
4. Deduplication (same script matched by multiple rules) requires runtime tracking
5. Script execution world (ISOLATED vs MAIN) is configurable per-script, not per-manifest-entry

**Previous spec (v0.1)** described a "two-layer" model with static `content_scripts` for built-in scripts. This is **REMOVED**. All scripts — built-in and user-uploaded — follow the same programmatic injection path.

---

## Injection Flow

```
Page navigation detected (via chrome.webNavigation.onCompleted)
    │
    ▼
Background: project-matcher.ts evaluates URL against all enabled project URL rules
    │
    ├── No match → do nothing
    │
    └── Match(es) found → collect all matching rules, sorted by priority
         │
         ▼
    For each matched rule, check conditions:
      ├── requireCookie present? → chrome.cookies.get()
      ├── requireElement present? → inject a probe script to check DOM
      ├── requireOnline? → navigator.onLine
      └── minDelayMs? → setTimeout
         │
         ▼
    Collect scripts from matched rules (dedup by scriptId via Set)
         │
         ▼
    For each script (in order):
      1. Resolve config (rule > project default > bundled)
      2. If config injection method = 'global':
         → Inject config snippet first: window.__marcoConfig = {...}
      3. Wrap user script in try/catch (see error-wrapper.ts)
      4. chrome.scripting.executeScript({
           target: { tabId },
           world: script.world,    // 'ISOLATED' or 'MAIN'
           func: wrappedScript,    // Pre-wrapped with error handling
         })
      5. Log result via LOG_ENTRY message
      6. Track in tabInjections record
```

---

## What Changes

### 1. Remove AHK Placeholder System

**Current**: AHK reads the JS file, replaces `__PLACEHOLDER__` tokens with `config.ini` values, then pastes the compiled string.

```javascript
// Current (AHK-compiled)
var TIMING = {
  LOOP_INTERVAL: __LOOP_INTERVAL_MS__,       // Replaced by AHK at injection time
  COUNTDOWN_INTERVAL: __COUNTDOWN_INTERVAL_MS__
};
```

**New**: Script loads config from background via messaging (Method 2, default).

```javascript
// New (Chrome Extension)
let CONFIG = {};

async function initController() {
  CONFIG = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
  });

  var TIMING = {
    LOOP_INTERVAL: CONFIG.macroLoop.timing.loopIntervalMs,
    COUNTDOWN_INTERVAL: CONFIG.macroLoop.timing.countdownIntervalMs
  };

  // ... rest of initialization
}

initController();
```

### 2. Replace `resolveToken()` with Extension Messaging

**Current**: Token resolution chain: `localStorage → document.cookie → manual input`

**New**: Request token from background service worker.

```javascript
async function resolveToken() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, function(token) {
      resolve(token || '');
    });
  });
}
```

### 3. Keep IIFE Wrapper (Safety Net)

Chrome's programmatic injection via `chrome.scripting.executeScript` with `func` parameter runs in a fresh scope. However, when injecting via `files` parameter, scripts share the content script namespace. **Keep the IIFE wrapper** for safety in both injection modes.

### 4. Remove Domain Guard

**Current**: Each script checks `window.location.hostname` to prevent running in DevTools context.

**New**: Programmatic injection already targets specific tabs via `tabId`. The background's `project-matcher.ts` ensures scripts only inject into matching URLs. Domain guards are redundant and removed.

### 5. Keep Idempotent Marker Check (Safety Net)

With programmatic injection, the deduplication `Set<scriptId>` per tab prevents double injection. However, **keep the DOM marker check** as a defense-in-depth safety net:

```javascript
if (document.getElementById('__marco_loop_injected')) return;
const marker = document.createElement('div');
marker.id = '__marco_loop_injected';
marker.style.display = 'none';
document.body.appendChild(marker);
```

### 6. Token Expiry Auto-Recovery

**Current**: On 401/403, shows red indicator and waits for manual token replacement.

**New**: On 401/403, request fresh token from background (which re-reads cookie). If cookie is gone, show "Please log in" message.

```javascript
async function apiFetch(url, options) {
  let resp = await fetch(url, options);
  if (resp.status === 401 || resp.status === 403) {
    const newToken = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' }, resolve);
    });
    if (newToken) {
      options.headers['Authorization'] = 'Bearer ' + newToken;
      resp = await fetch(url, options);
    }
  }
  return resp;
}
```

---

## What Stays the Same

1. **All UI rendering code** — `createControllerUI()`, panel layout, buttons, workspace list, progress bars
2. **All credit calculation logic** — `calcTotalCredits()`, `calcAvailableCredits()`, `calcFreeCreditAvailable()`
3. **All workspace detection logic** — XPath-only detection (Project Dialog DOM → Default)
4. **All workspace switching logic** — `moveToWorkspace()`, `moveToAdjacentWorkspace()`, smart switching
5. **All API call logic** — Same endpoints, same request/response handling
6. **MutationObserver for SPA persistence** — Still needed for client-side navigation
7. **CSS styles** — Same inline styles for the floating panels
8. **Activity log** — Same logging system with colored entries
9. **CSV export** — Same `exportWorkspacesAsCsv()` function
10. **Keyboard shortcuts within controller** — Same `/`, `s`, `x`, arrow key handlers

---

## Estimated Changes

| File | Lines Changed | Effort |
|------|--------------|--------|
| `combo.js` | ~80 lines | Config loading, token resolution, domain guard removal |
| `macro-looping.js` | ~80 lines | Same as combo.js |
| New: `src/background/index.ts` | ~50 lines | Entry point, init, message listener |
| New: `src/background/message-router.ts` | ~100 lines | Centralized handler (see `18-message-protocol.md`) |
| New: `src/background/cookie-reader.ts` | ~60 lines | Token resolution |
| New: `src/background/project-matcher.ts` | ~120 lines | URL matching engine |
| New: `src/content-scripts/error-wrapper.ts` | ~40 lines | Try/catch injection wrapper |

Total estimated: ~530 lines of new/changed code.

---

## Migration Strategy

1. **Fork** `combo.js` → `chrome-extension/src/scripts/combo.ts` and `macro-looping.js` → `chrome-extension/src/scripts/macro-looping.ts`
2. **Replace** placeholder constants with config message calls
3. **Replace** `resolveToken()` with background messaging
4. **Remove** domain guard. **Keep** IIFE + marker as safety net
5. **Build** with `npm run build` (see `17-build-system.md`)
6. **Load unpacked** from `dist/` folder
7. **Iterate** on config loading and token flow

---

*Content script adaptation v0.2 — 2026-02-28*
