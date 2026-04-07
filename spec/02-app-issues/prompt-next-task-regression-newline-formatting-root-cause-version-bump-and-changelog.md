# Prompt Next-Task Regression & Newline Formatting — Root Cause Analysis

**Status:** ✅ Fixed in v2.105.0 (extension v1.75.0)
**Created:** 2026-04-07

---

## Issue 01: Next Task Regression — Start Prompt Returned Instead of Next Tasks

### Symptom

When using "Task Next", the start prompt (order 1, first entry) is injected instead of the "Next Tasks" prompt (slug: `next-tasks`, order 13). This occurs every time, making the feature unusable.

### Working Reference

Version 1.7.32 (macro-controller) — next task correctly resolved the `next-tasks` slug prompt.

### Root Cause — Technical

**File:** `standalone-scripts/macro-controller/src/ui/prompt-utils.ts`
**Function:** `normalizePromptEntries()`

The normalization function stripped `id`, `slug`, `isDefault`, and `order` fields from prompt entries during loading. Only `name`, `text`, `category`, and `isFavorite` were preserved.

```typescript
// BEFORE (broken) — line 23-28 of prompt-utils.ts
const entry: PromptEntry = { name, text };
if (raw.category) { entry.category = raw.category; }
if (raw.isFavorite) { entry.isFavorite = true; }
// ❌ slug, id, isDefault — ALL DROPPED
```

**File:** `standalone-scripts/macro-controller/src/ui/task-next-ui.ts`
**Function:** `findNextTasksPrompt()`

This function uses a 5-priority resolution waterfall:
1. Exact `slug` field match → **always fails** (slug is undefined)
2. Exact `id` field match → **always fails** (id is undefined)
3. Derived slug from `name` → matches only if name is exactly "Next Tasks" → **fragile**
4. Keyword match (`next` + `task` in name) → **fragile**
5. **Last resort: `entries[0]`** → returns the start prompt (order 1)

Because priorities 1 and 2 always fail (fields stripped), the function falls through to the last resort, returning the first prompt in the array — which is the start prompt.

### Root Cause — Process

1. `normalizePromptEntries` was written as a minimal sanitizer and was never updated when `slug`/`id` fields were added to `PromptEntry`.
2. No regression test existed to validate that slug-based prompt resolution works end-to-end.
3. The "last resort" fallback silently returned a wrong prompt without an explicit warning that slug matching failed.

### Fix Applied

`normalizePromptEntries` now preserves `id`, `slug`, and `isDefault` fields:

```typescript
if (raw.id) { entry.id = raw.id; }
if (raw.slug) { entry.slug = raw.slug; }
if (raw.isDefault !== undefined) { entry.isDefault = raw.isDefault; }
```

### Prevention

- The `PromptEntry` interface defines `id`, `slug`, `isDefault` — normalization must always mirror the interface fields.
- `findNextTasksPrompt` logs which priority level matched, making silent fallbacks visible.

---

## Issue 02: Excessive Newlines in Large Prompts

### Symptom

Large prompts (e.g., "Unit Test Issues V2 Enhanced", 253 lines) contain multiple consecutive blank lines between sections. When pasted into the editor, the excessive whitespace makes the output unreadable.

### Root Cause — Technical

**File:** `standalone-scripts/macro-controller/src/ui/prompt-utils.ts`
**Function:** `pasteIntoEditor()`

The function accepted raw prompt text and injected it as-is, with no newline normalization. Prompt source files (`.md`) often contain intentional double-blank-lines for section separation, but the editor does not need more than one blank line between paragraphs.

### Fix Applied

1. Added `normalizeNewlines()` utility: collapses 3+ consecutive newlines to exactly 2 (preserving single blank line paragraph spacing).
2. `pasteIntoEditor()` now normalizes text before injection.

```typescript
export function normalizeNewlines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
```

### Prevention

- All prompt text passes through `normalizeNewlines` before editor injection.
- The `htmlToMarkdown` converter already had a similar rule (line 30) but only for its own output — now paste also normalizes.

---

## Pipeline Stage Trace

| Stage | Component | Input | Output | Issue |
|-------|-----------|-------|--------|-------|
| 1. Source | `prompts/13-next-tasks/info.json` | slug: `next-tasks` | ✅ Correct | — |
| 2. Build | `AggregatePrompts.mjs` | info.json + prompt.md | JSON with slug field | ✅ Correct |
| 3. Load | `prompt-loader.ts` → `normalizePromptEntries()` | JSON array with slug | **Array WITHOUT slug** | 🔴 **Fields stripped here** |
| 4. Resolve | `findNextTasksPrompt()` | entries without slug | Falls to `entries[0]` | 🔴 **Wrong prompt selected** |
| 5. Paste | `pasteIntoEditor()` | Raw text with 3+ newlines | Pasted as-is | 🟡 **No normalization** |

---

## Version

- Macro Controller: 2.104.0 → **2.105.0**
- Extension: 1.74.0 → **1.75.0**

```
Do you understand? Always add this part at the end of the writing inside the code block. Do you understand? Can you please do that?
```