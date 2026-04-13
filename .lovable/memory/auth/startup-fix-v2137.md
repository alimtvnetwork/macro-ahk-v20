# Memory: auth/startup-fix-v2137
Updated: 2026-04-13

## Fix Applied (v2.137.0)

### Root Cause
Three compounding issues caused slow/broken startup:
1. `AUTH_READY_TIMEOUT_MS` was 12s (v1.133 used 2s) — gate waited far too long
2. `launchCreditAndWorkspaceLoad()` re-entered auth via async `getBearerToken()` after the gate already resolved the token — double auth gating
3. Root auth surface (`api.auth.getToken`, `AuthManager.getToken`) exposed legacy `resolveToken` instead of unified `getBearerToken`

### Changes
1. **startup-token-gate.ts**: `AUTH_READY_TIMEOUT_MS` reduced from 12s → 2s
2. **startup.ts**: Replaced async `getBearerToken()` calls with synchronous `resolveToken()` in `launchCreditAndWorkspaceLoad` and `handleCreditSuccess` — token is already resolved by the gate, no re-entry needed
3. **macro-looping.ts**: Auth global `api.auth.getToken` now exposes `getBearerToken` (unified contract) instead of `resolveToken`
4. **AuthManager.ts**: `getToken()` returns `Promise<string>` via `getBearerToken()` instead of sync `resolveToken()`
5. **MacroController.ts**: `AuthManagerInterface.getToken()` updated to `Promise<string>`

### Design Rule
After `ensureTokenReady()` succeeds, always use synchronous `resolveToken()` for immediate token reuse. Reserve async `getBearerToken()` for operational paths that need TTL-aware recovery (API calls, loop cycles, UI controls).
