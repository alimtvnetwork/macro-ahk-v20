# Issue 27: Available Credits Formula Wrong + Workspace Defaults to First on Load

**Version**: v7.12.0
**Date**: 2026-02-25
**Status**: Resolved

---

## Issue Summary

### Issue A: Available credits number doesn't match progress bar

The `⚡` available credit number shown in the header and workspace list items is inflated because the formula doesn't subtract `credits_used` (the usage against `credits_granted`). The progress bar segments (which show individual remaining amounts) are correct and show zero, but the `⚡` number shows 105.

**Example from P01**: credits_granted=105, credits_used=105 (freeRemaining=0), daily 5/5 used, rollover 84/84 used, billing 100/100 used. All bar segments = 0. But `available = 294 - 84 - 5 - 100 = 105` (wrong, should be 0).

### Issue B: Workspace defaults to first workspace on initial load

On first page load, the controller shows the first workspace (perWs[0]) instead of the actual workspace the project belongs to. This happens when:
1. Tier 1 (mark-viewed API) fails or returns no workspace_id
2. Tier 2 (XPath dialog) fails because the project button hasn't rendered yet (DOM not ready)
3. Fallback defaults to `perWs[0]`

---

## Root Cause Analysis

### Issue A: Missing freeUsed in calcAvailableCredits

**Formula was**:
```
Available = totalCredits - rolloverUsed - dailyUsed - billingUsed
```

**Formula should be**:
```
Available = totalCredits - rolloverUsed - dailyUsed - billingUsed - freeUsed
```

The `totalCredits` includes `credits_granted`, but the subtraction never accounted for `credits_used` (consumption of those granted credits). When granted credits are fully used (freeUsed = freeGranted), the available number was inflated by exactly `credits_granted`.

### Issue B: No retry on project button not found

`detectWorkspaceViaProjectDialog()` tried to find the project button exactly once via XPath. On initial page load, the credit API response often arrives before the full Lovable UI has rendered — the project button may not exist in the DOM yet. When `getByXPath()` returned null, the function immediately defaulted to `perWs[0]` with no retry.

---

## Fix Description

### Issue A Fix
Added `freeUsed` as 5th parameter to `calcAvailableCredits()` in both `macro-looping.js` and `combo.js`. Updated all call sites to pass `freeUsed`. Also fixed the inline fallback calculation in `updateStatus()`.

### Issue B Fix
Extracted project button discovery into `findProjectButtonWithRetry(fn, maxRetries, delayMs)` which tries up to 3 times with 1-second delays between attempts. This gives the DOM time to render on initial page load. The dialog open + poll logic was extracted to `openDialogAndPoll()` for clarity.

---

## Prevention and Non-Regression

### Prevention rule (A)
> **RULE**: `calcAvailableCredits()` MUST subtract ALL usage types that are included in `calcTotalCredits()`. If a credit type is added to totalCredits, its used counterpart MUST be added to calcAvailableCredits.

### Prevention rule (B)
> **RULE**: DOM element lookups that occur during initialization MUST include retry logic with delays. The API response will almost always arrive before the full UI renders.

### Acceptance criteria
1. P01 with all credits exhausted shows ⚡0/294 (not ⚡105/294)
2. Available number matches the sum of all progress bar segments (freeRemaining + dailyFree + rollover + billingAvailable)
3. On initial load, workspace name is detected via Tier 1 (mark-viewed API) or Tier 2 (XPath with retries)
4. Activity log shows retry attempts when project button isn't found on first try

---

## Done Checklist

- [x] Code fixed in `macro-looping.js` and `combo.js`
- [x] Issue write-up created
- [x] CHANGELOG updated (v7.12.0)
