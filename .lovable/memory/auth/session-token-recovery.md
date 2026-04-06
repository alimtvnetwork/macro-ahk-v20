# Memory: auth/session-token-recovery
Updated: 2026-04-03

Auth Bridge Service provides `getBearerToken(options?)` with TTL-cached localStorage:
1. Read `marco_bearer_token` + `marco_token_saved_at` from localStorage. If fresh (within configurable TTL, default 2min), return immediately.
2. If stale/missing or `{ force: true }`, recover via multi-tier waterfall (localStorage → extension bridge → cookie fallback) with single-flight concurrency.

Additional APIs: `getRawToken()` (sync, no TTL), `getTokenAge()`, `getTokenSavedAt()`.

Root-cause references:
- `spec/02-app-issues/80-auth-token-bridge-null-on-preview.md`
- `spec/02-app-issues/81-auth-no-token-stale-macro-bundle.md`

Workflow spec: `spec/07-chrome-extension/36-cookie-only-bearer.md` (v2.0.0)
