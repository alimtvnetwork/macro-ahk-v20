# Issue #84: Check Button Reliability & Workspace Name Not Loading

**Version:** v1.72.0
**Status:** ✅ Fixed
**Severity:** P1

---

## Issue Summary

### What broke

1. **Check button unreliable**: When clicking Check with no workspace list loaded (`perWs` empty), credit fetch could fail silently and XPath detection matched no names — the check appeared to complete but workspace name stayed empty.

2. **Workspace name missing in header on load**: The yellow workspace badge in the title bar showed "⟳ detecting…" indefinitely on startup because:
   - `isKnownWorkspaceName()` returned `false` when `perWorkspace` was empty (line 41), blocking ALL passive name detection (nav observer, `fetchWorkspaceNameFromNav`) until credits loaded.
   - Only 2 retries at 3s/6s delays — not enough for slow pages.

3. **Slow startup**: `ensureTokenReady(6000)` blocked for up to 6s even when the token was typically available in 1-2s. Passive `refreshStatus` (when loop stopped) never triggered credit fetch, so workspace list stayed empty.

### Where it happened

- `workspace-observer.ts`: `isKnownWorkspaceName()` — returned `false` when list empty
- `startup.ts`: Only 2 retries with slow delays; 6s token timeout
- `loop-engine.ts`: `runCheck()` didn't warn about empty workspace list; `refreshStatus()` passive mode never fetched credits

### How it was discovered

User reported Check button "not working well" and workspace name not appearing in header on page load.

---

## Root Cause Analysis

### RCA-1: `isKnownWorkspaceName` gate blocks early detection

When `perWorkspace` is empty (credits not yet loaded), `isKnownWorkspaceName()` returned `false` at line 41. This was intended to prevent the DOM observer from setting a project name as workspace name, but it also blocked **all** legitimate workspace name detection:
- `fetchWorkspaceNameFromNav()` rejects valid names → header stays empty
- `startWorkspaceObserver` mutations are ignored
- `fetchWorkspaceName()` XPath results are discarded

### RCA-2: Insufficient startup retries

Only 2 retries at 3s and 6s delays. On slow-loading pages where credit API takes >6s, the workspace name was never resolved, requiring manual Check.

### RCA-3: Passive refreshStatus never populates workspace list

When the loop is stopped, `refreshStatus()` only did nav-based detection. But nav detection depends on `isKnownWorkspaceName()`, which requires credits to be loaded. This created a dead-end: no credits → no known names → no detection → no credits fetched.

### RCA-4: Token readiness timeout too long

`ensureTokenReady(6000)` waited up to 6s. In practice, tokens are available immediately (from localStorage) or within 1-2s (from extension bridge). The extra 4s added unnecessary startup latency.

---

## Fix Description

### Fix 1: `isKnownWorkspaceName()` allows names when list is empty

When `perWorkspace` is empty, the function now returns `true` instead of `false`. This allows nav-based detection to set an early workspace name that gets validated/corrected once credits load.

### Fix 2: Increased startup retries (2→4) with shorter delays

Retries now run at 1.5s, 3s, 4.5s, 6s instead of 3s, 6s. Total coverage: 15s (was 9s). This gives slow-loading pages more chances to resolve the workspace.

### Fix 3: Better logging in `runCheck()` for empty workspace list

Added explicit log when credit fetch returns 0 workspaces so the user knows raw XPath text will be used as the workspace name.

### Fix 4: Passive `refreshStatus` triggers credit fetch when needed

When the loop is stopped and no workspace name or credits are available, `refreshStatus()` now triggers a background `fetchLoopCreditsAsync()` to break the deadlock.

### Fix 5: Reduced token timeout (6s→4s)

`ensureTokenReady` timeout reduced from 6000 to 4000ms. Tokens are typically available immediately or within 1-2s.

---

## Files Changed

| File | Change |
|------|--------|
| `workspace-observer.ts` | `isKnownWorkspaceName()`: return `true` when `perWorkspace` is empty (was `false`) |
| `startup.ts` | Retries: 2→4, delays: 3s→1.5s base; token timeout: 6s→4s |
| `loop-engine.ts` | `runCheck()`: better logging for 0-workspace case; `refreshStatus()`: triggers credit fetch when stopped + no workspace |

---

## Validation Checklist

- [ ] Workspace name appears in yellow badge within 5s of injection (was stuck on "⟳ detecting…")
- [ ] Check button resolves workspace even when clicked before credits have loaded
- [ ] Passive `refreshStatus` eventually populates workspace name when loop is stopped
- [ ] No false workspace name detection (e.g., project name set as workspace name)
- [ ] Startup total time reduced (token gate: 4s max, not 6s)
- [ ] After rebuild (`npm run build:macro-controller`), runtime bundle reflects all fixes

---

## Non-Regression Rules

| # | Rule | Anti-pattern |
|---|------|-------------|
| NR-84-A | `isKnownWorkspaceName()` must return `true` when `perWorkspace` is empty | ❌ Returning `false` blocks all early detection |
| NR-84-B | Startup workspace retries must run ≥4 times within 15s | ❌ Only 2 retries at 3s/6s |
| NR-84-C | Passive `refreshStatus` must attempt credit fetch if workspace AND credits are missing | ❌ Only nav-based detection (dead-end when credits empty) |
| NR-84-D | After any fix to workspace detection, rebuild standalone bundle | ❌ Editing TS only without `npm run build:macro-controller` |

---

## Cross-References

- [Check Button Master Overview](check-button/01-overview.md)
- [Issue #82 — Dialog Auto-Click When Stopped](82-project-dialog-auto-click-when-stopped.md)
- [Issue #81 — Stale Runtime Bundle](81-auth-no-token-stale-macro-bundle.md)
- [Issue #83 — Globals, Dependencies & Auth](83-dependency-globals-auth-fixes.md)
