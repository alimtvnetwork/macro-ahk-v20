# Issue #93 — Auth Diagnostics Red Badge on Normal MV3 Suspension

**Status**: ✅ Fixed  
**Version**: v2.131.0  
**Date**: 2026-04-11  
**Severity**: UX / Cosmetic  
**Component**: macro-controller → ui/section-auth-diag, ui/auth-diag-rows

---

## Issue Summary

The Auth Diagnostics header badge (🔴) and Bridge row showed alarming red "FAILED — Extension context invalidated" status when the Chrome MV3 service worker was simply suspended due to inactivity. This is normal MV3 behavior (service workers suspend after ~30s idle), not an actual failure. The token was still successfully resolved from localStorage, so the red indicator was misleading.

---

## Root Cause Analysis

### Primary Root Cause
Three layers of code treated MV3 service worker suspension as a hard failure:

1. **`updateBridgeRow()`** in `auth-diag-rows.ts`: Any non-success bridge outcome was rendered with ❌ and red text, regardless of whether the error was "Extension context invalidated" (normal MV3 idle) or an actual bridge failure.

2. **`performAuthDiagUpdate()`** in `section-auth-diag.ts`: The SDK diag block checked `diag.bridgeOutcome === 'error'` and set the header badge to 🔴 without distinguishing between MV3 suspension errors and real bridge failures.

3. **No auto-reconnect**: When the bridge was in "idle" state, there was no mechanism to wake the service worker and re-check — the stale error persisted until the user manually refreshed.

### Error Classification Gap
The code lacked a classification function to distinguish between:
- **MV3 suspension errors** (normal): "Extension context invalidated", "Receiving end does not exist"
- **Real bridge failures** (actionable): "Could not establish connection", transport failures

---

## Fix Description

### Phase 1: Soften Bridge Row Display (auth-diag-rows.ts)
- Added `_isServiceWorkerSuspended()` helper that checks error messages for known MV3 suspension patterns
- When bridge error matches suspension patterns: show 💤 icon with amber "Idle — service worker suspended" instead of ❌ red "FAILED"
- Updated help tooltip text to explain this is normal MV3 behavior

### Phase 2: Auto-Reconnect Mechanism (auth-bridge.ts)
- Added `wakeBridge()` export — sends a lightweight GET_TOKEN ping via content script relay with 3s timeout
- When bridge row detects suspended state: shows 🔄 "Reconnecting…", calls `wakeBridge()`
- If service worker responds: updates to ✅ "OK — reconnected after idle"
- If still unresponsive: falls back to 💤 "Idle — service worker suspended"

### Phase 3: Header Badge Fix (section-auth-diag.ts)
- Added `_isMv3Suspension()` helper in section-auth-diag.ts
- When SDK diag reports `bridgeOutcome === 'error'` but controller bridge error matches suspension patterns: show 🟡 (yellow) instead of 🔴 (red)
- Only show 🔴 for genuine bridge errors or "no token from any source"

### Files Changed
| File | Change |
|---|---|
| `src/ui/auth-diag-rows.ts` | Added `_isServiceWorkerSuspended()`, updated `updateBridgeRow()` with 3-state logic + auto-wake |
| `src/ui/section-auth-diag.ts` | Added `_isMv3Suspension()`, updated header badge logic, added `wakeBridge` to `AuthDiagDeps` |
| `src/auth-bridge.ts` | Added `wakeBridge()` export with ping/timeout mechanism |
| `src/auth.ts` | Re-exported `wakeBridge` from barrel |
| `src/ui/panel-sections.ts` | Wired `wakeBridge` dependency |

---

## Iterations History

| # | Action | Result |
|---|---|---|
| 1 | Softened bridge row: 💤 instead of ❌ for MV3 suspension | Bridge row fixed, but header badge still red |
| 2 | Added `wakeBridge()` auto-reconnect mechanism | Bridge auto-wakes on diagnostics refresh |
| 3 | Fixed header badge: used controller bridge error to classify MV3 suspension | Initial attempt used `diag.bridgeError` which doesn't exist on SDK type |
| 4 | Fixed TS error: read error from `ctx.deps.getLastBridgeOutcome()` instead of SDK diag | Build passes, badge shows 🟡 for suspended, 🔴 only for real errors |

---

## Prevention and Non-Regression

### Design Principle
All bridge error displays must classify errors before choosing severity indicators. MV3 service worker lifecycle events (suspend, wake, context invalidation) are **operational states**, not failures.

### Guard Rails
- `_isServiceWorkerSuspended()` and `_isMv3Suspension()` centralize the classification logic
- Any new bridge error patterns should be added to these functions
- The auto-wake mechanism ensures stale "suspended" states self-resolve

### Test Scenarios
- [ ] Bridge reports "Extension context invalidated" → badge shows 🟡, row shows 💤 or auto-reconnects
- [ ] Bridge reports "Receiving end does not exist" → same as above
- [ ] Bridge reports "Could not establish connection" → badge shows 🔴, row shows ❌ FAILED
- [ ] Bridge reports success → badge shows 🟢, row shows ✅
- [ ] No bridge attempt → badge follows source row, bridge row shows ⚪

---

## TODO and Follow-Ups

- [ ] Add `bridgeError` field to `MarcoSDKAuthResolutionDiag` type so SDK diag carries the error message directly (avoids cross-referencing controller state)
- [ ] Consider adding a "last wake attempt" timestamp to avoid spamming wake pings on rapid diagnostics refreshes
- [ ] Align title bar auth badge (`loop-auth-badge`) with same MV3 suspension logic

---

## Done Checklist

- [x] Bridge row shows 💤/🔄 instead of ❌ for MV3 suspension
- [x] Auto-reconnect wakes service worker and updates badge
- [x] Header badge shows 🟡 instead of 🔴 for MV3 suspension
- [x] Help tooltip explains normal MV3 behavior
- [x] TypeScript build passes cleanly
- [x] Issue spec created
