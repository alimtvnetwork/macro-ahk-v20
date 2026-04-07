# Issue 38: Progress Bar Not Scaled Relative to Max Total Credits

**Version**: v7.23
**Date**: 2026-03-14
**Status**: Resolved

---

## Issue Summary

### What happened

Workspace item progress bars in the MacroLoop workspace list all rendered at 100% width relative to each workspace's own `totalCredits`. This made workspaces with vastly different total credits (e.g., 105 vs 205) appear to have equally full bars when both had all credits available, obscuring the relative scale difference.

### Where it happened

- **Feature**: MacroLoop controller — workspace item progress bars
- **Files**: `macro-looping.js` (both AHK and standalone)
- **Function**: `renderCreditBar()` — renders all segment widths as percentages of the individual workspace's `totalCredits`

### Symptoms and impact

- A workspace with `⚡105/105` showed a fully filled bar identical in appearance to `⚡205/205`
- Users could not visually compare credit capacity across workspaces at a glance
- The bar gave the false impression that all workspaces had equal capacity when fully loaded

### How it was discovered

User compared two workspace items in the list: one with 105 total credits and another with 205 total credits. Both showed fully filled bars despite having 2x difference in capacity.

---

## Root Cause Analysis

### Direct cause

`renderCreditBar()` calculated segment percentages using `calcSegmentPercents(totalCredits, ...)` which divided each pool's value by that workspace's own `totalCredits`. Since each bar filled to 100% of its own total, all fully-credited workspaces looked identical regardless of absolute capacity.

### Contributing factors

1. **No cross-workspace context**: `renderCreditBar()` operated in isolation per workspace with no awareness of other workspaces' totals.
2. **Original design assumption**: The bar was designed to show credit composition (which pools contribute), not relative capacity across workspaces.

### Why the existing spec did not prevent it

Spec 06 §Progress Bar Specification defined segment percentages relative to each workspace's own total. There was no requirement for cross-workspace relative scaling.

---

## Fix Description

### What was changed

1. Added `maxTotalCredits` option to `renderCreditBar()`. When provided, segments are rendered inside an inner container whose width is `(totalCredits / maxTotalCredits * 100)%`, making bars proportional across workspaces.
2. Added a pre-pass in `renderLoopWorkspaceList()` to compute `maxTotalCredits` across all visible (filtered) workspaces before rendering.
3. The status bar (single workspace view) does NOT use `maxTotalCredits` — it renders at full width as before.

### The new rules or constraints added

> **RULE**: When rendering multiple workspace progress bars in a list, `renderCreditBar()` MUST receive `maxTotalCredits` (the highest `totalCredits` among all visible workspaces). The bar's filled portion scales to `totalCredits / maxTotalCredits`, providing accurate visual comparison across workspaces. The status bar (single workspace) does not use this parameter.

### Files changed

- `standalone-scripts/macro-controller/macro-looping.js` — `renderCreditBar()`, `renderLoopWorkspaceList()`
- `marco-script-ahk-v7.latest/macro-looping.js` — same functions (synced)

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Any rendering site that displays multiple workspace credit bars in a list MUST pre-compute `maxTotalCredits` across all visible workspaces and pass it to `renderCreditBar()`. Single-workspace views (status bar) are exempt.

### Acceptance criteria

1. ✅ A workspace with 105/105 credits appears ~51% filled when displayed alongside a workspace with 205/205 credits
2. ✅ Segment colors and proportions within each bar remain correct
3. ✅ Status bar (single workspace) continues to render at full width
4. ✅ Both AHK and standalone versions are synced
5. ✅ Tooltip still shows correct `Available: X / Total: Y (Used: Z)`

### References

- `spec/10-macro-controller/credit-system.md` §Progress Bar Specification
- `spec/17-app-issues/02-status-bar-credit-display-mismatch.md`
- `spec/17-app-issues/37-compact-mode-bar-missing-segments.md`

---

## Done Checklist

- [x] Both versions updated (AHK + standalone)
- [x] Issue write-up created
- [x] Prevention rule documented
- [x] Acceptance criteria defined
