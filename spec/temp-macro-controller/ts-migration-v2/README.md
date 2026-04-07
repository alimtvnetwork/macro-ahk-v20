# Macro Controller — TypeScript Migration V2

**Created**: 2026-03-21
**Status**: Planning
**Active Codebase**: `standalone-scripts/macro-controller/src/`
**Current Version**: v7.38 (4,165 lines in `macro-looping.ts`)

---

## Overview

V2 migration focuses on three pillars:

1. **Critical bug fixes** — initialization order, workspace name detection
2. **Architectural refactor** — class-based modules, removal of window globals
3. **Performance & quality** — configurable logging, DOM caching, observer throttling

React migration is evaluated but deferred pending modularization completion.

---

## Phases

| Phase | Spec File | Priority | Status |
|-------|-----------|----------|--------|
| 01 | `01-initialization-fix.md` | Critical | Planning |
| 02 | `02-class-architecture.md` | High | Planning |
| 03 | `03-react-feasibility.md` | Medium | Evaluation |
| 04 | `04-performance-logging.md` | High | Planning |
| 05 | `05-json-config-pipeline.md` | Medium | Planning |

---

## Current Architecture

```
index.ts
  └── macro-looping.ts (4,165 lines — orchestrator IIFE)
        ├── imports 20+ modules
        ├── defines ~40 window.__loop* globals
        ├── creates entire UI via DOM manipulation
        └── 200ms startup delay → auth → credits → workspace detect
```

### Extracted Modules (Step 2)

| File | Responsibility |
|------|----------------|
| `shared-state.ts` | Config parsing, theme resolution, mutable state |
| `controller-registry.ts` | Late-binding function registry (callFn/registerFn) |
| `auth.ts` | Token resolution, session bridge, cookie fallback |
| `credit-api.ts` | Credit calculation, bar rendering |
| `credit-fetch.ts` | API calls, response parsing |
| `workspace-detection.ts` | DOM-based workspace name detection |
| `workspace-management.ts` | Workspace move operations |
| `workspace-rename.ts` | Bulk rename, undo, templates |
| `loop-engine.ts` | Start/stop/cycle/delegate/check |
| `logging.ts` | Log persistence, export, activity log |
| `dom-helpers.ts` | Page detection, dialog control |
| `toast.ts` | Toast notification system |
| `xpath-utils.ts` | XPath queries, element finding |
| `ui/*.ts` | Panel layout, countdown, menus, modals, etc. |

### Window Globals (40+)

```
__loopStart, __loopStop, __loopCheck, __loopState, __loopSetInterval,
__loopToast, __loopDiag, __loopDestroy, __loopFetchCredits,
__loopMoveToWorkspace, __loopMoveAdjacent, __loopGetBearerToken,
__loopUpdateStartStopBtn, __loopUpdateAuthDiag, __loopBulkRename,
__loopGetRenameDelay, __loopSetRenameDelay, __loopCancelRename,
__loopUndoRename, __loopRenameHistory, __loopDestroyed,
__delegateComplete, __setProjectButtonXPath, __setProgressXPath, ...
```

---

## Dependencies

- Spec `06-macro-controller/js-to-ts-migration/` — V1 migration (completed Steps 1-5b)
- Spec `07-chrome-extension/50-script-dependency-system.md` — Script injection order
- Memory `architecture/standalone-scripts/modularization-strategy` — Context Object + Registry patterns

---

## Rules

1. **No breaking changes** — existing AHK/extension consumers must keep working during migration
2. **One phase at a time** — verify each phase before starting next
3. **Backward compat** — window globals retained as thin facades until all consumers migrate
4. **Bug fixes first** — Phase 01 must land before any refactor work
5. **Discuss before implementing** — per Engineering Standard #9
