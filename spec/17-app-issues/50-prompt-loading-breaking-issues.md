# Issue 50: Prompt Loading Breaking Issues — Historical Analysis

**Created**: 2026-03-21  
**Status**: Resolved (documenting for prevention)  

---

## Issue Summary

1. **What happened**: Prompt functionality broke multiple times during development — prompts failed to load, showed stub text, paste failed silently, and the dropdown rendered empty on first click.
2. **Where**: Macro controller prompt dropdown, Chrome extension prompt handler, content script relay
3. **Symptoms**:
   - First click on prompts showed nothing (empty dropdown or stub text)
   - Paste into chatbox failed silently — text went to clipboard only
   - After editing/saving a prompt, it disappeared or duplicated
   - Category filter showed wrong prompts after save
4. **How discovered**: End-to-end user testing

---

## Root Cause Analysis

### Issue A: First-Click Race Condition

**Direct cause**: `promptsBtn.onclick` opened the dropdown (`display: block`) immediately, then started `loadPromptsFromJson()` asynchronously. On the first click, `_loadedJsonPrompts` was `null`, so `getPromptsConfig()` fell back to `DEFAULT_PROMPTS` which contained stub text prefixed with `"(Full text in macro-prompts.json)"`.

**Contributing factors**:
- No loading state in dropdown
- Fallback prompts were stubs, not real content
- No feedback when async load was still in progress

**Fix applied**: Show "Loading…" spinner in dropdown on first open. Only render prompt items after `loadPromptsFromJson` callback resolves. Strip stub prefix from fallback prompts.

### Issue B: Paste Failure (Silent)

**Direct cause**: `pasteIntoEditor()` used a complex multi-strategy approach: clipboard API → execCommand → synthetic paste event → direct DOM manipulation. Each strategy could fail silently:
- `dispatchEvent(pasteEvent)` returned `true` (not consumed) but `pasted` stayed `false`
- `clearTargetContent()` cleared the chatbox but synthetic paste failed
- Text ended up on clipboard only with no visible feedback

**Fix applied**: Replaced complex clipboard strategies with direct DOM append. Create a `<p>` tag with prompt text, append to editor, dispatch `InputEvent` for reactivity. Added toast notification on paste failure: "Copied to clipboard — paste manually with Ctrl+V".

### Issue C: Storage Quota Exceeded

**Direct cause**: Prompts were stored in `chrome.storage.local` which has a ~5MB limit. Large prompts (like Unified AI Prompt v4 at ~15KB) combined with other extension data exceeded the quota.

**Fix applied**: Migrated prompt storage to SQLite (`logs.db` → `prompts` table). Added 50KB max per prompt limit. Legacy prompts auto-migrated from `chrome.storage.local` on first load.

### Issue D: Category Filter State Mismatch

**Direct cause**: After saving a prompt with a new category, the `categoryFilter` state was not reset. If the filter was set to a category that no longer contained the edited prompt, the prompt disappeared from view.

**Fix applied**: Reset `categoryFilter` to `"all"` after save operations. Derive categories from current prompt list using `useMemo`.

---

## Prevention and Non-Regression

### Prevention Rules

1. **Never show dropdown without data ready** — always show loading state until async data resolves
2. **Never use silent fallbacks for paste** — always provide user feedback (toast) on failure
3. **Never store large data in chrome.storage.local** — use SQLite for anything > 1KB per record
4. **Always reset filter state after CRUD operations** — prevents "invisible" items
5. **DOM append strategy for prompt injection** — avoid clipboard API, execCommand, synthetic paste events

### Regression Detection

1. Test: Click prompts button on fresh page → should show loading spinner then prompts (never empty)
2. Test: Click a prompt → should appear in chatbox (never silently fail)
3. Test: Save a large prompt (10KB+) → should succeed without quota error
4. Test: Save prompt with new category → should be visible regardless of current filter

### References

- `spec/11-chrome-extension/45-prompt-manager-crud.md` — CRUD spec
- `spec/17-app-issues/41-options-ui-and-prompts-critical-issues.md` — Previous Options UI issues
- `src/background/handlers/prompt-handler.ts` — SQLite-based prompt handler
- `standalone-scripts/macro-controller/01-macro-looping.js` — Macro controller prompt injection

---

## Iterations History

### Iteration 1: Clipboard API approach
- **Tried**: `navigator.clipboard.writeText()` + synthetic paste event
- **Failed**: CSP blocked clipboard API on some pages; paste event not consumed by React editor

### Iteration 2: execCommand('insertText')
- **Tried**: `document.execCommand('insertText', false, text)`
- **Failed**: Deprecated API, inconsistent across browsers, didn't trigger React's onChange

### Iteration 3: Direct DOM append (current — working)
- **Approach**: Create `<p>` element, set `textContent`, append to editor div, dispatch `InputEvent`
- **Result**: Works reliably, triggers React state updates, no clipboard dependency

---

## Done Checklist

- [x] Issue documented under `/spec/17-app-issues/`
- [x] Root cause analysis complete for all 4 sub-issues
- [x] Prevention rules documented
- [x] Regression test scenarios defined
- [x] Memory updated with prompt injection strategy
- [x] Current implementation is working (as of v1.49.0)
