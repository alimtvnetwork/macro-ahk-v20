# Memory: auth/startup-fix-v2137
Updated: 2026-04-13

## Startup fix aligned to v1.133 diagram

### What was wrong
The startup path still deviated from the v1.133 working flow even after the first pass:
1. `handleCreditSuccess()` had a malformed promise chain around `autoDetectLoopCurrentWorkspace(...)`
2. `scheduleWorkspaceRetry()` still re-entered the async auth bridge via `getBearerToken()` instead of following the v1.133 sync reuse path
3. `AuthManager.recoverOnce()` still exposed legacy `recoverAuthOnce()` instead of the unified forced-recovery contract
4. Startup still imported both `resolveToken` and `getBearerToken`, but only retry/resync should use async bridge recovery

### Final aligned behavior
- `ensureTokenReady()` remains the single startup auth gate
- After the gate succeeds, startup reuses the resolved token synchronously with `resolveToken()` for:
  - Tier 1 prefetch startup path
  - workspace auto-detect fallback
  - startup workspace retry fallback after cookie read
- `getBearerToken()` remains only for:
  - auth auto-resync on focus/visibility
- `AuthManager.getToken()` uses `getBearerToken()`
- `AuthManager.recoverOnce()` uses `getBearerToken({ force: true })`

### Validation
- `tsc --noEmit -p tsconfig.macro.build.json` passes
- Startup root path now matches the RCA diagram’s v1.133 lane: gate once, then sync token reuse
