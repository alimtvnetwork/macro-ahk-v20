# Memory: features/macro-controller/prompt-caching-indexeddb
Updated: 2026-04-03

## Dual-Cache Architecture

The prompt system uses **dual-record caching** in IndexedDB (`marco_prompts_cache` database, version 3):

| Record | Store | Key | Content | Consumer |
|---|---|---|---|---|
| **JsonCopy** | `prompts` | `json_copy` | Raw `CachedPromptEntry[]` array + hash + fetchedAt | Any consumer needing structured prompt data |
| **HtmlCopy** | `prompts` | `html_copy` | Pre-rendered dropdown HTML + promptCount + dataHash | MacroController (skips rendering loops) |
| **UI Snapshot** | `ui_snapshots` | `dropdown_snapshot` | Full dropdown HTML + scroll position + category filter | Fast restore on re-open |

## Cache Invalidation

There is **no TTL or SWR**. Caches are invalidated only on:
- Explicit prompt save/delete operations (`invalidatePromptCache()` / `clearLoadedPrompts()`)
- Manual "🔄 Load" button click → `forceLoadFromDb()`

`clearPromptCache()` deletes both `JsonCopy` and `HtmlCopy` records atomically.

## Loading Strategy

1. **In-memory**: If `promptLoaderState.loadedJsonPrompts` exists, return immediately.
2. **IndexedDB (JsonCopy)**: Read from `readPromptCache()`. If found, populate in-memory and return. No background revalidation.
3. **Extension bridge**: `GET_PROMPTS` message → reads from `PromptsDetails` SQLite view → caches result as JsonCopy.
4. **Preamble fallback**: `window.__MARCO_PROMPTS__` array.
5. **Hardcoded defaults**: `DEFAULT_PROMPTS` constant.

## Manual Load Button

The prompt dropdown header includes a `🔄 Load` button that calls `forceLoadFromDb()`:
1. Clears in-memory cache, JsonCopy, HtmlCopy, and UI snapshot.
2. Fetches fresh data from the extension bridge (SQLite DB).
3. Re-caches and re-renders the dropdown.

## HtmlCopy Usage

After each fresh render, `prompt-dropdown.ts` saves the rendered HTML as HtmlCopy via `saveHtmlCopy()`. MacroController can restore from HtmlCopy to avoid re-rendering the full dropdown DOM.

## Key Files

- `src/ui/prompt-cache.ts` — IndexedDB dual-record read/write/clear (generic helpers)
- `src/ui/prompt-loader.ts` — Loading strategy, `forceLoadFromDb()`, `saveHtmlCopy()`
- `src/ui/prompt-dropdown.ts` — Render + Load button + HtmlCopy save

Spec: `spec/11-chrome-extension/52-prompt-caching-indexeddb.md`
