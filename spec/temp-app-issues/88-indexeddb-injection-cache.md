# Issue 88 — IndexedDB Injection Cache & Script UI Not Loading

**Version**: v1.74.0  
**Date**: 2026-03-30  
**Status**: In Progress  
**Severity**: P1  

---

## 1. Problem Statement

### 1.1 Script UI Not Loading (Root Cause Analysis)

**Symptom**: The injected macro controller UI does not render on the target page.

**Root Cause**: `resolveScriptCode()` in `src/background/script-resolver.ts` fetches script code from `chrome.runtime.getURL(script.filePath)` (e.g., `projects/scripts/macro-controller/macro-looping.js`). When the build artifacts are not present in `dist/projects/scripts/` — due to a stale deploy, missing build step, or file copy failure — the fetch fails silently and falls back to `script.code`, which is a lightweight stub:

```js
console.error("[macro-looping] STUB: Script not loaded from web_accessible_resources. filePath fetch failed.");
```

This stub contains no UI creation logic, so the macro controller panel never renders. The failure is **silent** — there is no user-facing indication that the real script wasn't loaded, only a console.error that users typically don't see.

**Contributing factors**:
1. No caching of previously successful script fetches — every injection re-fetches from disk
2. `chrome.storage.local` reads for scripts/configs/projects add latency and can fail under quota pressure
3. No persistent diagnostic when stub fallback occurs

### 1.2 Performance & Reliability

Scripts, configs, and project metadata are read from `chrome.storage.local` on every injection. This has:
- **Serialization overhead**: JSON parse/stringify for large script blobs (100KB+)
- **Quota pressure**: 10MB total limit shared across all data
- **No offline resilience**: If storage is corrupted, everything fails

---

## 2. Solution: IndexedDB Injection Cache

### 2.1 Why IndexedDB over chrome.storage.local

| Feature | chrome.storage.local | IndexedDB |
|---------|---------------------|-----------|
| Max size | ~10MB total | Essentially unlimited |
| Serialization | JSON (slow for blobs) | Structured clone (fast) |
| Async API | Callback/Promise | Transaction-based |
| Large blob support | Poor (quota pressure) | Excellent |
| Persistence | Extension lifecycle | Browser lifecycle |

IndexedDB is the correct choice for caching large script code blobs and project metadata.

### 2.2 Cache Scope

Everything needed for injection is cached:
- **scripts**: `StoredScript[]` from `marco_scripts`
- **configs**: `StoredConfig[]` from `marco_configs`  
- **projects**: `StoredProject[]` from `marco_projects`
- **script_code**: Individual resolved script code by filePath (from `web_accessible_resources` fetch)
- **namespace**: Pre-built namespace blobs (from namespace-cache)
- **settings**: Extension settings

### 2.3 Cache Invalidation

| Trigger | Mechanism |
|---------|-----------|
| Extension version bump | `chrome.runtime.onInstalled` with `reason === "update"` |
| Fresh install | `chrome.runtime.onInstalled` with `reason === "install"` |
| Deploy (run.ps1 -d) | Version bump triggers onInstalled |
| Manual | User clicks "Invalidate Cache" button in popup |
| Data change | Individual cache entries invalidated on save/delete |

### 2.4 Integration Points

1. **`script-resolver.ts`**: Check IndexedDB cache before `fetch()` for script code; cache on successful fetch
2. **`injection-handler.ts`**: Cache `readAllProjects()`, configs reads in IndexedDB
3. **`default-project-seeder.ts`**: Invalidate cache on re-seed
4. **Popup footer**: "Invalidate Cache" button with entry count badge

---

## 3. Tasks

| # | Task | Status |
|---|------|--------|
| 88.1 | Create `injection-cache.ts` with IndexedDB CRUD + clear | ✅ |
| 88.2 | Wire script code caching into `script-resolver.ts` | ✅ |
| 88.3 | Wire deploy invalidation into `onInstalled` listener | ✅ |
| 88.4 | Add `INVALIDATE_CACHE` message type + handler | ✅ |
| 88.5 | Add "Invalidate Cache" button to popup footer | ✅ |
| 88.6 | Document root cause of UI not loading | ✅ |

---

## 4. Acceptance Criteria

1. [x] Script code is cached in IndexedDB after first successful fetch
2. [x] Subsequent injections read from IndexedDB cache (skip fetch)
3. [x] Cache is cleared on extension update/install
4. [x] Manual "Invalidate Cache" button in popup clears all entries
5. [x] Cache miss falls through to existing fetch → stub fallback
6. [x] Root cause of UI not loading is documented
