# Phase 01 — Initialization Flow Fix

**Priority**: Critical (Bug Fix)
**Status**: Planning
**Related Issues**: spec/17-app-issues/23-workspace-name-wrong-initial-load.md, spec/17-app-issues/check-button/07-auth-bridge-stall.md
**Memory**: `.lovable/memory/features/macro-controller/startup-initialization.md`

---

## Problem Statement

The macro controller currently creates the full UI (`createUI()`) and exposes window globals **before** workspace data is loaded. The startup sequence at line 3959-4033 of `macro-looping.ts` is:

```
1. createUI()                          ← UI rendered with no workspace data
2. startWorkspaceObserver()            ← observer starts on empty state
3. setTimeout(200ms)                   ← delayed auth + credit load
   3a. refreshBearerTokenFromBestSource()
   3b. loadWorkspacesOnStartup()       ← API call
   3c. autoDetectLoopCurrentWorkspace()
   3d. updateUI()                      ← UI finally updated
```

**Result**: The UI shows "Initializing..." or incorrect workspace name for 200ms+, and if the API call fails, the workspace name may remain wrong permanently. The project dialog click (for workspace detection) can fire before data is available.

---

## Required Flow (Fixed)

```
[Macro Init]
     │
     ▼
[Register globals + auth resolve]
     │
     ▼
[Load Workspaces via API]          ← MUST complete before any UI interaction
     │
     ▼
[Validate workspace data]
     │
     ▼
[Create UI with loaded data]       ← UI renders with correct workspace name
     │
     ▼
[Start workspace observer]
     │
     ▼
[Click project button for name verification]  ← only after data loaded
```

---

## Tasks

### Task 01.1: Reorder startup sequence

Move `createUI()` call **after** `loadWorkspacesOnStartup()` resolves successfully.

**Current** (line 3959):
```typescript
createUI();                    // ← too early
startWorkspaceObserver();
setTimeout(200ms, () => {
  refreshBearerTokenFromBestSource(callback => {
    loadWorkspacesOnStartup(1);
  });
});
```

**Target**:
```typescript
setTimeout(200ms, () => {
  refreshBearerTokenFromBestSource(callback => {
    loadWorkspacesOnStartup(1).then(() => {
      createUI();              // ← after data loaded
      startWorkspaceObserver();
    });
  });
});
```

**Risk**: UI appears later (200ms + API latency). Mitigation: show a minimal loading indicator immediately.

### Task 01.2: Block project dialog until data loaded

Add a guard in `ensureProjectDialogOpen()` and `clickProjectButton()` that returns early if `loopCreditState.perWorkspace` is empty or null.

```typescript
if (!loopCreditState.perWorkspace || loopCreditState.perWorkspace.length === 0) {
  log('Project dialog blocked — workspaces not loaded yet', 'warn');
  return false;
}
```

### Task 01.3: Fix workspace name binding permanently

**Root cause**: `autoDetectLoopCurrentWorkspace()` sometimes falls back to `perWs[0]` even when the API returned a valid `workspace_id`. This was documented in:
- `spec/17-app-issues/23-workspace-name-wrong-initial-load.md` (Tier 1 mark-viewed fix)
- `skipped/marco-script-ahk-v7.9.32/specs/spec-issues-v7.9-workspace-state-clobber.md` (poll overwrites)

**Fix**: In `workspace-detection.ts`, the `autoDetectLoopCurrentWorkspace()` function must:
1. Check if `loopCreditState.currentWs` is already set from API response
2. If yes, use `currentWs.fullName || currentWs.name` — do NOT override with DOM detection
3. Only fall back to DOM detection if API didn't provide workspace info
4. Never fall back to `perWs[0]` if `state.workspaceName` is already set (Known-Good State Wins principle)

### Task 01.4: Document fix in spec to prevent regression

Add non-regression rule to `spec/10-macro-controller/workspace-detection.md`:
```
RULE: The workspace name set by API response (via fetchLoopCredits → syncCreditStateFromApi)
is authoritative. DOM detection and perWs[0] fallback MUST NOT override an API-sourced name.
Ref: Phase 01 initialization fix, spec-issues-v7.9-workspace-state-clobber.md
```

---

## Acceptance Criteria

1. [ ] UI does not render until workspace API call completes (or fails with fallback)
2. [ ] Workspace name shown on panel matches the actual workspace (verified via `__loopDiag()`)
3. [ ] `state.workspaceFromApi` is `true` when API provides workspace data
4. [ ] Project dialog is never clicked before workspace data is loaded
5. [ ] If API fails, UI still renders with "Unknown" workspace and a retry toast
6. [ ] No regression in manual Check, Force, or loop start flows

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| UI appears later | Medium | Low | Show minimal loading placeholder |
| API timeout blocks UI indefinitely | Low | High | 5s timeout + fallback to render without data |
| Existing consumers expect immediate globals | Medium | Medium | Register globals before createUI, not after |
