# Issue 46: Auth Session Bridge Gaps + Manual Check Stall

**Version**: v1.47.0
**Date**: 2026-03-20
**Status**: Fixed

---

## Issue Summary

### What happened

Users reported that token/cookie-based auth recovery was unreliable, and the **Check** button could fail without completing the flow.

### Where it happened

- **Feature**: Macro controller auth fallback + manual check diagnostics
- **Files**:
  - `standalone-scripts/macro-controller/01-macro-looping.js`
  - `src/background/handlers/config-auth-handler.ts`
  - `src/background/handlers/token-seeder.ts`
  - `src/content-scripts/message-relay.ts`

### Symptoms and impact

- “Read Session Cookie” frequently failed when cookies were HttpOnly.
- Manual token refresh paths did not consistently recover a usable bearer token.
- Manual **Check** could fail mid-path when no workspace list existed and fallback code attempted invalid defaults.

### How it was discovered

User-reported runtime failures during real extension use.

---

## Root Cause Analysis

### Direct cause

1. Auth UX paths relied on `document.cookie` reads, which cannot access HttpOnly session cookies.
2. Manual check fallback (`closeDialogAndDefault`) assumed `perWs[0]` always existed, causing a crash path when workspace list was empty.
3. Cookie lookup in background auth used static primary URL first, reducing reliability on preview/subdomain contexts.

### Contributing factors

1. Bridge-based token refresh path was not uniformly used in macro UI actions.
2. Message relay allowlist lacked `REFRESH_TOKEN` for page→extension bridge fallback.

### Triggering conditions

- Session token unavailable in page-visible cookies, but available through extension cookie APIs.
- Workspace API unavailable/unauthorized + dialog XPath fallback miss while `perWs` is empty.

### Why existing specs did not prevent it

Specs covered cookie strategy and check behavior, but lacked explicit guardrails for:
- HttpOnly-only runtime token refresh in macro UI controls.
- Empty-workspace fallback safety invariants.

---

## Fix Description

### What was changed

- Auth fallback updated to prioritize session bridge + extension bridge before cookie-only read.
- Manual check fallback hardened for empty workspace arrays.
- Background cookie read uses active-tab URL candidates first.
- Token seeder now writes compatibility keys for session/refresh values.
- Relay allowlist includes `REFRESH_TOKEN`.

### Why this resolves the issue

- Auth no longer depends on JS-visible cookies alone.
- Check flow cannot crash when no workspace list is available.
- Cookie resolution aligns with active tab context, improving real-world match rates.

### Logging or diagnostics required

- Keep explicit logs for token source (`localStorage`, extension bridge, cookie fallback).
- Keep explicit check-step logs for fallback and restore behavior.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: Never depend on `document.cookie` as the only auth recovery path for extension-injected scripts.

### Acceptance criteria / test scenarios

1. Session bridge token unavailable + refresh cookie available → auth recovers via extension bridge.
2. Manual Check with empty `perWs` does not throw and restores prior workspace state safely.
3. Preview/subdomain tabs still resolve cookies through candidate URL strategy.

---

## TODO and Follow-Ups

1. [ ] Apply VS Code-inspired dual themes (dark/light) for macro controller.
2. [ ] Add explicit Activity Log download affordance beside Activity Log section header/body.
3. [ ] Create future spec for in-app theme/font creation and project-level theme variables.
4. [ ] Create architecture issue for TypeScript-first standalone scripts build pipeline.
5. [ ] Create architecture issue for SQLite-first storage migration (prompts + large state).
6. [ ] Create architecture issue for project-scoped key/value API + file-drop persistence model.

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root cause documented
- [x] Startup auth sequence fixed (v7.27): extension bridge → localStorage → cookie → error
- [x] Detailed error logging on API failures (URL, auth source, retry state)
- [ ] End-to-end verification complete