# Issue 80 — Auth Bridge Returns No Token on Preview Tabs

| Field | Value |
|---|---|
| ID | 80 |
| Status | ✅ Fixed |
| Severity | P0 / Authentication |
| Version | 1.70.0 |
| Created | 2026-03-26 |
| Component | Macro Controller + Extension Bridge |

---

## Symptom

Macro controller startup fails with:

> ⚠️ Auth failed — no token after 6s

Auth trace showed:
- `Token Source: none`
- `Bridge Result: FAIL: No token returned`
- Session cookie bindings resolved, but no JWT reached the macro controller.

## Root Cause

### RC1 — No resilient JWT fallback when `/auth-token` exchange misses
`GET_TOKEN`/`REFRESH_TOKEN` depended primarily on `/projects/{id}/auth-token` exchange.
When exchange returned no JWT (cookie mismatch, cold worker, or environment-specific auth shape), handlers returned empty token without recovering from already-available Supabase `sb-*-auth-token` localStorage state in other open platform tabs.

### RC2 — Incomplete domain coverage for extension matching
Manifest/content-script and background tab pattern matching excluded apex domains (`https://lovable.app/*`, `https://lovableproject.com/*`) in key places, causing inconsistent relay/seeding coverage depending on where the user was logged in.

### RC3 — Weak refresh diagnostics
`REFRESH_TOKEN` returned nullable fields without a strong `errorMessage` when JWT derivation failed, surfacing as generic `No token returned` in the macro panel.

---

## Failure Chain

1. Macro controller starts on a preview tab (`*.lovable.app`).
2. localStorage has no JWT (preview tab has no Supabase session).
3. Bridge sends `GET_TOKEN` to extension background.
4. Background attempts `/auth-token` exchange — fails (cookie mismatch or cold worker).
5. No fallback scan of platform tabs for `sb-*-auth-token` localStorage.
6. Bridge returns empty token with no actionable error message.
7. `ensureTokenReady(6000)` hits timeout → UI shows "no token after 6s".

---

## Fix Implemented

1. **Added resilient JWT fallback in background auth handlers**
   - If exchange fails, scan platform tabs (`lovable.dev/app/lovableproject`) via `chrome.scripting.executeScript` for Supabase `sb-*-auth-token` JWTs.
   - If session cookie value itself is JWT-like, accept it.

2. **Improved refresh error propagation**
   - `handleRefreshToken()` now returns `errorMessage` when no JWT could be resolved.

3. **Expanded extension domain coverage**
   - Added apex patterns for `lovable.app` and `lovableproject.com` in:
     - `chrome-extension/manifest.json` (host permissions + content script matches)
     - `src/background/cookie-watcher.ts` target tab patterns

4. **Added URL context to bridge requests**
   - Macro controller now posts `tabUrl` / `pageUrl` on auth bridge requests to strengthen URL/project resolution.

---

## Files Changed

| File | Change |
|---|---|
| `src/background/handlers/config-auth-handler.ts` | Added JWT fallback scan of platform tabs |
| `chrome-extension/manifest.json` | Added apex domain host permissions |
| `src/background/cookie-watcher.ts` | Expanded target tab patterns |
| `standalone-scripts/macro-controller/src/auth.ts` | Added tabUrl/pageUrl to bridge requests |
| `.lovable/memory/auth/session-token-recovery.md` | New memory file documenting auth recovery |

---

## Validation Checklist

- [ ] On preview tab, startup no longer shows "no token after 6s"
- [ ] Auth Trace shows source as extension/localStorage instead of `none`
- [ ] Bridge diagnostics include actionable error text when token is unavailable
- [ ] Works on both apex and subdomain routes (`lovable.app`, `*.lovable.app`, `lovableproject.com`, `*.lovableproject.com`)

---

## Cross-References

- Follow-up issue: [#81 — Auth still fails due to stale bundle](81-auth-no-token-stale-macro-bundle.md)
- Memory: `.lovable/memory/auth/session-token-recovery.md`
