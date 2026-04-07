# Check Button — Definitive Specification

> **Version**: 1.2.0
> **Last updated**: 2026-03-21
> **Component**: `loop-engine.ts` → `runCheck()`
> **Trigger**: Manual click on `☑ Check` button in macro controller UI

---

## Purpose

The Check button performs a **one-shot, XPath-only** workspace detection and credit
status check. It must work regardless of whether the loop is running or stopped.
It NEVER calls any API for workspace detection — it reads the DOM directly.

## Runtime Source of Truth (Critical)

- Extension runtime executes the seeded script: `standalone-scripts/macro-controller/01-macro-looping.js`
- TS modules (`src/loop-engine.ts`, `src/workspace-detection.ts`) are source-level authoring files
- **After any Check-flow change, run:** `npm run build:macro-controller`
- Without this sync, runtime can execute stale Check logic even when TS source looks fixed
- See: [Issue #10](../02-app-issues/check-button/10-runtime-seed-drift.md)

---

## Flow — Exactly 3 Steps

### Pre-flight
- Guard: `checkInFlight` prevents double-click
- Guard: `state.isDelegating` blocks during active move
- Set `state.workspaceFromApi = false` (XPath is authoritative)
- Set `state.isManualCheck = true` (prevent credit-fetch callback from overriding)
- Button shows `⏳ Checking…` + opacity 0.6 + pointer-events none
- Resolve auth token (fast path: localStorage; slow path: extension bridge)

### Step 1 — Click Project Button

```
XPath: /html/body/div[2]/div/div[2]/nav/div/div/div/div[1]/div[1]/button
Config: CONFIG.PROJECT_BUTTON_XPATH
```

- Click the Project Button to open the workspace dialog
- If dialog is already open (`aria-expanded="true"`), close first, wait 400ms, re-open
- Wait up to `TIMING.DIALOG_WAIT` ms for dialog content to appear
- **CRITICAL**: Pass `keepDialogOpen=true` to `detectWorkspaceViaProjectDialog()` so the
  dialog stays open for Step 3 (progress bar is inside the same dialog DOM)

### Step 2 — Read Workspace Name

```
XPath: /html/body/div[6]/div/div[2]/div[1]/p
Config: CONFIG.WORKSPACE_XPATH
```

- Read text content from the Workspace Name XPath node(s)
- Match against known workspace list (`loopCreditState.perWorkspace`)
- Prioritize nodes with `aria-selected`, `aria-current`, `data-state="active"` attributes
- Update `state.workspaceName` and `loopCreditState.currentWs`
- Close the project dialog after reading (only if `keepDialogOpen` is false)
- **When called from runCheck**: Dialog stays open — Step 3 reads from the same DOM

### Step 3 — Check Progress Bar (Credit Status) — DIALOG STILL OPEN

```
XPath: /html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]
Config: CONFIG.PROGRESS_XPATH
```

**CRITICAL**: This XPath targets an element inside the project dialog's portal
overlay (`div[6]`). The dialog MUST still be open when this step executes.
If the dialog was closed after Step 2, this element would not exist in the DOM.
See: [Issue #09](../02-app-issues/check-button/09-dialog-close-before-progress-read.md)

- Search for the Progress Bar element using `findElement(ML_ELEMENTS.PROGRESS)`
- If FOUND → system is **BUSY** → `state.isIdle = false`
- If NOT FOUND → system is **IDLE** → `state.isIdle = true`
- Always update `state.hasFreeCredit` based on credit API data via `syncCreditStateFromApi()`
- This step runs **regardless** of whether the loop is running or stopped
- **After reading**: Close the dialog via `closeProjectDialogSafe(dialogBtn)`

### Post-flight
- Set `state.workspaceFromApi = false` (reaffirm XPath authority)
- Set `state.isManualCheck = false`
- Call `syncCreditStateFromApi()` to update credit numbers
- Call `updateUI()` to refresh the status line
- Reset button: text → `☑ Check`, opacity → 1, pointer-events → auto
- Log `=== MANUAL CHECK COMPLETE ===`

---

## What Check Must NEVER Do

| Prohibited Action | Why | Spec Reference |
|---|---|---|
| Call `POST /projects/{id}/mark-viewed` API | Network dependency for DOM operation | Issue #28, R1 |
| Set `state.workspaceFromApi = true` | Blocks all future XPath detection | Issue #08, R2 |
| Call `autoDetectLoopCurrentWorkspace()` | Uses Tier 1 API, sets `workspaceFromApi` | Issue #28, R1 |
| Clear `state.workspaceName` to empty before detection | Loses name if detection fails | Issue #26 |
| Close dialog after Step 2 / before Step 3 | Progress bar XPath is inside dialog DOM; disappears when closed | Issue #09 |
| Block based on `state.countdown > N` | Prevents manual Check during loop | Issue #32 |
| Block based on `state.running` | Check works in running AND stopped states | Issue #32 |
| Leave button stuck in disabled state on error | UX regression | Issue #25 |
| Merge Check-flow TS changes without rebuilding seeded runtime script | Extension still injects stale behavior | Issue #10 |

---

## Guard Conditions

| Guard | Blocks Check? | Reason |
|-------|--------------|--------|
| `checkInFlight === true` | ✅ Yes | Prevents double-click |
| `state.isDelegating === true` | ✅ Yes | Move in progress |
| `state.running === true` | ❌ No | Check works during active loop |
| `state.countdown > N` | ❌ No | Never use countdown as gate |
| `!state.workspaceName` | ❌ No | Check should detect it |
| `state.workspaceFromApi === true` | ❌ No | Check clears this flag |

---

## Error Handling

- **Failsafe timeout**: 15-second timer auto-resets button if Check hangs
- **Sync errors**: Caught and logged, button reset
- **Promise rejection**: `.catch()` logs error, button reset in `.finally()`
- **No auth token**: Check proceeds with warning toast, XPath detection still works
- **Dialog won't open**: Log error, preserve existing workspace, reset button
- **XPath returns no nodes**: CSS selector fallback, then preserve existing workspace

---

## UI Feedback Requirements

| State | Button Text | Opacity | pointer-events |
|-------|-------------|---------|----------------|
| Idle | `☑ Check` | 1 | auto |
| Auth resolving | `⏳ Auth…` | 0.6 | none |
| Checking | `⏳ Checking…` | 0.6 | none |
| Complete | `☑ Check` | 1 | auto |
| Error | `☑ Check` | 1 | auto |
| Blocked (delegating) | Flash opacity 0.5 for 500ms | — | — |

---

## Code Location

| File | Function | Role |
|------|----------|------|
| `loop-engine.ts` | `runCheck()` | Core 3-step detection logic |
| `macro-looping.ts` | `checkBtn.onclick` | Button handler, auth, UI state |
| `workspace-detection.ts` | `detectWorkspaceViaProjectDialog()` | Step 1+2: dialog open, XPath poll |
| `dom-helpers.ts` | `findElement(ML_ELEMENTS.PROGRESS)` | Step 3: progress bar lookup |
| `credit-fetch.ts` | `syncCreditStateFromApi()` | Post-check credit sync |
| `shared-state.ts` | `state.workspaceFromApi`, `state.isManualCheck` | Guard flags |
| `standalone-scripts/macro-controller/01-macro-looping.js` | seeded runtime bundle | Actual injected script used by extension |
| `src/background/seed-chunks/looping-script-chunk.ts` | `buildDefaultLoopingScript()` | Seeds runtime script into extension storage |

---

## Related Issue History

| Issue | Version | Problem | Root Cause |
|-------|---------|---------|------------|
| #25 | v7.11 | No UI feedback, detection skipped | Fire-and-forget, no status update |
| #26 | v7.11.3 | Stale workspace name | Guard blocked re-detection |
| #28 | v7.12-v7.14 | Wrong API path | `mark-viewed` API instead of XPath |
| #32 | v7.19.x | Check randomly blocked | `countdown > 10` guard |
| #46 | v1.47.0 | Check stalls, crash on empty `perWs` | Cookie auth, no `perWs[0]` guard |
| #08 | v7.38-v7.41 | `workspaceFromApi` race | Credit fetch sets flag, blocks XPath |
| #09 | v7.42 | Progress bar always NOT FOUND | Dialog closed after Step 2 destroys Step 3's XPath target |
| #10 | v1.56.0 | Check still broken after TS fix | Seeded runtime script not rebuilt/synced from TS source |

---

## Cross-References

- [Check Button Issue Bundle](../02-app-issues/check-button/)
- [Issue #08: workspaceFromApi Race](../02-app-issues/check-button/08-workspace-detection-race.md)
- [Issue #10: Runtime Seed Drift](../02-app-issues/check-button/10-runtime-seed-drift.md)
- [Macro Controller Extension Bridge](43-macro-controller-extension-bridge.md)
- [Cookie-Only Bearer](36-cookie-only-bearer.md)

---

*Check Button Specification v1.2.0 — 2026-03-21*
