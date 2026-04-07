# Issue 03: Progress Bar Missing Granted Credits + Stale Workspace Name

**Version**: v7.9.18
**Date**: 2026-02-22
**Status**: Resolved

---

## Issue Summary

### What happened

Two related issues in the MacroLoop (and ComboSwitch) controller:

1. **Progress bar incomplete**: The segmented credit progress bar only showed 3 segments (💰 Billing, 🔄 Rollover, 📅 Daily Free) but omitted the 🎁 Granted credits (`credits_granted - credits_used`). For a workspace with `credits_granted=100`, the bar showed ~11% filled (32/289) when available was actually ~46% (132/289).

2. **Workspace name stuck on "Preview"**: The DOM observer set `state.workspaceName` to "Preview" (the project name picked from nav) before workspaces loaded. Later, `autoDetectLoopCurrentWorkspace` fallback paths preserved this invalid name because the existing name was truthy.

### Where it happened

- **Feature**: Credit progress bar rendering + workspace name detection
- **Files**: `marco-script-ahk-v7.latest/macro-looping.js`, `marco-script-ahk-v7.latest/combo.js`
- **Functions**: `updateStatus()` (top-level bar), `populateLoopWorkspaceDropdown()` (workspace items), `renderWorkspaceList()` (combo), `autoDetectLoopCurrentWorkspace()` (fallback logic)

### Symptoms and impact

- Progress bar visually misleading — showed mostly empty (reddish) when nearly half the credits were available.
- Workspace name showed "Preview" instead of actual workspace name, making Focus Current and workspace tracking unreliable.

### How it was discovered

User compared top-level bar (showing ⚡132/289 but bar barely filled) with workspace items and noticed the visual mismatch. Also noticed "Preview" as workspace name.

---

## Root Cause Analysis

### Direct cause

1. **Bar segments**: The progress bar only rendered 3 credit type segments. The `freeRemaining` (credits_granted - credits_used) was parsed and stored in the data model but never rendered as a bar segment. When `credits_granted` is significant (e.g., 100), this creates a large gap between the sum of visible segments and the actual available credits.

2. **Workspace name**: The fallback logic in `autoDetectLoopCurrentWorkspace` checked `if (!state.workspaceName)` — but "Preview" is truthy, so the fallback preserved it instead of overriding with the first workspace from the list.

### Contributing factors

1. **Incomplete credit visualization**: The original bar design only accounted for 3 credit types (billing, rollover, daily). When `credits_granted` and `topup_credits_limit` were added to the Total Credits formula (v7.9.15), the bar segments were not updated to include their remaining portions.
2. **Validation gap in fallbacks**: The v7.9.16 fix added `isKnownWorkspaceName()` validation to the DOM observer, but did NOT apply it to the API detection fallback paths.

### Triggering conditions

1. Bar: Any workspace with `credits_granted > 0` and `credits_used < credits_granted`.
2. Name: Observer sets name before workspace list loads + API detection hits a fallback path (no workspace_id, or workspace_id not in list).

### Why the existing spec did not prevent it

1. The bar segment spec only documented 3 credit types. No spec required that ALL components of Total Credits have corresponding bar segments.
2. The v7.9.16 workspace detection spec only required DOM observer validation, not API fallback validation.

---

## Fix Description

### What was changed in the spec

1. Added 🎁 Granted segment (orange `#f97316→#fb923c`) to all progress bars in both controllers.
2. All `autoDetectLoopCurrentWorkspace` fallback paths now validate existing `state.workspaceName` via `isKnownWorkspaceName()`.

### The new rules or constraints added

- **RULE**: Every credit type that contributes to Total Credits MUST have a corresponding bar segment if its remaining value > 0. Current segments: 💰 Billing (green), 🔄 Rollover (purple), 📅 Daily (yellow), 🎁 Granted (orange).
- **RULE**: All fallback paths that "keep existing" `state.workspaceName` MUST validate the existing name via `isKnownWorkspaceName()` first.

### Why the fix resolves the root cause

1. Adding the 🎁 segment ensures the bar visually represents all available credits, making the filled portion match `⚡available/total`.
2. Validating existing names in fallbacks ensures garbage names like "Preview" get replaced with the first valid workspace.

### Config changes or defaults affected

None.

### Logging or diagnostics required

- Fallback log messages now say "invalid/empty existing state" or "keeping valid existing" to distinguish validated vs unvalidated paths.

---

## Iterations History

**Iteration 1 (v7.9.17)**: Fixed the top-level bar formula to use `calcTotalCredits`/`calcAvailableCredits` and match visual style. Did NOT add the missing segment or fix the workspace name fallback. Bar numbers were correct but visual fill was still wrong.

**Iteration 2 (v7.9.18, final)**: Added 🎁 `freeRemaining` segment to all bars in both controllers. Fixed all `autoDetectLoopCurrentWorkspace` fallback paths to validate existing name. Both issues resolved.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: When adding a new credit type to the Total Credits formula, ALWAYS add a corresponding bar segment to ALL progress bar renderings (top-level status bar, workspace items in both controllers). Search for `_totalCapacity` to find all rendering sites.

> **RULE**: Any code path that preserves an existing `state.workspaceName` (or `window.__wsCurrentName`) MUST validate it via `isKnownWorkspaceName()` first.

### Acceptance criteria / test scenarios

1. For a workspace with `credits_granted=100, credits_used=0`: the bar should show an orange 🎁 segment, and `🎁100` should appear in the label.
2. The sum of all visible bar segment percentages should approximate `available/total * 100`.
3. After credit fetch + workspace detection, `state.workspaceName` must be a name from the workspace list, never "Preview" or any other DOM artifact.

### Guardrails

- Search for `credits_granted` or `freeRemaining` in combo.js/macro-looping.js — if it's parsed but not rendered, that's a violation.
- Search for `keeping existing` in `autoDetectLoopCurrentWorkspace` — all such paths must include `isKnownWorkspaceName` check.

### References to spec sections updated

- `/spec/17-app-issues/03-progress-bar-missing-granted-stale-workspace.md` (this file)
- `/spec/10-macro-controller/workspace-detection.md` — Validation rule extended to API fallbacks

---

## TODO and Follow-Ups

1. [ ] Consider adding `topupRemaining` segment if/when topup credits have a `topup_credits_used` field in the API.
2. [ ] Extract a shared `renderCreditBar(ws)` function to eliminate rendering duplication across 4 locations.

---

## Done Checklist

- [x] Spec updated (issue write-up documents segment completeness rule)
- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Memory updated with summary and prevention rule
- [x] Acceptance criteria updated
- [x] Iterations recorded (2 iterations: v7.9.17 partial, v7.9.18 complete)
