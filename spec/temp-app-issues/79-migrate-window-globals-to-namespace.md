# Issue 79 — Migrate window.__ Globals to RiseupAsiaMacroExt Namespace

| Field        | Value                                       |
| ------------ | ------------------------------------------- |
| ID           | 79                                          |
| Status       | ✅ Complete (Phase 9A+9B+9C+9D)             |
| Severity     | Standards / Architecture                    |
| Version      | 1.71.0                                      |
| Created      | 2026-03-26                                  |
| Completed    | 2026-03-26                                  |
| Component    | Macro Controller                            |

---

## Problem Statement

The macro controller exposes ~33 `window.__*` globals for cross-script interop, console debugging, and internal UI callbacks. This violates the project convention that **all runtime APIs must live under the `RiseupAsiaMacroExt` SDK namespace** (Issue 78). Bare `window` globals pollute the global scope, risk collisions, and make the API surface invisible to tooling.

## Audit Results

### Category 1: Public Console API (14 globals)

Functions intended for developer use via the browser console.

| Global | Purpose | Target Namespace Path |
|--------|---------|----------------------|
| `__loopStart` | Start loop | `api.loop.start` |
| `__loopStop` | Stop loop | `api.loop.stop` |
| `__loopCheck` | Run one-shot credit check | `api.loop.check` |
| `__loopState` | Return current state object | `api.loop.state` |
| `__loopSetInterval` | Set loop interval (ms) | `api.loop.setInterval` |
| `__loopDiag` | Print diagnostics to console | `api.loop.diagnostics` |
| `__loopFetchCredits` | Trigger credit fetch | `api.credits.fetch` |
| `__loopGetBearerToken` | Resolve auth token | `api.auth.getToken` |
| `__loopToast` | Show toast notification | `api.ui.toast` |
| `__loopDestroy` | Destroy panel + cleanup | `api.ui.destroy` |
| `__forceSwitch` | Force workspace switch | `api.workspace.forceSwitch` |
| `__loopMoveToWorkspace` | Move to named workspace | `api.workspace.moveTo` |
| `__loopBulkRename` | Bulk rename workspaces | `api.workspace.bulkRename` |
| `__mc` | Shortcut to `MacroController.getInstance()` | `api.mc` |

### Category 2: Workspace/Rename Utilities (5 globals)

| Global | Purpose | Target Namespace Path |
|--------|---------|----------------------|
| `__loopGetRenameDelay` | Get rename delay (ms) | `api.workspace.getRenameDelay` |
| `__loopSetRenameDelay` | Set rename delay (ms) | `api.workspace.setRenameDelay` |
| `__loopCancelRename` | Cancel in-flight rename | `api.workspace.cancelRename` |
| `__loopUndoRename` | Undo last rename | `api.workspace.undoRename` |
| `__loopRenameHistory` | Get rename history | `api.workspace.renameHistory` |

### Category 3: Internal UI Callbacks (4 globals)

Functions used for cross-module communication within the macro controller. These are NOT public API — they're internal wiring.

| Global | Purpose | Migration Strategy |
|--------|---------|-------------------|
| `__loopUpdateStartStopBtn` | Update start/stop button state | Move to `_internal.updateStartStopBtn` |
| `__loopUpdateAuthDiag` | Refresh auth diagnostics row | Move to `_internal.updateAuthDiag` |
| `__loopResolvedToken` | Cache resolved token string | Move to `_internal.resolvedToken` |
| `__loopDestroyed` | Teardown sentinel flag | Move to `_internal.destroyed` |

### Category 4: Status/Refresh Utilities (3 globals)

| Global | Purpose | Target Namespace Path |
|--------|---------|----------------------|
| `__refreshStatus` | Refresh status display | `api.ui.refreshStatus` |
| `__startStatusRefresh` | Start periodic status refresh | `api.ui.startStatusRefresh` |
| `__stopStatusRefresh` | Stop periodic status refresh | `api.ui.stopStatusRefresh` |

### Category 5: XPath/Settings (2 globals)

| Global | Purpose | Target Namespace Path |
|--------|---------|----------------------|
| `__setProjectButtonXPath` | Override project button XPath | `api.config.setProjectButtonXPath` |
| `__setProgressXPath` | Override progress bar XPath | `api.config.setProgressXPath` |

### Category 6: Cross-Script / Injection (4 globals)

| Global | Purpose | Migration Strategy |
|--------|---------|-------------------|
| `__comboForceInject` | Bypass domain guard (user-set) | Keep on `window` — user must set before injection |
| `__exportBundle` | Holds export bundle data | Move to `_internal.exportBundle` |
| `__autoAttachRunGroup` | Auto-attach trigger | Move to `api.autoAttach.runGroup` |
| `__delegateComplete` | Delegation completion callback | Move to `_internal.delegateComplete` |

### Category 7: MacroController Facade (1 global)

| Global | Purpose | Migration Strategy |
|--------|---------|-------------------|
| `window.MacroController` | Class reference | Keep — already proper naming |

## Target Namespace Structure

```
RiseupAsiaMacroExt.Projects.MacroController
├── meta
│   ├── version        ← (Issue 78, done)
│   └── displayName
├── api
│   ├── loop
│   │   ├── start(direction?)
│   │   ├── stop()
│   │   ├── check()
│   │   ├── state()
│   │   ├── setInterval(ms)
│   │   └── diagnostics()
│   ├── credits
│   │   └── fetch()
│   ├── auth
│   │   └── getToken()
│   ├── workspace
│   │   ├── forceSwitch(direction)
│   │   ├── moveTo(id, name)
│   │   ├── bulkRename(template, prefix, suffix, startNum?)
│   │   ├── getRenameDelay()
│   │   ├── setRenameDelay(ms)
│   │   ├── cancelRename()
│   │   ├── undoRename()
│   │   └── renameHistory()
│   ├── ui
│   │   ├── toast(msg, level, opts?)
│   │   ├── destroy()
│   │   ├── refreshStatus()
│   │   ├── startStatusRefresh()
│   │   └── stopStatusRefresh()
│   ├── config
│   │   ├── setProjectButtonXPath(xpath)
│   │   └── setProgressXPath(xpath)
│   ├── autoAttach
│   │   └── runGroup(group)
│   └── mc                  ← MacroController.getInstance()
└── _internal               ← NOT for external use
    ├── updateStartStopBtn(running)
    ├── updateAuthDiag()
    ├── resolvedToken
    ├── destroyed
    ├── exportBundle
    └── delegateComplete()
```

## Phased Migration Plan

### Phase 9A — Namespace Scaffolding ✅
1. ✅ Created `api-namespace.ts` that builds and populates the `api` + `_internal` sub-objects on `RiseupAsiaMacroExt.Projects.MacroController`
2. ✅ Called during startup after SDK namespace registration
3. ✅ **Dual-write**: Set both `window.__*` AND namespace paths — zero breakage

### Phase 9B — Consumer Migration ✅
1. ✅ Added `nsRead()` and `nsCall()` helpers to `api-namespace.ts`
2. ✅ Migrated all internal reads in `loop-engine.ts`, `ui-updaters.ts`, `credit-fetch.ts`, `menu-builder.ts`, `startup.ts`, `macro-looping.ts`
3. ✅ `window.__*` kept as deprecated backward-compatible aliases via dual-write

### Phase 9C — Deprecation Warnings ✅
1. ✅ Added `_installTrap()` helper using `Object.defineProperty` getter/setter on `window`
2. ✅ One-time `console.warn` per key on first external read, pointing to namespace path
3. ✅ `installDeprecationTraps()` called at end of `bootstrap()` — re-entrant safe
4. ✅ Late `dualWrite` calls (e.g. panel-builder) auto-trap via `_trapsActive` flag

### Phase 9D — Removal ✅
1. ✅ `dualWrite()` no longer writes to `window.__*` — namespace is the single source of truth
2. ✅ `nsRead()` no longer falls back to `window` — reads from namespace only
3. ✅ Deprecation traps removed (no longer needed — globals don't exist)
4. ✅ `installWindowFacade()` only sets `window.MacroController` (class reference)
5. ✅ `globals.d.ts` stripped of all `window.__*` declarations except `__comboForceInject`
6. ✅ Destroy/teardown paths no longer attempt to `delete window[key]`

### External Consumer Audit Checklist (9D)

| Consumer | Status | Notes |
|----------|--------|-------|
| AHK scripts (`__loopStart`, `__loopStop`) | ✅ Updated | Use namespace or `MacroController.getInstance()` |
| Combo injector (`__comboForceInject`) | ✅ N/A | Kept on `window` — exception |
| Auto-attach scripts (`__autoAttachRunGroup`) | ✅ Migrated | Now at `api.autoAttach.runGroup` |
| Console snippets (`__loopDiag`, `__loopCheck`) | ✅ Migrated | Now at `api.loop.diagnostics`, `api.loop.check` |
| Hot-reload (`__loopStart` guard) | ✅ Migrated | Uses `nsRead()` |

## Exceptions (Keep on window)

| Global | Reason |
|--------|--------|
| `__comboForceInject` | Must be set by user BEFORE script injection — namespace doesn't exist yet |
| `window.MacroController` | Proper class name, not a `__` global |

## Files Modified

| File | Changes |
|------|---------|
| `src/api-namespace.ts` | Namespace builder, write/read helpers (no window writes in 9D) |
| `src/startup.ts` | Namespace init + write calls |
| `src/macro-looping.ts` | Write calls, idempotent guard via `nsRead` |
| `src/ui/panel-builder.ts` | Write `_internal.updateStartStopBtn`, `_internal.updateAuthDiag` |
| `src/ui/ui-updaters.ts` | Read from `_internal` instead of `window` |
| `src/ui/menu-builder.ts` | Read from `_internal`/`api` |
| `src/loop-engine.ts` | Read from `_internal` |
| `src/credit-fetch.ts` | Read from `_internal` |
| `src/core/MacroController.ts` | Facade: only `window.MacroController` |
| `src/globals.d.ts` | Stripped `window.__*` declarations |

## Dependencies

- Issue 78 (✅ done) — `meta.version` already on namespace
- SDK namespace must be registered before this runs (ensured by injection pipeline order)
