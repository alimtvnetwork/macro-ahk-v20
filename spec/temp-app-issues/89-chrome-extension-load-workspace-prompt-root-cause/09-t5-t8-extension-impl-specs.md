# T5-T8: Extension-Side Performance Fixes — Implementation Specs

**Parent:** [07-task-list.md](./07-task-list.md)
**Status:** ✅ All implemented
**Target repo:** Chrome extension project (not in this repository)

---

## T5: Script Caching Optimization

### Objective
Pre-cache ALL injection scripts during extension boot, not just SDK and XPath.

### Target File
`src/background/boot.ts` → `precacheStableScripts()`

### Current Behavior
```typescript
// boot.ts lines ~161-164
async function precacheStableScripts() {
  await cacheScript('marco-sdk.js');
  await cacheScript('xpath.js');
  // macro-looping.js is NOT pre-cached
}
```

### Required Change
```typescript
async function precacheStableScripts() {
  // Pre-cache ALL stable scripts in parallel
  await Promise.all([
    cacheScript('marco-sdk.js'),
    cacheScript('xpath.js'),
    cacheScript('macro-looping.js'),  // ADD: main controller bundle
  ]);
}
```

### Acceptance Criteria
- `macro-looping.js` is cached during `chrome.runtime.onInstalled` and `chrome.runtime.onStartup`
- Cache hit rate logged: `[Boot] Pre-cached N scripts in Xms`
- Cold injection no longer triggers `fetch(chrome.runtime.getURL('macro-looping.js'))`

---

## T6: Batch chrome.storage.local Reads

### Objective
Combine separate `chrome.storage.local.get()` calls into a single batched read.

### Target File
`src/background/script-resolver.ts`

### Current Behavior
```typescript
// Two separate IPC calls (~50-100ms each)
const scripts = await readScriptStore();     // chrome.storage.local.get('ALL_SCRIPTS')
const configs = await readConfigStore();     // chrome.storage.local.get('ALL_CONFIGS')
```

### Required Change
```typescript
// Single batched IPC call (~50-100ms total)
async function readStoresParallel(): Promise<{ scripts: ScriptStore; configs: ConfigStore }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ALL_SCRIPTS', 'ALL_CONFIGS'], (result) => {
      resolve({
        scripts: result.ALL_SCRIPTS || { bindings: [] },
        configs: result.ALL_CONFIGS || {},
      });
    });
  });
}
```

### Additional Batching Opportunities
- Per-project config reads (e.g., `project_{id}_config`) can be included in the same `.get()` call if the project ID is known at resolution time.
- `chrome.storage.local.get(null)` reads ALL keys — viable if total storage is small (<1MB).

### Acceptance Criteria
- Only ONE `chrome.storage.local.get()` call in the critical path
- Log: `[ScriptResolver] Batch storage read: Xms (N keys)`
- Measured reduction: ~50-100ms saved

---

## T7: Concatenate Scripts for Single Injection

### Objective
Combine all resolved scripts into a single IIFE string and inject via one `chrome.scripting.executeScript()` call.

### Target File
`src/background/inject-scripts-handler.ts`

### Current Behavior
```typescript
// Stage 4: Per-script injection (3-4 calls × 200-300ms each)
for (const script of resolvedScripts) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: new Function(script.code),
  });
}
```

### Required Change
```typescript
// Concatenate into single IIFE with error isolation
function concatenateScripts(scripts: ResolvedScript[]): string {
  const parts = scripts.map((s, i) => {
    return `
/* === Script ${i}: ${s.name} === */
try {
  (function() {
    ${s.code}
  })();
} catch (__e) {
  console.error('[MacroInjection] Script ${i} (${s.name}) failed:', __e);
}`;
  });
  return parts.join('\n');
}

// Single injection call
const concatenated = concatenateScripts(resolvedScripts);
await chrome.scripting.executeScript({
  target: { tabId },
  func: new Function(concatenated),
});
```

### Error Isolation
- Each script is wrapped in its own `try/catch` IIFE
- If script N fails, scripts N+1...M still execute
- Errors are logged with script name and index

### Fallback
If concatenated injection fails (e.g., CSP violation), fall back to sequential per-script injection:
```typescript
try {
  await injectConcatenated(tabId, resolvedScripts);
} catch (e) {
  console.warn('[Injection] Concatenated failed, falling back to sequential:', e);
  await injectSequential(tabId, resolvedScripts);
}
```

### Acceptance Criteria
- Only ONE `chrome.scripting.executeScript()` call in normal path
- Error in script A does not prevent script B from running
- Sequential fallback activates on concatenation failure
- Log: `[Injection] Injected N scripts in single call (Xms)`

---

## T8: Parallel Stage 2 Injection

### Objective
Run Stage 2 operations (`bootstrapNamespaceRoot`, `ensureRelayInjected`, `seedTokensIntoTab`) in parallel.

### Target File
`src/background/inject-scripts-handler.ts`

### Current Behavior
```typescript
// Stage 2: Sequential (each ~100-200ms)
await bootstrapNamespaceRoot(tabId);
await ensureRelayInjected(tabId);
await seedTokensIntoTab(tabId);
```

### Required Change
```typescript
// Stage 2: Parallel (total ~200ms instead of ~400-600ms)
await Promise.all([
  bootstrapNamespaceRoot(tabId),
  ensureRelayInjected(tabId),
  seedTokensIntoTab(tabId),
]);
```

### Safety Check
These three operations must be verified as independent:
- `bootstrapNamespaceRoot` → creates `window.marco` namespace object
- `ensureRelayInjected` → injects content script relay for `postMessage`
- `seedTokensIntoTab` → writes auth token to `window.__MARCO_TOKEN__`

**Potential dependency:** If relay injection or token seeding depends on the namespace root existing first, then `bootstrapNamespaceRoot` must complete first:
```typescript
// Safe alternative if dependency exists
await bootstrapNamespaceRoot(tabId);
await Promise.all([
  ensureRelayInjected(tabId),
  seedTokensIntoTab(tabId),
]);
```

### Acceptance Criteria
- Stage 2 completes in ≤200ms (down from ~400-600ms)
- All three operations succeed (verify in e2e test)
- Log: `[Injection] Stage 2 parallel: Xms`

---

## Combined Impact Estimate

| Optimization | Cold Start Savings | Warm Start Savings |
|-------------|-------------------|-------------------|
| T5: Pre-cache all scripts | ~500ms | 0ms |
| T6: Batch storage reads | ~100ms | ~100ms |
| T7: Single executeScript | ~600ms | ~600ms |
| T8: Parallel Stage 2 | ~300ms | ~300ms |
| **Total** | **~1500ms** | **~1000ms** |

Expected results:
- Cold start: 7-8s → ~5-6s (with additional savings from other fixes)
- Warm start: 3-5s → ~2-3s

---

```
Do you understand? Can you please do that?
```
