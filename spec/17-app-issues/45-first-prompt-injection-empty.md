# Issue 45: First Prompt Injection Renders Empty in Chatbox

**Version**: v1.48.0
**Date**: 2026-03-19 (updated 2026-03-20)
**Status**: Fixed

---

## Issue Summary

### What happened

When injecting prompts via the prompt chain system, the first prompt appears empty in the Lovable chatbox. Only the second (and subsequent) prompts inject successfully.

### Where it happened

- **Feature**: Prompt injection (content-script `prompt-injector.ts` + background `prompt-chain-handler.ts`)
- **Component**: `injectPromptInPage()` function in `prompt-chain-handler.ts`
- **Component**: `tryDirectDomSet()` and `tryExecCommandInsert()` in `prompt-injector.ts`

### Symptoms and impact

- First prompt in a chain is blank in the chatbox
- Second and subsequent prompts work correctly
- Breaks single-prompt injection workflows entirely
- Users must inject twice to get any content

### How it was discovered

User report during manual testing of prompt injection.

---

## Root Cause Analysis

### Root Cause 1 (Original — Fixed in v1.47): Clearing via `textContent = ""`

The `injectPromptInPage()` function cleared the editor with `editor.textContent = ""`, which destroyed ProseMirror/Tiptap's internal state (DOM transaction model, selection state, decorations). After clearing, Strategy 1's `dispatchEvent()` returned `true` (event wasn't cancelled) but **no content was inserted**.

**Fix (v1.47)**: Replaced clearing with append mode — move cursor to end instead of clearing.

### Root Cause 2 (Remaining — Fixed in v1.48): Fallback strategies still used `textContent`

Even after the v1.47 fix, the **fallback strategies** (Strategy 3/4) still directly manipulated `textContent`:

```ts
// prompt-chain-handler.ts Strategy 3:
el.textContent = (el.textContent ?? "") + chunk;  // ← Destroys ProseMirror state

// prompt-injector.ts Strategy 4:
editor.textContent = text;  // ← Destroys ProseMirror state
```

When Strategies 1-2 failed (e.g., due to timing, focus issues, or editor not ready), the fallback would:
1. Set `textContent` directly → destroys ProseMirror's internal state
2. ProseMirror re-renders and recovers on the NEXT interaction
3. Second injection works because the editor has recovered

### Root Cause 3 (Remaining — Fixed in v1.48): `tryExecCommandInsert` lacked verification

In `prompt-injector.ts`, Strategy 3 (`tryExecCommandInsert`) returned `document.execCommand("insertText")` result WITHOUT verifying content length. `execCommand` can return `true` even when the editor didn't accept the input (ProseMirror may ignore the command).

---

## Fix Description (v1.48)

### Fix 1: Replace `textContent` in all fallback strategies

**`prompt-chain-handler.ts` Strategy 3**: Replaced `el.textContent = ... + chunk` with:
```ts
el.focus();
const selObj = window.getSelection();
selObj.selectAllChildren(el);
selObj.collapseToEnd();
document.execCommand("insertText", false, chunk);
```

**`prompt-injector.ts` Strategy 4**: Replaced `editor.textContent = text` with:
```ts
document.execCommand("selectAll", false);
document.execCommand("insertText", false, text);
```

### Fix 2: Add verification to `tryExecCommandInsert`

Added post-insert length check:
```ts
const lengthBefore = getEditorLength(editor);
const result = document.execCommand("insertText", false, text);
return result && getEditorLength(editor) > lengthBefore;
```

---

## Prevention / Non-Regression

- **Rule**: Never use `textContent = ""`, `textContent = text`, or `innerHTML = ""` on a ProseMirror/Tiptap editor — always use `execCommand("selectAll")` + `execCommand("delete")` or `execCommand("insertText")`.
- **Rule**: After any paste/insert strategy, verify content length changed before returning success.
- **Rule**: Every insertion strategy function must include a `getEditorLength` pre/post check.

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root-cause fix applied (v1.47: clearing fix)
- [x] Remaining fixes applied (v1.48: fallback strategies + verification)
- [ ] End-to-end verification
