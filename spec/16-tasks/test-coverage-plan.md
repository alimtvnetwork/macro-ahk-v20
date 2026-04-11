# Test Coverage Execution Plan — Macro Controller

**Total LOC**: 29,460 across 80+ source files  
**Existing Tests**: 5 test files (dom-helpers, js-executor, panel-builder, poll-until, workspace-rename)  
**Target**: Meaningful branch/edge-case coverage for all packages  
**Pattern**: AAA (Arrange, Act, Assert), "Should" naming, Vitest

---

## Package Classification

### Large Packages (>500 LOC) — Segmented into 200-line tasks

| # | Package | LOC | Segments | Priority |
|---|---------|-----|----------|----------|
| 1 | `ui/error-overlay.ts` | 802 | 4 | High |
| 2 | `ui/prompt-dropdown.ts` | 697 | 4 | High |
| 3 | `startup.ts` | 690 | 4 | High |
| 4 | `ui/bulk-rename.ts` | 547 | 3 | Medium |
| 5 | `ws-list-renderer.ts` | 544 | 3 | Medium |

### Medium Packages (300–500 LOC) — 1–2 tasks each

| # | Package | LOC | Tasks | Priority |
|---|---------|-----|-------|----------|
| 6 | `auth-resolve.ts` | 465 | 2 | **Critical** |
| 7 | `auth-bridge.ts` | 425 | 2 | **Critical** |
| 8 | `auth-recovery.ts` | 408 | 2 | **Critical** |
| 9 | `toast.ts` | 434 | 2 | Medium |
| 10 | `ui/prompt-loader.ts` | 435 | 2 | High |
| 11 | `workspace-observer.ts` | 422 | 2 | Medium |
| 12 | `loop-cycle.ts` | 416 | 2 | High |
| 13 | `ui/task-next-ui.ts` | 410 | 2 | Medium |
| 14 | `logging.ts` | 396 | 2 | High |
| 15 | `ui/panel-controls.ts` | 390 | 2 | Low |
| 16 | `core/MacroController.ts` | 388 | 2 | High |
| 17 | `workspace-detection.ts` | 351 | 2 | High |
| 18 | `shared-state.ts` | 328 | 2 | High |
| 19 | `credit-fetch.ts` | 321 | 2 | High |
| 20 | `loop-controls.ts` | 314 | 2 | Medium |

### Small Packages (<300 LOC) — Single task each

| # | Package | LOC | Priority |
|---|---------|-----|----------|
| 21 | `ui/prompt-utils.ts` | 275 | High |
| 22 | `credit-api.ts` | ~250 | High |
| 23 | `config-validator.ts` | ~200 | High |
| 24 | `error-utils.ts` | ~150 | Medium |
| 25 | `xpath-utils.ts` | ~100 | Medium |
| 26 | `workspace-cache.ts` | ~150 | Medium |
| 27+ | Remaining small files | ~3000 | Low |

---

## Execution Order (by priority)

### Phase 1 — Auth & Token (Critical path) — 6 tasks
1. `auth-resolve.ts` L1–200 (token normalization, extraction, session bridge)
2. `auth-resolve.ts` L201–465 (cookie fallback, persist, resolve, badge)
3. `auth-bridge.ts` L1–200 (BridgeOutcomeState, debug snapshot, token extraction)
4. `auth-bridge.ts` L201–425 (requestTokenFromExtension, wakeBridge, isRelayActive)
5. `auth-recovery.ts` L1–200 (recovery manager, waterfall tiers)
6. `auth-recovery.ts` L201–408 (recoverAuthOnce, refreshBearerToken, getBearerToken)

### Phase 2 — Core Logic — 7 tasks
7. `logging.ts` L1–200 (log levels, formatting, getDisplayProjectName)
8. `logging.ts` L201–396 (storage keys, workspace history)
9. `config-validator.ts` full (validate config, validate theme, defaults)
10. `shared-state.ts` L1–200 (config parsing, theme resolution)
11. `shared-state.ts` L201–328 (color exports, state re-exports)
12. `workspace-detection.ts` L1–200 (URL parsing, project ID extraction)
13. `workspace-detection.ts` L201–351 (workspace name detection, API calls)

### Phase 3 — Loop Engine & Credits — 7 tasks
14. `loop-cycle.ts` L1–200 (cycle execution, retry logic)
15. `loop-cycle.ts` L201–416 (error handling, delegation)
16. `credit-fetch.ts` L1–200 (API calls, response parsing)
17. `credit-fetch.ts` L201–321 (credit state sync, caching)
18. `credit-api.ts` full (credit calculations, bar rendering)
19. `core/MacroController.ts` L1–200 (singleton, state management)
20. `core/MacroController.ts` L201–388 (lifecycle methods)

### Phase 4 — UI Components — 7 tasks
21. `ui/prompt-utils.ts` full (paste target, inject, normalize)
22. `ui/prompt-loader.ts` L1–200 (cache, load, resolve)
23. `ui/prompt-loader.ts` L201–435 (fallback, version check)
24. `ui/auth-diag-rows.ts` L1–200 (row builders, update functions)
25. `ui/auth-diag-rows.ts` L201–342 (button builders, MV3 classification)
26. `toast.ts` L1–200 (toast creation, queue)
27. `toast.ts` L201–434 (positioning, cleanup)

### Phase 5 — Workspace & Movement — 8 tasks
28–29. `ws-move.ts` (2 segments)
30–31. `ws-adjacent.ts` (2 segments)
32–33. `ws-dialog-detection.ts` (2 segments)
34–35. `workspace-observer.ts` (2 segments)

### Phase 6 — Large UI Files — 18 tasks
36–39. `startup.ts` (4 segments)
40–43. `ui/error-overlay.ts` (4 segments)
44–47. `ui/prompt-dropdown.ts` (4 segments)
48–50. `ui/bulk-rename.ts` (3 segments)
51–53. `ws-list-renderer.ts` (3 segments)

### Phase 7 — Remaining Medium/Small Files — ~20 tasks

---

## Total: ~73 tasks

## Test Design Per Task

For each 200-line segment:
1. **Identify** public functions, internal branches, error paths
2. **Arrange**: Mock DOM, localStorage, window globals, extension messaging
3. **Act**: Call function under test
4. **Assert**: Validate return values, state mutations, DOM changes, side effects

### Coverage Targets Per Segment
- ✅ Happy path for every public function
- ✅ Error/exception paths (try/catch branches)
- ✅ Boundary conditions (empty arrays, null tokens, zero-length strings)
- ✅ Conditional branches (if/else, ternary, switch)
- ✅ Timeout and async paths where applicable

---

## Execution Protocol

When you say **"next"**:
1. Select the next task from the plan
2. Read the target file segment
3. Analyze uncovered branches
4. Write test file following AAA + "Should" naming
5. Verify TypeScript compilation
6. Report: completed task, remaining tasks count
