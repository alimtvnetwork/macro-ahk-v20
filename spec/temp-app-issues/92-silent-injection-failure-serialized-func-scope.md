# 92 — Silent Injection Failure: Serialized Function Scope Loss

## Summary

Scripts appeared as `SCRIPT_INJECTED` in background logs but never executed on the target page. No errors were reported, no UI appeared, and no console output was visible — a completely silent failure.

## Root Cause

### Primary: `appendNodeToTarget` not available in serialized function context

`chrome.scripting.executeScript({ func })` serializes the function body via `.toString()` and evaluates it in the target page context. Any references to **outer-scope functions** from the module are **NOT captured** — they become `undefined` at runtime.

Both `executeInMainWorld()` and `executeBlobInjection()` in `csp-fallback.ts` referenced `appendNodeToTarget()`, a module-level helper function. When serialized:

```
// In the bundle (background/index.js):
function appendNodeToTarget(target, node) { ... }  // LINE 10565
async function executeInMainWorld(code) {
    ...
    const appendNode = (node) => appendNodeToTarget(target, node);  // LINE 10698
    //                           ^^^^^^^^^^^^^^^^^^^ — UNDEFINED in page context!
}
```

**Effect chain:**
1. MAIN world injection fails → `ReferenceError: appendNodeToTarget is not defined`
2. Blob fallback also fails → same issue (line 10871)
3. ISOLATED eval fallback runs → code executes in ISOLATED world (wrong world)
4. In ISOLATED world: `window.marco`, `window.MacroController`, `RiseupAsiaMacroExt` are set on the ISOLATED window, invisible to the page and DevTools
5. DOM elements ARE created (shared DOM) but JavaScript globals are invisible
6. Background logs `SCRIPT_INJECTED` because `chrome.scripting.executeScript` reports success for the outer wrapper — the actual execution failure is swallowed inside the Promise

### Secondary: `installWindowFacade()` never called

`installWindowFacade()` was defined in `MacroController.ts` but never imported or called. This meant:
- `window.MacroController` was never set on the page
- Post-injection verification's `mcClass` check always failed
- `mc.markInitialized()` was never called

### Why no errors appeared

1. The `ReferenceError` occurs inside a `Promise` constructor within the serialized function
2. Chrome's `executeScript` error handling doesn't always surface nested async rejections
3. The fallback chain catches errors but the final `executeIsolatedEval` "succeeds" (eval runs)
4. The wrapper's try/catch isolation layer catches runtime errors but reports via `window.postMessage` — in ISOLATED world, these messages don't reach the content script relay

## Fix Applied

1. **Inlined `appendNodeToTarget`** into both `executeInMainWorld()` and `executeBlobInjection()` — the append logic is now self-contained within each serialized function
2. **Called `installWindowFacade()`** in `macro-looping.ts` after manager registration — sets `window.MacroController` and calls `markInitialized()`
3. **Bumped version** to 2.96.0

## Prevention

- Regression test in `sessions-logging-path.test.ts` already scans for cross-DB issues
- New rule: **Any function passed as `func` to `chrome.scripting.executeScript` MUST be fully self-contained** — no outer-scope references allowed
- The `appendNodeToTarget` module-level function is kept for non-serialized use cases but must never be referenced from serialized functions

## Expected Outcome

- MAIN world blob injection succeeds on first attempt
- `window.marco`, `window.MacroController`, `RiseupAsiaMacroExt.Projects.MacroController.api.mc` all visible in page console
- `#macro-loop-container` UI panel renders
- Post-injection verification reports ✅ VERIFIED
- No silent fallback to ISOLATED world
