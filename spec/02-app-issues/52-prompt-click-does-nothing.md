# Issue 52: Prompt Click Does Nothing in Macro Controller Dropdown

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: Fixed

---

## Issue Summary

### What happened

Clicking a prompt item in the macro controller's prompts dropdown does nothing — no paste, no clipboard copy, no toast notification, no visible feedback.

### Where it happened

- **Feature**: Macro controller prompts dropdown (`standalone-scripts/macro-controller/01-macro-looping.js`)
- **Functions**: `renderPromptsDropdown()` → `item.onclick` handler, `tryLoadByMessage()`, `pasteIntoEditor()`

### Symptoms and impact

- Clicking prompt items produces zero visible feedback.
- Users cannot inject prompts into the Lovable chatbox from the dropdown.
- Core prompt injection workflow completely broken.

### How it was discovered

User report during manual testing of prompt injection.

---

## Root Cause Analysis

### Root Cause 1: Click target whitelist guard too restrictive

The `item.onclick` handler used a **strict equality whitelist**:

```js
if (e.target !== item && e.target !== nameSpan && e.target !== badge) return;
```

This only allowed clicks on exactly 3 DOM nodes (`item`, `nameSpan`, `badge`). Any click that landed on:
- Flex gap areas between children
- The `actions` container (space between edit/delete/copy icons)
- Any unexpected intermediate node

...was silently swallowed with an early `return`. The action buttons had `e.stopPropagation()` which was correct, but the whitelist approach was fundamentally fragile.

### Root Cause 2: `tryLoadByMessage()` lacked relay fallback for MAIN world

The macro controller runs in the **MAIN** world (via `chrome.scripting.executeScript`), where `chrome.runtime` is unavailable. The `tryLoadByMessage()` function only used `chrome.runtime.sendMessage` — it had **no `window.postMessage` relay fallback**:

```js
if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)) {
    onDone(null); // ← silently failed in MAIN world
    return;
}
```

This meant:
1. `loadPromptsFromJson()` could not fetch user-saved prompts from SQLite via `GET_PROMPTS`.
2. Only bundled `__MARCO_PROMPTS__` were available (injected at script load time).
3. After any save/delete operation, reloading prompts via the extension message would fail silently.

Contrast: `sendToExtension()` (used for SAVE/DELETE) correctly had the relay fallback, so writes worked but reads did not.

### Root Cause 3: No error boundary in click handler

The `item.onclick` handler had no try/catch. If `pasteIntoEditor()` threw (e.g., due to a destroyed DOM target), the entire click handler would silently fail with no user feedback.

---

## Fix Description

### Fix 1: Exclusion-based click guard

Replaced the whitelist with an **exclusion guard** that only blocks clicks inside the `actions` container:

```js
// Before (whitelist — too restrictive):
if (e.target !== item && e.target !== nameSpan && e.target !== badge) return;

// After (exclusion — clicks anywhere except action buttons work):
if (actions.contains(e.target)) return;
```

### Fix 2: Relay fallback in `tryLoadByMessage()`

Added `window.postMessage` relay support matching the pattern already used by `sendToExtension()`:

```js
// Falls back to: window.postMessage → content script relay → chrome.runtime.sendMessage → background
var relayId = 'pl-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
window.addEventListener('message', onRelayResponse);
window.postMessage({ source: 'marco-controller', type: type, requestId: relayId }, '*');
```

This enables user-saved prompts to load from SQLite even in MAIN world, consistent with how saves already work.

### Fix 3: Content script relay allowlist

`GET_PROMPTS` was already in the relay allowlist. `FILE_SAVE/GET/LIST/DELETE` were added in the audit fix (they were missing).

---

## Prevention / Non-Regression

1. **Rule**: Never use strict-equality whitelists for click guards on complex DOM items. Use exclusion-based guards (`container.contains(e.target)`).
2. **Rule**: Any function that communicates with the background MUST support the `window.postMessage` relay fallback for MAIN world execution. Use `sendToExtension()` or match its pattern.
3. **Rule**: All message-based functions must handle the "no response" case with a visible fallback (clipboard copy + toast).

---

## Done Checklist

- [x] Issue write-up created under `/spec/02-app-issues/`
- [x] Root-cause fix applied (3 fixes)
- [ ] End-to-end verification on lovable.dev
