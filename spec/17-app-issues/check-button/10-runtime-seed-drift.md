# Check Button Issue #10 — Runtime Seed Drift (TS Fix Not Applied at Runtime)

**Component**: `standalone-scripts/macro-controller/01-macro-looping.js` seeding path
**Version affected**: v1.56.0
**Status**: Fixed
**Original**: Issue #10 (Check-button series)

---

## Symptom

Check button still fails in extension runtime even though source TypeScript files already contain the correct 3-step fix:

1. Click Project button XPath
2. Read workspace name XPath
3. Read progress bar XPath while dialog is open

Observed behavior matched older broken flow (stale workspace, wrong/idle status updates).

## Root Cause Analysis

### RCA-1: Runtime script drifted from source modules

The extension seeds and injects `standalone-scripts/macro-controller/01-macro-looping.js`.
The fix was present in `src/loop-engine.ts` / `src/workspace-detection.ts`, but the standalone runtime bundle had not been rebuilt, so runtime still executed old logic.

### RCA-2: Missing release-time sync step

No guaranteed sync step enforced after Check-flow source edits:

- Source edited ✅
- Seeded runtime bundle updated ❌

---

## Fix

1. Rebuild macro controller bundle and sync runtime script:

```bash
npm run build:macro-controller
```

2. Confirm `01-macro-looping.js` contains:

- `state.isManualCheck` guard
- `detectWorkspaceViaProjectDialog(..., true)` for Step 3 dialog-open read
- `workspaceFromApi = false` at start and end of `runCheck()`
- explicit Step 3 progress read + post-read dialog close

3. Add explicit spec/code references so future edits preserve source/runtime parity.

---

## Non-Regression Rules

| # | Rule | Anti-pattern |
|---|------|-------------|
| NR-10-A | Any `runCheck` logic change must be followed by `npm run build:macro-controller` | ❌ Editing TS only and shipping stale `01-macro-looping.js` |
| NR-10-B | Keep seeded runtime aligned with Check spec (`60-check-button-spec.md`) | ❌ Runtime behavior diverges from documented 3-step flow |
| NR-10-C | Keep issue/spec links in code comments near Check logic and seeder | ❌ Fixes with no traceability to issue/spec docs |

---

## Cross-References

- [Check Button Master Overview](01-overview.md)
- [Check Button Spec](../../../spec/11-chrome-extension/60-check-button-spec.md)
- [Issue #08: workspaceFromApi Race](08-workspace-detection-race.md)
- [Issue #09: Dialog Close Before Progress Read](09-dialog-close-before-progress-read.md)
