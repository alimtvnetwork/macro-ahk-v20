# Issue 64: Prompts Loading Indicator Shown Even When Cached

**ID**: prompts-loading-when-cached  
**Status**: ✅ Fixed  
**Severity**: Medium  
**Date**: 2026-03-23  
**Version**: 1.61.0

---

## Problem

When the user clicks the **Prompts** button, it always shows "⏳ Loading prompts…" before rendering the dropdown — even when prompts are already loaded in memory or IndexedDB cache. This creates unnecessary perceived latency.

## Root Cause

In `panel-builder.ts`, the `promptsBtn.onclick` handler unconditionally clears the dropdown (`innerHTML = ''`) and appends a loading indicator before calling `loadPromptsFromJson()`. The function `loadPromptsFromJson()` already has a fast path for in-memory cache (returns synchronously), but the loading indicator is shown regardless.

```js
// panel-builder.ts — always shows loading, even when cache hit is instant
promptsBtn.onclick = function(e) {
  promptsDropdown.innerHTML = '';
  const loadingItem = document.createElement('div');
  loadingItem.textContent = '⏳ Loading prompts…';
  promptsDropdown.appendChild(loadingItem);
  loadPromptsFromJson(function(loaded) {
    renderPromptsDropdown(promptCtx, taskNextDeps);
  });
};
```

## Fix

1. **Export `isPromptsCached()`** from `prompt-manager.ts` — returns `true` if `_loadedJsonPrompts` is non-null.
2. **Pre-load prompts on injection** — call `loadPromptsFromJson()` once during panel construction (not on click), so prompts are warm in memory by the time the user clicks.
3. **Skip loading indicator** — if `isPromptsCached()` is true on click, render the dropdown directly without showing the loading spinner.

## Non-Regression Rules

1. Loading indicator MUST still appear on first cold load (no cache).
2. Clicking Prompts after initial load MUST render instantly (no spinner flash).
3. Background revalidation MUST still update the dropdown if stale data changes.

## Related Files

- `standalone-scripts/macro-controller/src/ui/panel-builder.ts` — Prompts button onclick
- `standalone-scripts/macro-controller/src/ui/prompt-manager.ts` — `loadPromptsFromJson`, cache state
