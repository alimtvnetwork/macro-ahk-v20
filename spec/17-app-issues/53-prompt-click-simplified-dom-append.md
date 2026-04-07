# Issue 53: Prompt Click Only Works for 2nd Item — Simplified to DOM Append

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: Fixed

---

## Issue Summary

### What happened

In the macro controller prompts dropdown, clicking the first prompt item does nothing. Clicking the second item works. Clicking items 3+ also does nothing. Only the second item in the list reliably triggers prompt injection.

### Where it happened

- **Feature**: Macro controller prompts dropdown (`standalone-scripts/macro-controller/01-macro-looping.js`)
- **Functions**: `pasteIntoEditor()`, `item.onclick` in `renderPromptsDropdown()`

### Symptoms and impact

- 1st prompt click: no response
- 2nd prompt click: works correctly
- 3rd+ prompt clicks: no response
- Core prompt injection workflow broken for most items

### How it was discovered

User report during manual testing.

---

## Root Cause Analysis

### Root Cause: Over-engineered paste strategy chain

The `pasteIntoEditor()` function used a 4-strategy fallback chain (synthetic ClipboardEvent → clipboard API + execCommand → chunked insertText → direct DOM set). This approach:

1. **Relied on browser clipboard APIs** which behave inconsistently across injection contexts (MAIN world, ISOLATED world, extension popup).
2. **Used `dispatchEvent()` return values** as success indicators, which are unreliable for ProseMirror editors.
3. **Cleared content before insertion** (`clearTargetContent`), destroying ProseMirror state and causing the first insertion to silently fail.
4. **Had cascading state corruption**: Strategy failures left the editor in inconsistent states, causing subsequent strategies to also fail unpredictably.

The reason only the 2nd item worked was likely due to ProseMirror recovering its internal state after the first failed attempt's side effects (event dispatches, selection manipulation).

---

## Fix Description

### Complete replacement with DOM append

Replaced the entire 4-strategy paste system with a simple, reliable approach:

```js
// For contenteditable (ProseMirror/Tiptap):
var p = document.createElement('p');
p.textContent = text;
target.appendChild(p);
target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
```

Key design decisions:
1. **Append, never replace**: Creates a `<p>` tag and appends it to the editor. Does not clear existing content.
2. **No clipboard APIs**: Zero reliance on `ClipboardEvent`, `navigator.clipboard`, or `document.execCommand`. Just DOM manipulation.
3. **Cursor positioning**: Moves cursor to end of appended content via `Selection` API.
4. **Fallback**: If editor not found, copies text to clipboard with toast notification.
5. **Textarea/input support**: For non-contenteditable targets, appends text to `.value`.

### Removed unused functions

- `clearTargetContent()` — no longer clearing before insert
- `getTargetTextLength()` — no longer verifying paste length
- `directSet()` — replaced by inline append logic

---

## Prevention / Non-Regression

1. **Rule**: Prompt insertion must use direct DOM append (`createElement('p')` + `appendChild`), never clipboard-based strategies.
2. **Rule**: Never clear editor content before prompt insertion — always append.
3. **Rule**: Keep insertion logic simple and testable. If it needs more than 20 lines, it's over-engineered.

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root-cause fix applied
- [ ] End-to-end verification on lovable.dev
