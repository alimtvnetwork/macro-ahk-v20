# Spec 52 — Prompt Caching via IndexedDB (Cache-Until-Invalidated)

## Overview

The macro controller loads prompts using a **cache-until-invalidated** pattern.
On first `GET_PROMPTS` request, data is read from the `PromptsDetails` SQLite view,
serialized to JSON, and stored in IndexedDB. Subsequent requests return cached JSON instantly.
The cache is cleared only on explicit save/delete operations — there is no time-based TTL.

## Architecture

```
GET_PROMPTS request
  │
  ├─► Check IndexedDB cache
  │     ├─► Cache exists → return cached JSON immediately
  │     └─► Cache missing → read from PromptsDetails view
  │           └─► Serialize to JSON, store in IndexedDB, return
  │
  └─► On prompt save/delete → clear IndexedDB cache
        └─► Next GET_PROMPTS re-reads from view
```

## IndexedDB Schema

- **Database name**: `marco_prompts_cache`
- **Version**: 2
- **Object store: `prompts`**
  - Key path: `id`
  - Record: `{ id: 'prompt_cache', entries: PromptEntry[], hash: string }`
- **Object store: `ui_snapshots`**
  - Key path: `id`
  - Record: `{ id: string, html: string, dataHash: string, savedAt: number }`

### PromptEntry

```ts
interface CachedPromptEntry {
  name: string;
  text: string;
  category?: string;
  isDefault?: boolean;
  isFavorite?: boolean;
  order?: number;
  id?: string;
  version?: string;
}
```

## Cache Invalidation

- On prompt save/delete → clear IndexedDB `prompts` store
- On data hash change → `ui_snapshots` store auto-invalidated
- On deploy (Deployments table `isComplete=false`) → clear all caches
- **No time-based TTL** — cache lives until explicitly invalidated

## Error Handling

- IndexedDB unavailable → fall through to direct SQLite view read
- Extension unreachable → use cached data if available
- Both fail → use hardcoded DEFAULT_PROMPTS

## Acceptance Criteria

- [ ] First dropdown open shows prompts in < 50ms (from cache)
- [ ] Save/delete prompt invalidates cache
- [ ] Next GET_PROMPTS after invalidation re-reads from SQLite view
- [ ] Works when extension is disconnected (cache-only mode)
- [ ] Deploy clears all caches for fresh state
