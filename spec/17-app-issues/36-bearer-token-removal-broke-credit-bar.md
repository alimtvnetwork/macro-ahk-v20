# Issue 36: Bearer Token Removal Broke Credit Progress Bar

**Version**: v7.20 → v7.22
**Date**: 2026-03-12
**Status**: Resolved

---

## Issue Summary

Removing the Bearer Token UI section in v7.20 broke credit API authentication, causing the segmented credit progress bar and all credit-related labels (M:, R:, F:, B:, ⚡available/total) to never render.

---

## Symptoms

1. MacroLoop panel loads but the status bar shows no credit progress bar.
2. Clicking "Credits" button produces HTTP 401/403 errors.
3. Workspace dropdown shows "No workspaces" because credit data never populates.
4. The segmented bar with B: (Bonus/purple), M: (Monthly/green), R: (Rollover/gray), F: (Free/yellow) labels is completely absent.

---

## Root Cause Analysis

### Direct cause

In v7.20, the `resolveToken()` function was changed to read directly from `document.cookie` for `lovable-session-id.id`. However, this cookie is `HttpOnly` — JavaScript cannot access it via `document.cookie`. The old Bearer Token UI had a manual paste fallback that masked this issue.

### Contributing factors

1. **HttpOnly cookie assumption**: The implementation assumed `lovable-session-id.id` was a JS-visible cookie. It is not — it's set with the `HttpOnly` flag by the Lovable server.
2. **No fallback chain**: v7.20 removed the localStorage-based token storage without replacing it with the extension's session-bridge mechanism.
3. **Cascading failure**: Without a valid bearer token, `fetchLoopCredits()` returns 401 → `parseLoopApiResponse()` never runs → `loopCreditState.lastCheckedAt` stays null → `updateStatus()` skips rendering `creditBarsHtml` entirely → progress bar never appears.
4. **Silent failure**: The credit bar rendering is gated by `if (loopCreditState.lastCheckedAt)`, so when credits never load, the bar silently doesn't render rather than showing an error state.

### Why the progress bar code itself was correct

The `calcSegmentPercents()`, segment rendering, and label formatting were always correct and identical between AHK and standalone versions. The bar simply never had data to render because the auth layer upstream was broken.

---

## Fix Applied (v7.21 → v7.22)

### v7.21: Session Bridge Resolution

1. Added `getBearerTokenFromSessionBridge()` that reads from `localStorage` keys seeded by the extension background: `marco_bearer_token`, `lovable-session-id`, `ahk_bearer_token`.
2. `resolveToken()` now follows priority: localStorage session bridge → JS-visible cookie fallback.
3. Extension background automatically extracts `lovable-session-id.id` cookie (via `chrome.cookies` API, which CAN read HttpOnly cookies) and seeds it into the target tab's `localStorage`.

### v7.22: Auth Diagnostic Row

1. Added `LAST_TOKEN_SOURCE` tracking variable updated by `resolveToken()`.
2. Added visible auth diagnostic row in the MacroLoop UI showing 🟢/🔴 + exact source used.
3. Row updates after every Credits API call for live feedback.

---

## Prevention Rules

> **RULE**: The `resolveToken()` function MUST NEVER rely solely on `document.cookie` for authentication. The primary auth source is always the extension's session-bridge (`localStorage` keys seeded by background). Cookie access is a fallback only.

> **RULE**: When removing UI sections, always trace the full dependency chain. The Bearer Token UI removal should have triggered analysis of: token source → API auth → credit fetch → credit state → progress bar rendering.

> **RULE**: The credit progress bar rendering is gated by `loopCreditState.lastCheckedAt`. Any change that prevents credit fetching will silently hide the entire bar. Consider adding a "Credits unavailable" fallback state.

---

## Credit Progress Bar Reference

The segmented progress bar uses these colors and order (both status bar and workspace items):

| Segment | Color Gradient | Label | Condition |
|---------|---------------|-------|-----------|
| 🎁 Bonus | `#7c3aed → #a78bfa` (purple) | `B:N` | Only if `freeRemaining > 0` |
| 💰 Monthly | `#22c55e → #4ade80` (green) | `M:N` | Only if `billingAvailable > 0` |
| 🔄 Rollover | `#6b7280 → #9ca3af` (gray) | `R:N` | Only if `rollover > 0` |
| 📅 Free | `#d97706 → #facc15` (yellow) | `F:N` | Only if `dailyFree > 0` |

Summary label: `⚡available/total` in cyan (`#22d3ee`, bold).

All values MUST be `Math.round()`'d integers. Segment widths are normalized via `calcSegmentPercents()` to never exceed 100%.

---

## Acceptance Criteria

1. ✅ `resolveToken()` returns a valid token from the session bridge (localStorage).
2. ✅ `fetchLoopCredits()` succeeds with HTTP 200 and parses workspace data.
3. ✅ Status bar shows segmented credit bar with B:/M:/R:/F: labels and ⚡available/total.
4. ✅ Workspace items show identical segmented bars (full mode) or compact ⚡ bars.
5. ✅ Auth diagnostic row shows 🟢 + source name after successful Credits call.
6. ✅ No `document.cookie` dependency for primary auth flow.

---

## Files Changed

- `standalone-scripts/macro-controller/macro-looping.js` (v7.20 → v7.22)
- `spec/11-chrome-extension/36-cookie-only-bearer.md` (updated)
- `chrome-extension/src/background/default-scripts-seeder.ts` (legacy pruning)

---

## Related Issues

- Issue 02: Status Bar Credit Display Mismatch (formula alignment)
- Issue 03: Progress Bar Missing Granted/Stale Workspace
- Spec 06: Credit System (segment colors and order reference)
