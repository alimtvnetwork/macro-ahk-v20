# Task List — Issue #89

**Status:** Tasks prepared — awaiting "next" to execute one at a time.

---

## Task Sequence

| # | Task | Priority | Depends On | Status |
|---|------|----------|------------|--------|
| T1 | ✅ Create main spec and root cause entries | P0 | — | ✅ Done |
| T2 | ✅ Implement startup DOM toast (RC-02 fix) | P0 | — | ✅ Done |
| T3 | ✅ Add prompt loading diagnostics and fix pre-warm flow (RC-04) | P0 | — | ✅ Done |
| T4 | ✅ Investigate and fix workspace loading failure (RC-03) | P1 | — | ✅ Done |
| T5 | ✅ Implement script caching optimization (RC-01 partial) | P1 | — | ✅ Spec created |
| T6 | ✅ Batch chrome.storage.local reads (RC-01 partial) | P1 | T5 | ✅ Spec created |
| T7 | ✅ Concatenate scripts into single executeScript (RC-01 partial) | P2 | T6 | ✅ Spec created |
| T8 | ✅ Parallel Stage 2 injection (RC-01 partial) | P2 | T5 | ✅ Spec created |
| T9 | ✅ Correct spec sequencing (RC-05) | P2 | — | ✅ Done |
| T10 | ✅ Add timing instrumentation across full pipeline | P1 | T2 | ✅ Done |

---

## Task Details

### T2: Implement startup DOM toast (FIRST UX FIX)

- Add a standalone DOM-based toast in `startup.ts` `bootstrap()` that appears immediately
- Does NOT depend on SDK `window.marco.notify`
- Uses simple inline styles (fixed position, bottom-right)
- Dismissed when SDK toast system becomes available
- Falls back to auto-dismiss after 10s if SDK never loads
- **Files:** `standalone-scripts/macro-controller/src/startup.ts`, `standalone-scripts/macro-controller/src/toast.ts`

### T3: Fix prompt population

- Audit `prompt-loader.ts` / `prompt-manager.ts` actual implementation
- Verify `reseedPrompts()` populates data correctly
- Add diagnostic logging to prompt fetch pipeline
- Test IndexedDB cache state
- Ensure pre-warm fallback actually resolves
- Add visible empty/loading/error states to prompt dropdown
- **Files:** `standalone-scripts/macro-controller/src/ui/prompt-loader.ts`, `standalone-scripts/macro-controller/src/ui/prompt-manager.ts`, `standalone-scripts/macro-controller/src/startup.ts`

### T4: Fix workspace loading

- Review current workspace load path with diagnostic logs
- Verify token readiness check isn't blocking unnecessarily
- Verify SDK workspace API availability timing
- Add workspace loading state indicator to UI
- Ensure cached workspace name used as immediate display
- **Files:** `standalone-scripts/macro-controller/src/startup.ts`, `standalone-scripts/macro-controller/src/workspace-detection.ts`

### T5: Optimize script caching

- Add `macro-looping.js` to `precacheStableScripts()` in `boot.ts`
- Or: add "precache all project scripts" boot step
- Verify cache hits via console logs on subsequent injections
- **Files:** `src/background/boot.ts`, `src/background/injection-cache.ts`

### T6: Batch storage reads

- Combine `readScriptStore()` + `readConfigStore()` into single `chrome.storage.local.get([SCRIPTS, CONFIGS])`
- Pass both stores through the resolution pipeline
- **Files:** `src/background/script-resolver.ts`

### T7: Concatenate scripts for single injection

- Wrap all resolved scripts into a single IIFE string
- Inject via one `chrome.scripting.executeScript()` call
- Maintain error isolation between scripts
- Add sequential fallback if concatenated injection fails
- **Files:** `src/background/inject-scripts-handler.ts`

### T8: Parallel Stage 2

- Run `bootstrapNamespaceRoot()`, `ensureRelayInjected()`, and `seedTokensIntoTab()` in `Promise.all()`
- **Files:** `src/background/inject-scripts-handler.ts`

### T9: Spec sequencing

- Rename folders per RC-05 spec
- Run cross-reference audit
- Update README and memory files
- **Files:** All `spec/` folders, `spec/readme.md`, `.lovable/memory/`

### T10: Timing instrumentation

- Add `performance.now()` markers per injection stage
- Log `[injection] ── TIMING ──` summary at end
- Build on Phase 15.1 from performance plan
- **Files:** `src/background/inject-scripts-handler.ts`

---

## Execution Protocol

1. Say **"next"** to execute the next pending task.
2. Each task is implemented, verified, and marked done before proceeding.
3. Task order may be adjusted based on findings during implementation.
4. New tasks may be added if root cause analysis reveals additional issues.

---

```
Do you understand? Can you please do that?
```
