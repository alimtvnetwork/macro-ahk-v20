---
name: Bridge diagnostics MV3 suspension handling
description: Auth diagnostics bridge row and header badge classify MV3 service worker suspension as idle (yellow) not failed (red), with auto-wake mechanism
type: feature
---

## Bridge Diagnostics — MV3 Suspension Handling

The auth diagnostics panel classifies bridge errors into two categories:

### MV3 Suspension (normal, non-alarming)
- Errors containing "extension context invalidated" or "receiving end does not exist"
- Bridge row: 💤 Idle — service worker suspended (amber)
- Header badge: 🟡 (yellow)
- Auto-wake: sends GET_TOKEN ping via `wakeBridge()`, shows 🔄 while reconnecting

### Real Bridge Failures (alarming)
- All other bridge errors (e.g., "could not establish connection")
- Bridge row: ❌ FAILED (red)
- Header badge: 🔴 (red)

### Key Functions
- `_isServiceWorkerSuspended(error)` in `auth-diag-rows.ts` — classifies bridge errors
- `_isMv3Suspension(error)` in `section-auth-diag.ts` — same logic for header badge
- `wakeBridge()` in `auth-bridge.ts` — sends lightweight ping to wake service worker (3s timeout)

### Wiring
- `AuthDiagDeps.wakeBridge` — injected from `panel-sections.ts`
- `auth.ts` barrel re-exports `wakeBridge`
