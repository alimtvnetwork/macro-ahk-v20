# Memory: features/macro-controller/initialization-flow-v2
Updated: 2026-03-27

## UI-First Initialization (v7.42+)

The initialization sequence now follows a **UI-first** strategy: the panel is rendered immediately at t=0 before any auth resolution or API calls. Auth and workspace data are loaded asynchronously in the background and hydrated into the already-visible UI.

### Flow

```
t=0    → createUI() + startWorkspaceObserver()    [instant]
t=0+   → ensureTokenReady(2000ms)                 [async background]
t=~1s  → fetchLoopCreditsAsync + Tier1 prefetch   [parallel]
t=~2s  → autoDetectLoopCurrentWorkspace()         [hydrate UI]
```

### Root Cause of Previous Slowness

UI creation waited for: token polling (up to 4s) → credit API → workspace detection → only then rendered. This serial waterfall caused 2-5s of blank/stale panel.

Fix documented in: `.lovable/fixes/macro-controller-toast-crash-and-slow-startup.md`

## Startup Workspace Retry (Issue #11 Fix)

On initial injection, workspace detection can fail silently (Tier 1 API miss + Tier 2 XPath button not found). A **delayed retry system** (`scheduleWorkspaceRetry`) automatically retries detection at 1.5s, 3s, 4.5s, 6s (max 4 attempts) if `state.workspaceName` is still empty after the initial attempt. Retries are skipped if the workspace was already resolved by a manual Check or loop cycle.

## Related Docs

- `standalone-scripts/macro-controller/src/startup.ts` — implementation
- `/spec/17-app-issues/11-startup-workspace-name-missing.md` — Startup workspace name missing RCA
- `/spec/17-app-issues/check-button/` — Check button issues and protocol
- `/spec/11-chrome-extension/60-check-button-spec.md` — Check button spec
