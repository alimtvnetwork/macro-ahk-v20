# Issue 54: Startup Workspace Auto-Load, Header Color, and Loop Button Regression

**Version**: v1.49.0
**Date**: 2026-03-21
**Status**: Fixed

---

## Issue Summary

### What happened

Three regressions were reported in the macro controller:
1. Header/title area looked yellow-tinted instead of white.
2. Workspaces were not reliably loaded on controller injection.
3. Start/Stop loop control looked clipped/uneven and felt unreliable to operate.

### Where it happened

- **Feature**: Macro controller top bar and startup initialization
- **File**: `standalone-scripts/macro-controller/01-macro-looping.js`
- **Functions/sections**:
  - `createUI()` title/project-name style
  - Start/Stop toggle rendering (`startStopBtn`, `updateStartStopBtn`)
  - Startup initialization `setTimeout(... refreshBearerTokenFromBestSource ... fetchLoopCreditsAsync ...)`

### Symptoms and impact

- Visual mismatch with dark theme contrast expectations.
- Inconsistent first-load experience (workspace list sometimes empty until manual user action).
- Loop control appeared partially cut and not visually aligned with other action buttons.

### How it was discovered

User report during live extension usage and repeated regression feedback.

---

## Root Cause Analysis

### Direct causes

1. **Header/project-name color token mismatch**
   - Project/title text used non-white tone (`cWarningLight` / muted tone), producing yellow-ish appearance.

2. **Startup flow was single-shot and fragile to transient auth/API failures**
   - Initial workspace fetch path had no retry window for early bridge/token timing variance.

3. **Start/Stop control used icon-only state and asymmetric styling**
   - Button width/shape changed between states and did not clearly match the standard top-bar controls.

### Contributing factors

1. Lack of explicit visual non-regression rule for title/project-name color in dark theme.
2. No startup retry guard for first auto-load attempt.
3. No explicit UI spec parity rule for Start/Stop control dimensions/shape.

### Triggering conditions

- Fresh injection timing where auth source is not ready on first pass.
- Dark theme where non-white tokens appear visibly yellow.
- Running/stopped state transitions causing asymmetrical loop button appearance.

---

## Fix Description

### What was changed

1. **Header color fix**
   - Title and project-name text changed to pure white (`#ffffff`) for dark-theme contrast.

2. **Startup workspace auto-load hardening**
   - Startup auth resolution now updates auth badge for bridge/localStorage/cookie paths.
   - Added `loadWorkspacesOnStartup(attempt)` with one retry (`2` attempts total) to reduce transient startup misses.

3. **Start/Stop button consistency fix**
   - Converted to explicit labels (`▶ Start Loop` / `⏹ Stop Loop`) with stable minimum width.
   - Kept consistent rounded control style and prevented countdown badge from intercepting clicks (`pointer-events:none`).

### Why this resolves the root causes

- White text removes ambiguous yellow tint and restores expected visual hierarchy.
- Retry + explicit fallback persistence makes startup workspace loading robust across token timing variations.
- Stable control dimensions/labels reduce clipping risk and improve loop action clarity.

---

## Prevention and Non-Regression

### Prevention rules

1. **RULE**: Macro controller title/project-name in dark mode must remain pure white for contrast consistency.
2. **RULE**: Startup workspace load must include retry tolerance and explicit token-source fallback handling.
3. **RULE**: Start/Stop control must preserve button-bar visual parity (height, corner radius, clear label text).

### Acceptance criteria / test scenarios

1. On inject, header title and project name render in pure white.
2. On inject, workspaces auto-load without manual click under valid auth.
3. If first startup workspace fetch fails transiently, one automatic retry occurs.
4. Start/Stop control is not clipped and remains fully clickable in both states.

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root cause documented
- [x] Fix plan documented
- [x] Non-regression rules added
