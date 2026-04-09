# Check Button — Master Overview

**Component**: MacroLoop Controller → `runCheck()` / Check button onclick  
**Versions affected**: v7.11 → v7.19+ → v1.47.0 → v7.43 → v1.56.0
**Status**: All known issues resolved

---

## Timeline

| # | File | Original | Version | What broke | Root cause | Fix version |
|---|------|----------|---------|------------|------------|-------------|
| 02 | `02-no-search-feedback.md` | Issue #25 | v7.11 | No UI feedback during Check; workspace detection skipped when `perWs` empty | Fire-and-forget `fetchLoopCredits()` + no status bar update | v7.11.3 |
| 03 | `03-no-workspace-update.md` | Issue #26 | v7.11.3 | Check doesn't update workspace name; stays stale | Guard `if (!state.workspaceName)` blocked re-detection on manual Check | v7.11.4 |
| 04 | `04-wrong-detection-path.md` | Issue #28 | v7.12–v7.13 | Check defaults to P01 instead of actual workspace | `runCheck()` called Tier 1 API (`mark-viewed`) instead of XPath-only detection | v7.14.0 |
| 05 | `05-guard-regression.md` | Issue #32 | v7.19.x | Check button randomly unavailable during loop | `countdown > 10` guard blocked manual Check for most of cycle window | v7.19.x |
| 06 | `06-regression-checklist.md` | Issue #33 | v7.19+ | (Checklist) | Prevent recurrence of #25/#26/#28/#32 | — |
| 07 | `07-auth-bridge-stall.md` | Issue #46 | v1.47.0 | Check stalls when auth unavailable; crash on empty `perWs` | `document.cookie` can't read HttpOnly tokens; no `perWs[0]` guard | v1.47.0 |
| 08 | `08-workspace-detection-race.md` | Issue #08 | v7.38–v7.41 | Check doesn't update status; `workspaceFromApi` blocks XPath | Credit-fetch callback sets `workspaceFromApi = true`, racing with manual Check | v7.42 |
| 09 | `09-dialog-close-before-progress-read.md` | Issue #09 | v7.42 | Progress bar always "NOT FOUND" even when visible | Dialog closed after Step 2 destroys Step 3's XPath target (`div[6]` portal) | v7.43 |
| 10 | `10-runtime-seed-drift.md` | Issue #10 | v1.56.0 | Check logic appears fixed in TS but still fails at runtime | `01-macro-looping.js` (seeded runtime script) drifted from `src/*` and was not rebuilt | v1.56.0 |

---

## Recurring Root Causes

### 1. Wrong detection function in `runCheck()`

The Check button's job is simple: click Project button → read workspace name from dialog XPath → update state. Multiple versions introduced wrong complexity:

- **v7.11.3**: Correct function but fire-and-forget credit fetch
- **v7.12.0**: Added button retry but still Tier 2 only
- **v7.13.0**: Added Tier 1 `POST mark-viewed` API — **wrong** (network dependency for a pure DOM operation, sets `workspaceFromApi = true` blocking future DOM updates)
- **v7.14.0**: Fixed to XPath-only

**Rule**: `runCheck()` must only use XPath DOM detection. Never call `mark-viewed` API.

### 2. Guard conditions blocking manual action

Guards meant to prevent conflicts during automated cycles also blocked manual Check:

- `if (!state.workspaceName)` → prevented re-detection when name already set
- `state.running && state.countdown > 10` → blocked Check for most of the cycle window

**Rule**: Manual Check must only be blocked when `state.isDelegating === true`. Never use countdown or workspace-name existence as a gate.

### 3. Missing UI feedback

Users couldn't tell if Check was doing anything:

- No "Searching…" status bar update
- No button state change (opacity, text)
- Silent failures with no error indication

**Rule**: Check button must show "⏳ Checking…" with reduced opacity during flight and reset on completion or error.

### 4. Empty workspace list crash path

When `perWs` is empty (first load, no credits fetched), fallback code assumed `perWs[0]` always exists:

- `closeDialogAndDefault()` crashed
- `syncCreditStateFromApi()` showed wrong credits

**Rule**: Always guard `perWs[0]` access. If empty, await credit fetch first, then retry detection.

### 5. Auth dependency in page context

Extension-injected scripts can't reliably read HttpOnly session cookies via `document.cookie`. Auth recovery that depended solely on cookie reads would fail silently.

**Rule**: Never depend on `document.cookie` as the only auth recovery path. Use extension bridge → localStorage → cookie fallback chain.

### 6. Over-strict whole-node matching in dialog XPath

Dialog XPath/CSS can return composite node text (workspace name + badges/meta). Matching against the entire node string can fail even when the correct workspace is present.

**Rule**: Extract candidate text fragments from dialog nodes and match workspaces by normalized exact equality on `fullName`, prioritizing selected/active nodes when multiple candidates exist.

### 7. Source/runtime drift in seeded extension script

The extension injects `standalone-scripts/macro-controller/01-macro-looping.js`.
If only TS source modules are updated (`src/loop-engine.ts`, `src/workspace-detection.ts`) but the standalone bundle is not rebuilt, runtime still executes stale Check logic.

**Rule**: After any Check-flow change, run `npm run build:macro-controller` so `01-macro-looping.js` is synced before release.

---

## Non-Regression Rules (consolidated)

These rules must be enforced in every change to `runCheck()` or Check button click handler:

| # | Rule | Anti-pattern |
|---|------|-------------|
| R1 | XPath-only workspace detection in `runCheck()` | ❌ Calling `mark-viewed` API or `autoDetectLoopCurrentWorkspace` |
| R2 | Block manual Check only when `isDelegating === true` | ❌ `countdown > N` or `state.running` as blocking condition |
| R3 | Show "⏳ Checking…" + opacity 0.6 during flight | ❌ Silent `runCheck()` without UI feedback |
| R4 | `runCheck().catch(...)` with button reset in error path | ❌ Silent `.catch()` or no `.catch()` at all |
| R5 | `checkInFlight` guard prevents double-click | ❌ No cooldown guard |
| R6 | Guard `perWs[0]` — await credit fetch if empty | ❌ Assuming `perWs[0]` always exists |
| R7 | Auth uses extension bridge first, cookie as last resort | ❌ `document.cookie` as only auth source |
| R8 | `workspaceFromApi = false` after XPath detection | ❌ Setting `workspaceFromApi = true` from DOM operation |
| R9 | Button resets (text + opacity + pointer-events) on success AND error | ❌ Button stuck in disabled state after failure |
| R10 | `01-script-direct-copy-paste.js` must match `macro-looping.js` Check logic | ❌ Divergent onclick handlers between files |
| R11 | Workspace dialog matching must use normalized exact `fullName` from extracted text fragments, prioritizing selected/active nodes | ❌ Comparing whole composite node text or using loose partial `indexOf` |
| R12 | `autoDetectLoopCurrentWorkspace` must NOT run during manual Check (`isManualCheck` guard) | ❌ Credit fetch callback overriding workspace during Check |
| R13 | `state.workspaceFromApi = false` must be set at BOTH start and end of `runCheck()` | ❌ Only clearing at start, allowing race to re-set |
| R14 | Step 3 (progress bar read) MUST execute while the project dialog is still open | ❌ Closing dialog after Step 2 destroys the `div[6]` portal containing the progress bar |
| R15 | Dialog MUST be closed after Step 3 completes, never left open | ❌ `keepDialogOpen` without subsequent `closeProjectDialogSafe()` |
| R16 | Rebuild standalone runtime script after Check-flow TS edits (`npm run build:macro-controller`) | ❌ TS fix merged but seeded `01-macro-looping.js` still stale |

---

## Files in This Folder

| File | Description |
|------|-------------|
| `01-overview.md` | This file — master timeline, root causes, non-regression rules |
| `02-no-search-feedback.md` | Issue #25: No UI feedback + skipped detection |
| `03-no-workspace-update.md` | Issue #26: Stale workspace name after Check |
| `04-wrong-detection-path.md` | Issue #28: Wrong API path in `runCheck()` |
| `05-guard-regression.md` | Issue #32: Countdown guard blocking Check |
| `06-regression-checklist.md` | Issue #33: Manual test checklist |
| `07-auth-bridge-stall.md` | Issue #46: Auth bridge gaps + empty `perWs` crash |
| `08-workspace-detection-race.md` | Issue #08: `workspaceFromApi` race + over-complex detection |
| `09-dialog-close-before-progress-read.md` | Issue #09: Dialog closed before progress bar read |
| `10-runtime-seed-drift.md` | Issue #10: TS fix not propagated to seeded runtime bundle |
| `readme.md` | Folder scope and index |
