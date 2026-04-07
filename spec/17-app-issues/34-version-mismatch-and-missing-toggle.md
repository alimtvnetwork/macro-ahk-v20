# Issue 34: Version Mismatch After Build & Missing Macro-Controller Toggle

**Version**: v1.0.5
**Date**: 2026-03-12
**Status**: Resolved

---

## Issue Summary

### What happened

Two issues discovered after deploying v1.0.4 → v1.0.5:

1. **Version mismatch**: Popup displayed v1.0.3 after building v1.0.4 because the `EXTENSION_VERSION` constant in `constants.ts` was not bumped alongside `manifest.json`.
2. **Missing toggle**: `macro-controller.js` had no enable/disable checkbox in the popup, unlike `combo-switch.js` and `macro-looping.js`.

### Where it happened

- **Feature**: Popup header (version), Popup script list (toggles)
- **Files**:
  - `chrome-extension/src/shared/constants.ts` — stale `EXTENSION_VERSION`
  - `chrome-extension/src/popup/popup-scripts.ts` — `TOGGLEABLE_SCRIPTS` set
  - `chrome-extension/manifest.json` — version field

### Symptoms and impact

- User sees wrong version in popup header → confusion about which build is loaded.
- User cannot toggle `macro-controller.js` on/off from popup → must go to Options page.

### How it was discovered

User report with screenshot after running `run.ps1 -d -v`.

---

## Root Cause Analysis

### Direct cause

1. **Version**: `EXTENSION_VERSION` in `constants.ts` was manually maintained and not updated when `manifest.json` was bumped. The popup reads from this constant, not from `chrome.runtime.getManifest()`.
2. **Toggle**: `TOGGLEABLE_SCRIPTS` was a hardcoded whitelist containing only `combo-switch.js` and `macro-looping.js`. `macro-controller.js` was intentionally excluded during initial implementation but should have been included.

### Contributing factors

1. No single source of truth for version — two places to update (`manifest.json` + `constants.ts`).
2. No validation or build-time check that constants match manifest.
3. Toggle whitelist was conservative; only optional scripts were included initially.

### Triggering conditions

- Any version bump that updates `manifest.json` without also updating `constants.ts`.
- Any new default script not added to `TOGGLEABLE_SCRIPTS`.

### Why the existing spec did not prevent it

- No spec rule mandated that all three default scripts must be toggleable.
- No spec rule mandated version synchronization between manifest and constants.

---

## Fix Description

### What was changed

1. **Version sync**: Updated `EXTENSION_VERSION` in `constants.ts` to `1.0.5` to match `manifest.json`.
2. **Toggle**: Added `macro-controller.js` to `TOGGLEABLE_SCRIPTS` set in `popup-scripts.ts`.
3. **Build feedback**: Added version summary output at end of `run.ps1` so the built version is always visible in terminal.

### The new rules or constraints added

> **RULE-34a**: When bumping the extension version, BOTH `manifest.json` AND `constants.ts:EXTENSION_VERSION` MUST be updated in the same commit.

> **RULE-34b**: All default seeded scripts (macro-controller, combo-switch, macro-looping) MUST be present in the `TOGGLEABLE_SCRIPTS` set to allow popup-level enable/disable.

### Why the fix resolves the root cause

- Syncing the constant ensures the popup always displays the correct version.
- Adding macro-controller to the toggleable set gives it the same inline toggle UI as the other scripts.

### Config changes or defaults affected

None.

### Logging or diagnostics required

- `run.ps1` now prints `Built version: X.Y.Z` in cyan at the end of every deploy.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Every version bump must update both `manifest.json` and `constants.ts`, and every seeded default script must appear in `TOGGLEABLE_SCRIPTS`.

### Acceptance criteria / test scenarios

1. After `run.ps1 -d`, the terminal prints the correct version.
2. Popup header shows the same version as `manifest.json`.
3. All three default scripts (`macro-controller.js`, `combo-switch.js`, `macro-looping.js`) show toggle switches in the popup.

### Guardrails

- Future: Consider a build-time script that reads `manifest.json` version and writes it to `constants.ts` automatically.

### References to spec sections updated

- `spec/17-app-issues/34-version-mismatch-and-missing-toggle.md` — this file

---

## Done Checklist

- [x] `constants.ts` version synced to `1.0.5`
- [x] `macro-controller.js` added to `TOGGLEABLE_SCRIPTS`
- [x] `run.ps1` prints built version at end
- [x] Issue write-up created under `/spec/17-app-issues/`
