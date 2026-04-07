# Issue 87 — Injection Pipeline Performance Optimization

**Target**: ≤500ms total injection latency (from ~7-8s)  
**Primary file**: `src/background/handlers/injection-handler.ts`  
**Reference**: `optimization-guide.md` (uploaded spec)  
**Created**: 2026-03-30

---

## Implementation Phases

### Phase 1: Timing Instrumentation (Fix #8)
**Risk: None | Savings: Diagnostic baseline**

Add a `time()` helper inside `handleInjectScripts()` that wraps each stage with `performance.now()` deltas. Log a structured `[injection] ── TIMING ──` line at pipeline end with per-stage breakdown. This is required before any other fix to measure impact.

**Files**: `injection-handler.ts`

---

### Phase 2: Cache `readAllProjects()` (Fix #2)
**Risk: Very Low | Savings: ~200-500ms**

Hoist `readAllProjects()` to top of `handleInjectScripts()`, pass result to `prependDependencyScripts()`, `injectSettingsNamespace()`, and `injectProjectNamespaces()` as a parameter. Remove 3 redundant `chrome.storage.local` reads.

**Files**: `injection-handler.ts`

---

### Phase 3: Hoist Config Storage Read (Fix #3)
**Risk: Very Low | Savings: ~100-300ms**

Move `chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS)` from inside the per-project loop (line 522) to before the loop in `injectProjectNamespaces()`. Pass `allConfigs` into each iteration.

**Files**: `injection-handler.ts`

---

### Phase 4: Bulk File Query (Fix #1 — Modified)
**Risk: Low | Savings: ~3-5s**

Add `handleFileGetBulkByProject()` to `file-storage-handler.ts`:
```sql
SELECT Id, Filename, Data FROM ProjectFiles WHERE ProjectId = ? LIMIT 50
```
This replaces BOTH `handleFileList()` + per-file `handleFileGet()` loop with a single SQL query. Column names are PascalCase per schema convention.

Replace the sequential loop in `injectProjectNamespaces()` (lines 501-518) with one call per project.

**Files**: `file-storage-handler.ts`, `injection-handler.ts`

---

### Phase 5: Parallelize Stages 1.5 / 2a / 2b (Fix #4)
**Risk: Low | Savings: ~300-800ms**

Wrap `bootstrapNamespaceRoot()`, `ensureRelayInjected()`, `seedTokensIntoTab()` in `Promise.all()`. These target different worlds (MAIN, ISOLATED, HTTP) and share no state. `Promise.all` ensures all three complete before Stage 3.

**Files**: `injection-handler.ts`

---

### Phase 6: Optimize Relay Probe (Fix #5)
**Risk: Very Low | Savings: ~200-500ms**

Combine probe + inject into a single `chrome.scripting.executeScript` call that checks the sentinel AND returns status. Reduce from 2-4 IPC round-trips to 1-2.

**Files**: `injection-handler.ts`

---

### Phase 7: Batch Script Injection (Fix #7)
**Risk: Medium | Savings: ~500-1000ms**

Concatenate wrapped scripts (without CSS assets) into a single `executeScript` call. Scripts with CSS assets inject CSS first, then JS individually. Include sequential fallback on concatenated injection failure.

**Files**: `injection-handler.ts`

---

### Phase 8: Pre-Serialize Namespace on Save (Fix #6)
**Risk: Medium | Savings: Moves remaining cost to save-time**

Only implement if still over 500ms after phases 1-7. Store pre-built namespace scripts in `chrome.storage.local` keyed by `ns_cache_<projectId>`. Invalidate on file/config/script/metadata changes. At injection time, read cached string and inject directly.

**Files**: `file-storage-handler.ts`, project save handlers, `injection-handler.ts`

---

## Expected Cumulative Impact

| After Phase | Est. Total Latency |
|---|---|
| Baseline | ~7-8s |
| Phase 1 (timing) | ~7-8s (no change, diagnostic) |
| Phase 2 (cache projects) | ~6.5s |
| Phase 3 (hoist configs) | ~6.2s |
| Phase 4 (bulk file query) | ~2s |
| Phase 5 (parallel stages) | ~1.4s |
| Phase 6 (relay optimize) | ~1.0s |
| Phase 7 (batch injection) | ~0.5s |
| Phase 8 (pre-serialize) | ~0.3s |

---

## Verification

After each phase, check:
1. `[injection] ── TIMING ──` console log shows improvement
2. `RiseupAsiaMacroExt.Projects.<CodeName>` accessible in console
3. File cache populated via `.files.list()`
4. Dependency injection order preserved
5. No regression on CSP-restricted pages
