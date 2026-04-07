# Memory: architecture/injection-pipeline-performance-plan
Updated: 2026-03-30

## Issue 87 — Injection Pipeline Performance (≤500ms target)

The injection pipeline takes 7-8s due to sequential file reads, redundant storage calls, and serial IPC. Eight fixes planned in priority order:

1. **Phase 15.1**: Timing instrumentation (`time()` wrapper per stage, `[injection] ── TIMING ──` log)
2. **Phase 15.2**: Cache `readAllProjects()` — hoist to top of `handleInjectScripts()`, pass to 3 consumers (saves ~200-500ms)
3. **Phase 15.3**: Hoist `chrome.storage.local.get(ALL_CONFIGS)` out of per-project loop (saves ~100-300ms)
4. **Phase 15.4**: Replace `handleFileList()` + per-file `handleFileGet()` with single `SELECT Id, Filename, Data FROM ProjectFiles WHERE ProjectId = ? LIMIT 50` (saves ~3-5s, biggest win)
5. **Phase 15.5**: `Promise.all([bootstrapNamespaceRoot, ensureRelayInjected, seedTokensIntoTab])` (saves ~300-800ms)
6. **Phase 15.6**: Combine relay probe+inject into single `executeScript` call (saves ~200-500ms)
7. **Phase 15.7**: Concatenate wrapped scripts into single `executeScript` call with sequential fallback (saves ~500-1000ms)
8. **Phase 15.8**: Pre-serialize namespace blob on project save, read cached string at injection time (insurance if still >500ms)

Key constraint: sql.js is single-threaded WASM — `Promise.all` on SQLite reads provides no parallelism. Must reduce NUMBER of queries, not parallelize them.

Spec: `spec/17-app-issues/87-injection-pipeline-performance/`
