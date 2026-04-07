# Issue 37: Compact Mode Progress Bar Missing Segmented Colors

**Version**: v7.22
**Date**: 2026-03-12
**Status**: Resolved

---

## Issue Summary

### What happened

The compact mode workspace item progress bar (P2) used a single solid color instead of the segmented multi-color bar matching the status bar (P1). This violated Spec 06 §Rendering Sites which mandates identical segment order, colors, and formulas across all 3 rendering sites.

### Where it happened

- **Feature**: MacroLoop controller — compact mode workspace item bar
- **Files**: `macro-looping.js` (both AHK and standalone)
- **Function**: `populateLoopWorkspaceDropdown()` — compact mode branch inside the workspace rendering IIFE

### Symptoms and impact

- Status bar (P1) showed green (Monthly) + gray (Rollover) segments with `M:100 R:49 F:0 ⚡149/203`
- Workspace item (P2) showed a single solid cyan bar with `⚡149/203` — no segment breakdown
- Users could not tell which credit pools contributed to a workspace's available balance in the compact list
- Hovering the compact bar showed no segment tooltips (🎁, 💰, 🔄, 📅)

---

## Root Cause Analysis

### Direct cause

The compact mode rendering branch was written as a simplified "quick view" with a single `barColor` calculated from the total available amount. It never called `calcSegmentPercents()` and rendered a single `<div>` instead of per-pool segments.

### Contributing factors

1. **Spec gap**: Spec 06 listed 3 rendering sites but did not explicitly mention compact mode as a sub-variant of workspace items.
2. **"Compact = simplified" assumption**: Compact mode was designed to reduce visual noise, but the single-color approach removed meaningful information rather than just reducing label text.
3. **No visual regression check**: When compact mode was added, it was not compared against the status bar to verify segment consistency.

### Why the existing spec did not prevent it

Spec 06 §Rendering Sites states "All 3 sites MUST use identical segment order, colors, and formulas" but compact mode was treated as a separate 4th rendering approach rather than a variant of site #1 (workspace items).

---

## Fix Description

### What was changed

Replaced the compact mode single-color bar with the same `calcSegmentPercents()` segmented rendering used everywhere else. The compact bar keeps its smaller height (14px vs 18px) and narrower width (200px vs 300px) but now shows proper gradient segments with tooltips.

Additionally, compact mode now shows **all emoji credit labels** (`🎁💰🔄📅⚡`) — identical to the status bar. Labels with value 0 are hidden in compact mode for space efficiency.

### The new rules or constraints added

> **RULE**: Compact mode is a layout variant of workspace items, NOT a separate rendering site. It MUST use `calcSegmentPercents()` and render identical color segments AND emoji labels. The only allowed differences from full mode are: bar height (14px vs 18px), bar max-width (200px vs 300px), and hiding labels with value 0. **Compact mode MUST NEVER omit credit type labels that the status bar shows.**

### Files changed

- `standalone-scripts/macro-controller/macro-looping.js` — compact mode branch
- `marco-script-ahk-v7.latest/macro-looping.js` — compact mode branch (synced)

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Any new progress bar variant (compact, mini, tooltip, etc.) MUST call `calcSegmentPercents()` and render gradient segments. A single-color bar for credit display is NEVER acceptable. Search for `background:.*barColor` in workspace rendering to detect violations.

### Acceptance criteria

1. ✅ Compact mode bar shows green (Monthly) + gray (Rollover) + purple (Bonus) + yellow (Free) segments
2. ✅ Hovering each segment shows tooltip (e.g., "💰 Monthly: 100")
3. ✅ Segment widths match the status bar proportions for the same workspace
4. ✅ Both AHK and standalone versions are synced

### References

- `spec/10-macro-controller/credit-system.md` §Progress Bar Specification, §Rendering Sites
- `spec/17-app-issues/02-status-bar-credit-display-mismatch.md` (precedent for rendering consistency)
- `spec/17-app-issues/36-bearer-token-removal-broke-credit-bar.md` (related auth fix)

---

## Done Checklist

- [x] Both versions updated (AHK + standalone)
- [x] Issue write-up created
- [x] Prevention rule documented
- [x] Acceptance criteria defined
