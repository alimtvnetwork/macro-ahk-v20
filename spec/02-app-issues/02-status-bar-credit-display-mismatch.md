# Issue 02: Top-Level Status Bar Credit Display Mismatch

**Version**: v7.9.17
**Date**: 2026-02-22
**Status**: Resolved

---

## Issue Summary

### What happened

The MacroLoop controller's top-level status bar displayed a credit progress bar with different logic and visual style compared to the workspace items below it.

### Where it happened

- **Feature**: MacroLoop controller — top-level credit progress bar in `updateStatus()`
- **Files**: `marco-script-ahk-v7.latest/macro-looping.js`
- **Functions**: `updateStatus()` (lines ~1843-1868)

### Symptoms and impact

- The top bar showed `⚡133` (sum of available portions: dailyFree + rollover + billingAvailable) while workspace items correctly showed `⚡133/205` (available / totalCredits).
- The top bar used a thin 6px bar with white background; workspace items used a 12px bar with reddish "used" background.
- The top bar calculated percentage based on available-only total; workspace items used true Total Credits as denominator.
- This created visual inconsistency and confusion about what the numbers meant.

### How it was discovered

User compared the top-level progress bar with the workspace item progress bar and noticed different numbers and visual styles.

---

## Root Cause Analysis

### Direct cause

The `updateStatus()` function's credit bar code was written before the credit formula revisions (v7.9.15) and was never updated to use the shared helper functions (`calcTotalCredits`, `calcAvailableCredits`). It used its own inline calculation: `_total = df + ro + ba` (sum of available portions), which is not the correct Total Credits formula.

### Contributing factors

1. **Duplicated logic**: The credit bar rendering was duplicated between `updateStatus()` (top-level) and the workspace item rendering (IIFE inside `populateLoopWorkspaceDropdown`), rather than sharing a single rendering function.
2. **Incomplete formula update**: When credit formulas were revised in v7.9.15, only the workspace item rendering and helper functions were updated. The top-level status bar was overlooked.
3. **Visual divergence**: The top-level bar had different CSS (6px height, white background, 9px font) than workspace items (12px height, reddish background, 10px font), making the two bars look intentionally different rather than inconsistent.

### Triggering conditions

Always — any time the MacroLoop controller displayed credit data.

### Why the existing spec did not prevent it

The credit formula spec (`JSON-schema.md`) documented the correct formulas but did not specify that ALL credit bar renderings must use the shared helpers. There was no "single source of rendering" requirement.

---

## Fix Description

### What was changed in the spec

1. Updated this issue write-up to document the requirement: all credit bar renderings must use `calcTotalCredits` and `calcAvailableCredits` helpers.

### The new rules or constraints added

- **RULE**: Every credit bar in the UI (top-level, workspace items, tooltips) MUST use `calcTotalCredits()` and `calcAvailableCredits()` — never inline arithmetic.
- **RULE**: All credit bars must show `⚡available/total` format with consistent visual styling (12px height, reddish used background).

### Why the fix resolves the root cause

Replaced the inline `_total = df + ro + ba` calculation with `calcTotalCredits()` and `calcAvailableCredits()`, and matched the visual styling (12px bar, reddish background, gradient segments, `⚡available/total` label) to the workspace items.

### Config changes or defaults affected

None.

### Logging or diagnostics required

None — visual change only.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: All credit bar renderings across the UI MUST use the shared `calcTotalCredits()` and `calcAvailableCredits()` helper functions. No inline credit arithmetic is allowed. When updating credit formulas, search for ALL rendering sites (currently: `updateStatus()` top-level bar and `populateLoopWorkspaceDropdown()` workspace items).

### Acceptance criteria / test scenarios

1. The top-level status bar progress bar must visually match workspace item bars (same height, background, gradient style).
2. The `⚡` label must show `available/total` in both locations with identical numbers for the current workspace.
3. Hovering the top-level bar should show "Available: X / Total: Y (Used: Z)" tooltip.

### Guardrails

- Search for `_total = ` or manual credit summation in `macro-looping.js` — any occurrence outside the helper functions indicates a violation.

### References to spec sections updated

- `/spec/02-app-issues/02-status-bar-credit-display-mismatch.md` (this file)

---

## TODO and Follow-Ups

1. [x] Extracted shared `renderCreditBar(opts)` function — all 3 rendering sites (status bar, workspace full, workspace compact) now call a single function. No inline bar HTML remains.

---

## Done Checklist

- [x] Spec updated (issue write-up documents the rendering consistency rule)
- [x] Issue write-up created under `/spec/02-app-issues/`
- [x] Memory updated with summary and prevention rule
- [x] Acceptance criteria updated
- [x] Iterations recorded (single iteration — no prior attempts)
