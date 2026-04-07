# Startup Initialization

## UI-First Strategy (v7.42+)

The macro controller now renders UI **immediately at t=0** before any auth or workspace resolution. This eliminates the perceived 2-5s delay where users saw nothing or "Initializing...".

### Bootstrap Sequence

```
1. Place script marker + register window globals     ← synchronous, instant
2. createUI()                                        ← UI visible immediately
3. startWorkspaceObserver()                          ← observer starts
4. loadWorkspacesOnStartup()                         ← async, non-blocking
   4a. ensureTokenReady(2000ms)                      ← reduced from 4s
   4b. fetchLoopCreditsAsync() + Tier1 prefetch      ← parallel
   4c. autoDetectLoopCurrentWorkspace()              ← after data loaded
   4d. updateUI()                                    ← hydrate UI with data
```

### Key Design Decisions

- **Cached workspace name from localStorage** — on reload, the last-known workspace name is seeded into `state.workspaceName` from `marco_last_workspace_name` in localStorage. The title badge shows it at 60% opacity with "(cached)" until the API confirms. The cache is written by `updateUI()` after every successful workspace resolution. See `workspace-cache.ts`.
- **UI renders with cached/loading state** — workspace shows cached name or shimmer skeleton placeholder until data arrives
- **Token timeout reduced to 2s** (was 4s) — token is usually immediate from bridge
- **No UI timeout fallback needed** — UI is already rendered, only data hydration is async
- **Toast shows "loading workspace..."** during data fetch, dismissed on completion

### Related Files

- `standalone-scripts/macro-controller/src/startup.ts` — bootstrap implementation
- `.lovable/fixes/macro-controller-toast-crash-and-slow-startup.md` — root cause analysis
- `spec/10-macro-controller/ts-migration-v2/01-initialization-fix.md` — spec
- `.lovable/memory/features/macro-controller/initialization-flow-v2.md` — v2 flow details

### Previous Behavior (v7.36-v7.41)

The startup delay was 200ms before auth, then UI waited for token + API. The extension bridge registers its message listener synchronously during content script injection, so auth is fast, but API calls added 1-3s of blank UI time.
