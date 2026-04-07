# RC-01: Extension Startup Delay

**Parent:** [01-overview.md](./01-overview.md)
**Status:** 🔴 Open

---

## Symptom

Clicking a script in the extension popup causes a 7-8 second delay before the macro controller UI appears on the page. Warm starts are 3-5 seconds.

## Suspected Root Causes

### RCA-1: Sequential script resolution with fetch() fallback

`resolveScriptBindings()` iterates bindings serially. For each script, `resolveScriptCode()` checks IndexedDB, then falls back to `fetch(chrome.runtime.getURL(filePath))`. On a cache miss (first load after deploy), each fetch takes 200-500ms.

**Evidence:** `script-resolver.ts` lines 33-89 show sequential resolution.

### RCA-2: Multiple chrome.storage.local.get() calls

- `readScriptStore()` reads `ALL_SCRIPTS`
- `readConfigStore()` reads `ALL_CONFIGS`
- Per-project config reads in the injection pipeline

Each `chrome.storage.local.get()` call costs ~50-100ms (IPC overhead).

**Evidence:** `script-resolver.ts` lines 375-390 show separate reads.

### RCA-3: Serial executeScript calls (Stage 4)

Each script is injected via a separate `chrome.scripting.executeScript()` call. With 3-4 scripts (SDK, XPath, macro-controller, + deps), this adds 500-1000ms.

**Evidence:** Pipeline stages spec (memory) describes Stage 4 as per-script injection.

### RCA-4: Boot pre-caching not covering all scripts

`precacheStableScripts()` in `boot.ts` only caches `marco-sdk.js` and `xpath.js`. The main `macro-looping.js` bundle is NOT pre-cached during boot, causing a cache miss on first injection.

**Evidence:** `boot.ts` lines 161-164 — only 2 stable scripts pre-cached.

### RCA-5: Token readiness wait

`ensureTokenReady(2000)` in startup.ts blocks workspace loading for up to 2s. Previous value was 4s (reduced from 6s in Issue #84). Token is usually available immediately from localStorage.

**Evidence:** `startup.ts` line 258.

## Proposed Fix Path

1. **Boot pre-cache ALL scripts** — include `macro-looping.js` in `precacheStableScripts()` or add a separate "precache all project scripts" step.
2. **Batch chrome.storage.local.get()** — read `ALL_SCRIPTS` + `ALL_CONFIGS` in a single `.get([key1, key2])` call.
3. **Concatenate scripts into single executeScript** — combine all wrapped scripts and inject once (Phase 15.7 from performance plan).
4. **Parallel Stage 2** — run `bootstrapNamespaceRoot + ensureRelay + seedTokens` in `Promise.all()` (Phase 15.5).
5. **Reduce token wait** — try 500ms with immediate fallback to localStorage check.

## Impact

Users experience unresponsive extension. Primary complaint.

## Acceptance Criteria

- [ ] Cold start (first injection after deploy) completes in ≤1000ms
- [ ] Warm start (cached scripts) completes in ≤500ms
- [ ] Timing instrumentation logs each stage duration to console
