# Plan: DevTools Focus-Steal Fix, CSV Export & Progress Bar Reorder (v7.9.51–v7.9.53)

**Status**: COMPLETED
**Date Completed**: 2026-02-24
**Version**: v7.9.51 → v7.9.53

## Summary
Fixed InjectJSQuick focus-stealing bug, added CSV export for workspace credits, added dynamic workspace count label, and reordered/recolored progress bar segments for better visual clarity.

## Changes

### 1. InjectJSQuick Focus-Steal Fix (v7.9.51)
- **Root Cause**: `InjectJSQuick` called `ActivateBrowserPage()` which stole focus from detached DevTools console back to the browser page, causing script paste to go to the address bar → 413 errors
- **Fix**: Removed `ActivateBrowserPage()` from `InjectJSQuick`; it now assumes Console is already focused
- **Files**: `JsInject.ahk`, `GeneralDefaults.ahk`
- **Issue**: `/spec/17-app-issues/13-devtools-window-activation.md`

### 2. CSV Export for Workspaces (v7.9.52)
- **Feature**: 📋 CSV button in MacroLoop controller exports all workspace credit data
- **Details**: Ascending sort by workspace name, 17 columns (name, daily, rollover, billing, granted, topup, available, total, etc.)
- **Implementation**: `exportWorkspacesAsCsv()` in `macro-looping.js`; global `window.__loopExportCsv`
- **Files**: `macro-looping.js`

### 3. Dynamic Workspace Count Label (v7.9.52)
- **Feature**: "Workspaces" header now shows `Workspaces (filtered/total)` or `Workspaces (total)` count
- **Updates**: Refreshes on search, Free Only toggle, Rollover filter, Billing filter
- **Files**: `macro-looping.js`

### 4. Progress Bar Segment Reorder & Recolor (v7.9.53)
- **Old order**: 💰 Billing (green) → 🔄 Rollover (purple) → 📅 Daily (yellow) → 🎁 Granted (orange)
- **New order**: 🎁 Bonus (purple #7c3aed→#a78bfa) → 💰 Monthly (green #22c55e→#4ade80) → 🔄 Rollover (gray #6b7280→#9ca3af) → 📅 Free (yellow #d97706→#facc15)
- **Scope**: Updated in 3 rendering sites: macro-looping workspace items, macro-looping top-level bar, combo.js workspace items
- **Labels renamed**: "Billing" → "Monthly", "Granted" → "Bonus", "Daily" → "Free"
- **Files**: `macro-looping.js`, `combo.js`

## Version Bumps
- `GeneralDefaults.ahk`: v7.9.51 → v7.9.53
- `Automator.ahk`: v7.9.51 → v7.9.53
- `config.ini`: v7.9.51 → v7.9.53

## Principles Established
- **InjectJSQuick Must Not Activate Windows**: Quick injection assumes Console already focused; no window activation allowed
- **Progress Bar Color Spec**: Documented segment order and exact gradient colors as engineering standard #16
