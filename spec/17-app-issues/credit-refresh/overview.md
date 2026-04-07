# Issue: Credit Refresh Button Does Not Reload Workspace

**ID**: credit-refresh-no-reload  
**Status**: 🔧 In Progress  
**Severity**: High  
**Date**: 2026-03-23  
**Version**: 1.60.0

---

## Problem

The **Credits** button (💰) in the macro controller overlay calls `fetchLoopCreditsWithDetect()` but:

1. **No loading state** — the button gives no visual feedback while the API call is in-flight.
2. **No workspace focus** — after fetching, the UI does not scroll/navigate to the current workspace in the workspace list.
3. **No token freshness check** — the button does not verify the bearer token age before making the request.

## Expected Behavior

When the user clicks the Credits button:

1. Button shows loading state (e.g., spinner icon, disabled).
2. Call `authBridge.getBearerToken()` — the Auth Bridge internally checks token age against configurable TTL (default 2 min from config). If stale, it reads the session cookie and saves a fresh token before returning.
3. Make the `GET /user/workspaces` API call with the bearer token.
4. **If success**: Parse response → update workspace list + credit bars → scroll to current workspace → restore button.
5. **If failure (401/403/network error)**: Call `authBridge.getBearerToken({ force: true })` to force a cookie read regardless of TTL → retry the API request once with the fresh token.
6. **If retry also fails**: Show error toast with copy button → restore button. No further retries.

## Flow

```
Click Credits →
  show loading state →
  authBridge.getBearerToken() →
    [Auth Bridge checks token age vs TTL config]
    [If fresh → return cached token]
    [If stale → read cookie, save to localStorage, return fresh token]
  →
  GET /user/workspaces (first attempt) →
    Success →
      parseLoopApiResponse() →
      syncCreditStateFromApi() →
      focusCurrentWorkspace() →
      ui.update() →
      restore button
    Failure →
      authBridge.getBearerToken({ force: true }) →
        [Auth Bridge reads cookie, ignores TTL cache]
        [Save fresh token + timestamp to localStorage]
      →
      GET /user/workspaces (retry) →
        Success → parse + display (same as above)
        Failure → show error toast with copy button → restore button
```

No user-facing toast unless the final retry also fails.

## Root Cause

The Credits button `onclick` handler is a single line:
```js
creditBtn.onclick = function() { deps.fetchLoopCreditsWithDetect(false); };
```

It delegates entirely to `fetchLoopCredits` which:
- Does not add loading UX to the button
- Does not leverage Auth Bridge TTL checking before calling
- Does not retry with force-refreshed token on first failure
- Does not focus the current workspace after success

## Fix Location

- `standalone-scripts/macro-controller/src/ui/panel-builder.ts` — Credits button onclick
- `standalone-scripts/macro-controller/src/credit-fetch.ts` — post-parse workspace focus
- `standalone-scripts/macro-controller/src/core/CreditManager.ts` — add `refreshWithFocus()` method

## Related

- `spec/17-app-issues/authentication-freeze-and-retry-loop.md`
- `spec/17-app-issues/55-workspace-api-missing-bearer-token.md`
- `spec/11-chrome-extension/36-cookie-only-bearer.md` — Auth Bridge Service spec
- Memory: `auth/session-token-recovery`
- Memory: `features/macro-controller/token-fallback-auth`
