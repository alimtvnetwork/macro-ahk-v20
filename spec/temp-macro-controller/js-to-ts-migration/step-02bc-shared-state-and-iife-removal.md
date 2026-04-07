# Step 02b+02c — Shared State Extraction + IIFE Removal

**Version**: 1.0.0
**Date**: 2026-03-21
**Status**: Complete

---

## Summary

Extracted all shared constants, config, theme variables, and mutable state from the monolithic
IIFE into a separate `shared-state.ts` module. Removed the outer IIFE wrapper from `macro-looping.ts`
since Vite's IIFE build format re-wraps at bundle time.

## Changes

### New File: `src/shared-state.ts` (~280 lines)
- All config parsing (`window.__MARCO_CONFIG__`, `window.__MARCO_THEME__`)
- Theme preset resolver function
- ~80 color variables (panel, primary, accent, status, neutral, log, button, input, modal, section)
- Layout, typography, and transition tokens
- Constants: `IDS`, `TIMING`, `CONFIG`, storage keys
- Mutable state: `loopCreditState`, `activityLogLines`, toast queue
- Setter functions for ES module binding compliance

### Modified File: `src/macro-looping.ts`
- Removed lines 19-233 (config/theme block) → imported from `shared-state.ts`
- Removed 6 additional declaration blocks (storage keys, auth state, credit state, toast constants)
- Converted 10 mutable state assignments to setter function calls
- Wrapped remaining logic in `macroLoopController()` function for early-return support
- Total reduction: ~230 lines moved to shared-state.ts

## Confidence Level

**High** — Build succeeds, output is identical IIFE structure. Vite correctly inlines the module.

## Key Technical Decision: Setter Functions

ES module `export let` bindings cannot be reassigned by importers (Rollup enforces this).
Solution: Setter functions (`setActivityLogVisible()`, `setToastErrorStopTriggered()`, etc.)
that mutate the binding inside the declaring module.

| Setter | Used At |
|--------|---------|
| `setActivityLogVisible` | `toggleActivityLog()` |
| `setLastSessionBridgeSource` | `getBearerTokenFromSessionBridge()` |
| `setLoopWsCheckedIds` | bulk rename completion, select-all toggle |
| `setLoopWsLastCheckedIdx` | checkbox click handler, select-all |
| `setToastErrorStopTriggered` | error guard in `showToast()` |

## Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| Setter indirection | Low | Single call site per setter, same runtime behavior |
| Module initialization order | Low | `shared-state.ts` runs first (imported at top) |
| Missing reassignment conversions | Medium | Build fails immediately if one is missed (Rollup enforces) |

## Build Output Comparison

| Metric | Before (Step 1) | After (Step 2b+2c) |
|--------|-----------------|---------------------|
| Modules | 2 | 3 |
| Output size | 1,205 KB | 1,217 KB |
| gzip size | 303 KB | 306 KB |
| Build time | 1.04s | 1.06s |

---

*Migration spec v1.0.0 — 2026-03-21*
