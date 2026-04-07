# Phase 02 — Class-Based Architecture (Replace Window Globals)

**Priority**: High
**Status**: ✅ Complete
**Depends On**: Phase 01 (initialization fix)

---

## Problem Statement

The macro controller exposes 40+ functions on `window.__loop*` as the public API. This causes:

1. **Global namespace pollution** — 40+ properties on `window`
2. **No encapsulation** — any script can call/override internal functions
3. **Hard to track dependencies** — consumers use `typeof window.__loopX === 'function'` guards
4. **No type safety** — callers have no TypeScript support
5. **Testing difficulty** — must mock window properties

Additionally, `macro-looping.ts` at 4,165 lines is still a monolithic orchestrator that wires everything together inside an IIFE.

---

## Target Architecture

### Class Hierarchy

```
MacroController (singleton)
├── config: MacroControllerConfig      (parsed from window.__MARCO_CONFIG__)
├── theme: MacroThemeRoot              (parsed from window.__MARCO_THEME__)
├── state: ControllerState             (reactive state object)
│
├── auth: AuthManager                  (token resolution, session bridge)
├── credits: CreditManager             (API fetch, parse, render bar)
├── workspaces: WorkspaceManager       (detection, move, rename)
├── loop: LoopEngine                   (start, stop, cycle, delegate)
├── ui: UIManager                      (panel, countdown, menus, modals)
├── logging: LogManager                (configurable log system)
├── prompts: PromptManager             (prompt loading, paste, CRUD)
└── dom: DomHelper                     (XPath queries, dialog control)
```

### File Structure

```
standalone-scripts/macro-controller/src/
├── core/
│   ├── MacroController.ts             # Singleton orchestrator
│   ├── AuthManager.ts                 # Token resolution
│   ├── CreditManager.ts              # Credit API + rendering
│   ├── WorkspaceManager.ts           # Detection + move + rename
│   ├── LoopEngine.ts                 # Loop lifecycle
│   ├── LogManager.ts                 # Configurable logging
│   ├── PromptManager.ts              # Prompt operations
│   └── DomHelper.ts                  # DOM utilities
├── ui/                                # (existing, keep as-is initially)
├── types.ts                           # (existing)
├── shared-state.ts                    # → gradually absorbed into class state
├── controller-registry.ts            # → replaced by class method calls
├── index.ts                           # Entry point
└── macro-looping.ts                   # → thin wrapper calling MacroController.init()
```

---

## Migration Strategy

### Step 1: Create `MacroController` class shell

```typescript
export class MacroController {
  private static instance: MacroController | null = null;
  
  readonly config: MacroControllerConfig;
  readonly state: ControllerState;
  
  // Sub-managers (injected, not imported)
  private auth: AuthManager;
  private credits: CreditManager;
  private workspaces: WorkspaceManager;
  private loop: LoopEngine;
  
  static getInstance(): MacroController { ... }
  
  async init(): Promise<void> { ... }
  destroy(): void { ... }
}
```

### Step 2: Extract managers one at a time

For each manager:
1. Create class wrapping existing functions
2. Accept dependencies via constructor (dependency injection)
3. Keep existing module file as implementation
4. Update `macro-looping.ts` to use class instead of direct calls
5. Verify no regression

**Order**: AuthManager → CreditManager → WorkspaceManager → LoopEngine → UIManager → PromptManager

### Step 3: Window globals → facade

```typescript
// Thin compatibility layer — deprecate over time
window.__loopStart = (dir: string) => MacroController.getInstance().loop.start(dir);
window.__loopStop = () => MacroController.getInstance().loop.stop();
window.__loopCheck = () => MacroController.getInstance().loop.check();
window.__loopDiag = () => MacroController.getInstance().diagnostics();
```

### Step 4: Remove controller-registry.ts

Once all `callFn(FN.X)` calls are replaced with class method calls, the registry pattern is no longer needed.

---

## Window Globals Inventory

| Global | Used By | Migration Target |
|--------|---------|-----------------|
| `__loopStart` | AHK, extension, console | `controller.loop.start()` |
| `__loopStop` | AHK, extension, console | `controller.loop.stop()` |
| `__loopCheck` | AHK, console | `controller.loop.check()` |
| `__loopState` | Console debugging | `controller.state` |
| `__loopDiag` | Console debugging | `controller.diagnostics()` |
| `__loopFetchCredits` | Console, extension | `controller.credits.fetch()` |
| `__loopMoveToWorkspace` | Console, extension | `controller.workspaces.moveTo()` |
| `__loopMoveAdjacent` | Loop engine | `controller.workspaces.moveAdjacent()` |
| `__loopBulkRename` | Console | `controller.workspaces.bulkRename()` |
| `__loopDestroy` | Console | `controller.destroy()` |
| `__loopGetBearerToken` | Console | `controller.auth.getToken()` |
| `__loopUpdateStartStopBtn` | Loop engine | Internal — no global needed |
| `__loopUpdateAuthDiag` | Auth module | Internal — no global needed |
| `__delegateComplete` | AHK clipboard | `controller.loop.delegateComplete()` |
| `__setProjectButtonXPath` | Console | `controller.dom.setProjectButtonXPath()` |
| `__setProgressXPath` | Console | `controller.dom.setProgressXPath()` |

### Globals that can be removed immediately (internal only)

- `__loopUpdateStartStopBtn` — only called from `loop-engine.ts`, can use class reference
- `__loopUpdateAuthDiag` — only called from startup, can use class reference
- `__loopDestroyed` — internal flag, move to class state

---

## Pros / Cons

### Pros
1. **Encapsulation** — internal state not exposed to page scripts
2. **Type safety** — consumers get full TypeScript support
3. **Testability** — mock class instances, not window properties
4. **Discoverability** — `controller.` autocomplete vs guessing `__loop*` names
5. **Smaller surface area** — one `window.MacroController` vs 40+ globals
6. **Dependency injection** — easier to swap implementations

### Cons
1. **Breaking change** — AHK scripts using `window.__loopStart()` must update (mitigated by facade)
2. **Migration effort** — 4,165 lines to refactor across 20+ files
3. **Risk of regressions** — extensive testing needed per step
4. **Bundle size** — class overhead is negligible but worth noting

---

## Acceptance Criteria

1. [x] `MacroController` singleton accessible via `window.MacroController` or `window.__mc`
2. [x] All 40+ window globals replaced with class methods (Phase 9D — namespace only)
3. [x] Backward-compat facade keeps `__loopStart`/`__loopStop`/`__loopCheck` working (via namespace)
4. [x] `controller-registry.ts` eliminated (never existed — registry pattern replaced by class)
5. [x] No `typeof window.__loopX === 'function'` guards remain (grep-verified)
6. [x] All existing tests pass (`tsc --noEmit` zero errors)
7. [x] `macro-looping.ts` reduced to 164 lines (extracted domain guard + idempotent check)

---

## Estimated Effort

| Step | Effort | Files Changed |
|------|--------|---------------|
| MacroController shell | 2h | 2 new, 1 modified |
| AuthManager extraction | 2h | 1 new, 2 modified |
| CreditManager extraction | 3h | 1 new, 3 modified |
| WorkspaceManager extraction | 4h | 1 new, 4 modified |
| LoopEngine extraction | 4h | 1 new, 3 modified |
| UIManager extraction | 6h | 1 new, 5 modified |
| Window facade + cleanup | 2h | 2 modified |
| **Total** | **~23h** | **7 new, ~15 modified** |
