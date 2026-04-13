# Memory: auth/session-token-recovery
Updated: 2026-04-13

Auth Bridge Service provides `getBearerToken(options?)` as the **single unified entry point** for all runtime auth consumers. TTL-cached localStorage:
1. Read `marco_bearer_token` + `marco_token_saved_at` from localStorage. If fresh (within configurable TTL, default 2min), return immediately.
2. If stale/missing or `{ force: true }`, recover via multi-tier waterfall (localStorage → extension bridge → cookie fallback) with single-flight concurrency.

Additional APIs: `getRawToken()` (sync, no TTL), `getTokenAge()`, `getTokenSavedAt()`.

**v2.136 contract**: All operational paths (startup, loop-cycle, credit-fetch, credit-balance, ws-move, rename-api, ws-adjacent, UI controls) now use `getBearerToken()` exclusively. Direct `resolveToken()` is reserved for diagnostic display only. Direct `recoverAuthOnce()` is deprecated.

Root-cause references:
- `spec/17-app-issues/80-auth-token-bridge-null-on-preview.md`
- `spec/17-app-issues/81-auth-no-token-stale-macro-bundle.md`
- `spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/02-working-v133-vs-current-rca.md`

Workflow spec: `spec/11-chrome-extension/36-cookie-only-bearer.md` (v2.0.0)
