# Check Button Issues — MacroLoop Controller

All MacroLoop **Check button** issue specs, consolidated with sequential numbering.

**Start here**: [`01-overview.md`](./01-overview.md) — master timeline, recurring root causes, and non-regression rules.

## Files

| # | File | Original Issue | Summary |
|---|------|---------------|---------|
| 01 | `01-overview.md` | — | Master overview, timeline, root causes, non-regression rules |
| 02 | `02-no-search-feedback.md` | #25 (v7.11) | No UI feedback + skipped detection when `perWs` empty |
| 03 | `03-no-workspace-update.md` | #26 (v7.11.3) | Guard blocked workspace name re-detection |
| 04 | `04-wrong-detection-path.md` | #28 (v7.12–v7.14) | `runCheck()` used wrong Tier 1 API instead of XPath |
| 05 | `05-guard-regression.md` | #32 (v7.19.x) | Countdown guard blocked manual Check |
| 06 | `06-regression-checklist.md` | #33 (v7.19+) | Manual test checklist for Check/Force/Auth |
| 07 | `07-auth-bridge-stall.md` | #46 (v1.47.0) | Auth bridge gaps + empty workspace crash path |
| 08 | `08-workspace-detection-race.md` | #08 (v7.38–v7.41) | `workspaceFromApi` race blocks XPath detection during manual Check |
| 09 | `09-dialog-close-before-progress-read.md` | #09 (v7.42) | Progress XPath always misses because dialog closes before Step 3 |
| 10 | `10-runtime-seed-drift.md` | #10 (v1.56.0) | Runtime seeded script drifted from TS source, so Check fix never reached injected script |

## Scope Rule

Only place issues here if the primary failure is in manual **Check** flow behavior (`runCheck`, check button click path, or Check-triggered fallback/recovery).
