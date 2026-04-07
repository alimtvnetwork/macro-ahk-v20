# Issue #90 — Prompt Click Pastes Wrong Prompt Text

**Severity**: P1  
**Status**: ✅ Fixed  
**Created**: 2026-04-03  

---

## Symptom

Clicking a prompt in the dropdown injects a **different prompt's text** into the editor. The offset is typically 2 items (e.g., clicking prompt #1 pastes prompt #3).

## Root Cause

`_findPromptItemElements()` in `prompt-dropdown.ts` used **fragile CSS heuristic matching** to identify prompt items in snapshot-restored HTML:

```typescript
// BUG: matches header row AND Task Next submenu item too
return h.style.cssText.includes('text-overflow:ellipsis') ||
  (h.querySelector('span') && h.style.cssText.includes('justify-content:space-between'));
```

Both the **dropdown header** and **Task Next submenu item** have `justify-content:space-between` and contain `<span>` elements, causing them to be incorrectly identified as prompt items. This shifted the index mapping by 2, so `filtered[0]`'s click handler was bound to the header, `filtered[1]` to the Task Next row, and the actual first prompt item got `filtered[2]`'s text.

### Trigger Condition

Only occurs on the **snapshot restore path** (second+ dropdown open). The fresh render path (`_renderFresh`) binds handlers inline during creation and is unaffected.

## Fix

1. Added `data-prompt-idx` attribute to each prompt item during `renderPromptItem()` fresh creation.
2. Changed `_findPromptItemElements()` to query `[data-prompt-idx]` instead of CSS heuristics.
3. The attribute persists through innerHTML snapshot/restore, ensuring reliable identification.

## Files Changed

- `standalone-scripts/macro-controller/src/ui/prompt-dropdown.ts`
