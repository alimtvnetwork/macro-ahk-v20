# Issue 82 — Project Dialog Auto-Clicks When Loop Is Stopped

| Field | Value |
|---|---|
| ID | 82 |
| Status | ✅ Fixed |
| Severity | P1 / UX |
| Version | 1.71.0 |
| Created | 2026-03-26 |
| Component | Macro Controller — Loop Engine (`refreshStatus` / `startStatusRefresh`) |

---

## Symptom

The project dialog opens automatically (clicks the project button via XPath) every ~30 seconds even when the loop is **NOT started**. Users see the dialog pop up while they are working, disrupting their workflow.

User report:
> "The set interval or timer is just opening and automatically clicking on project even though we did not start the loop."

---

## Root Cause

### RC1 — `refreshStatus()` unconditionally opens project dialog when stopped

`refreshStatus()` in `loop-engine.ts` was designed as a dual-purpose "workspace auto-check":
- **When running**: skip (runCycle handles checks).
- **When stopped**: open project dialog → read workspace name → check credit progress bar → close dialog.

The stopped-state path called `ensureProjectDialogOpen()` → `pollForDialogReady()`, which physically clicks the project button XPath element to open the dialog. This was triggered on a 30-second interval by `startStatusRefresh()`.

### RC2 — Inverted guard logic

The original code had the guard backwards:
```typescript
// BEFORE (broken):
if (state.running) {
  logSub('...skipped — loop is running');
  return;  // <-- skips when RUNNING
}
// ... opens dialog when STOPPED (the disruptive behavior)
```

This meant the dialog-opening code only ran when the loop was **stopped** — the exact opposite of the intended behavior.

### RC3 — `startStatusRefresh()` exposed as a callable global

`startStatusRefresh()` is registered via `dualWrite('__startStatusRefresh', ...)` and can be triggered externally (AHK, console, or auto-attach scripts). Once started, the 30-second interval persists until explicitly stopped, creating a continuous auto-click loop even without user intent.

---

## Failure Chain

1. `startStatusRefresh()` is called (externally or during a session).
2. `setInterval(refreshStatus, 30000)` starts polling every 30s.
3. `refreshStatus()` checks `state.running` — it's `false` (loop not started).
4. Guard passes (inverted logic) → `ensureProjectDialogOpen()` is called.
5. Project button XPath is clicked → dialog opens in the UI.
6. `pollForDialogReady()` waits for DOM → reads workspace/credit.
7. Dialog closes → user sees a flash of the dialog every 30s.

---

## Fix Applied

Modified `refreshStatus()` to **never** open the project dialog when the loop is stopped (`state.running === false`). When stopped, it only performs passive checks:
1. Read workspace name from nav element via `fetchWorkspaceNameFromNav()` (no dialog interaction)
2. Update UI via `mc().ui.update()`

The dialog-based credit check (`ensureProjectDialogOpen` → `pollForDialogReady`) is now gated behind `state.running === true`:

```typescript
// AFTER (fixed):
if (!state.running) {
  // Passive-only: read nav, update UI, NO dialog
  const gotNavName = mc().workspaces.fetchNameFromNav();
  mc().ui.update();
  return;
}
// ... dialog opening only when loop IS running
```

---

## Files Changed

| File | Change |
|---|---|
| `standalone-scripts/macro-controller/src/loop-engine.ts` | Inverted guard in `refreshStatus()`: dialog opening now requires `state.running === true` |
| `.lovable/memory/features/macro-controller/dialog-interaction-policy.md` | New memory file documenting the non-regression rule |
| `spec/17-app-issues/82-project-dialog-auto-click-when-stopped.md` | This spec |

---

## Non-Regression Rule

`refreshStatus()` MUST NEVER call `ensureProjectDialogOpen()`, `clickProjectButton()`, or any function that physically clicks DOM elements when `state.running === false`.

Dialog interaction during the stopped state is **only** permitted via explicit user actions:
- ☑ Check button (`runCheck()`)
- 💰 Credits button (API-only, no dialog)
- Console API calls (`api.loop.check()`)

See also: `.lovable/memory/features/macro-controller/dialog-interaction-policy.md`

---

## Validation Checklist

- [ ] With loop stopped, no project dialog opens automatically over 2+ minutes
- [ ] `startStatusRefresh()` when loop is stopped only updates nav-based workspace name
- [ ] Clicking Check button still opens dialog and detects workspace correctly
- [ ] Starting the loop still runs `refreshStatus()` with dialog-based credit checks
- [ ] `stopLoop()` followed by waiting 60s produces no dialog auto-opens
