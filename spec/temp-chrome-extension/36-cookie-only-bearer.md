# Auth Bridge Service — Workflow Specification

**Version**: v2.0.0  
**Date**: 2026-04-03  
**Supersedes**: Auth Bridge Waterfall v1.x (4-tier waterfall, Supabase scan, broadcast)

---

## Overview

The Auth Bridge is a **service** that components call to obtain a bearer token for API requests. Components never manage tokens themselves — they ask the Auth Bridge for a token and use it.

---

## Public Methods

| Method | Description |
|---|---|
| `getBearerToken()` | Returns a valid bearer token. Uses TTL-cached localStorage first, falls back to Lovable session cookie if stale/missing. Saves fresh tokens to localStorage. |
| `getRawToken()` | Returns the current localStorage token as-is, without any freshness check. Use for non-critical reads. |
| `getTokenAge()` | Returns milliseconds since the token was last saved. Useful for diagnostics. |

---

## Token Resolution Flow (`getBearerToken`)

```
1. Read `marco_bearer_token` + `marco_token_saved_at` from localStorage
2. If token exists AND (now - savedAt) < TTL → return cached token
3. If token missing OR stale:
   a. Read `lovable-session-id` cookie (via chrome.cookies.get in extension context)
   b. Save token + current timestamp to localStorage
   c. Return fresh token
```

### TTL Configuration

The TTL (time-to-live) controls how long a cached token is considered fresh. Default: **2 minutes** (120000ms). Configurable via `marco_config_overrides.tokenTtlMs` in `chrome.storage.local`.

While the token is fresh (within TTL), `getBearerToken()` returns instantly from localStorage with zero network/cookie overhead.

---

## How Components Use It

Any component that needs to make an authenticated API request follows this pattern:

```
1. Component prepares its request (URL, body, method)
2. Component calls authBridge.getBearerToken()
3. Auth Bridge returns token (from cache or cookie fallback)
4. Component makes API request with Authorization: Bearer <token>
5. If request succeeds → process response
6. If request fails with 401 → component can call getBearerToken() with force-refresh flag
```

### Example: Credit Balance Check

```
1. User clicks "Check Credits"
2. Prepare: GET /user/workspaces
3. Call authBridge.getBearerToken() → receives token
4. Make request with bearer token
5. Success → display workspaces, scroll to current, highlight credits
6. Failure → show error toast
```

### Example: Workspace Loader

```
1. On page load or manual refresh
2. Prepare: GET /user/workspaces
3. Call authBridge.getBearerToken() → receives token
4. Make request with bearer token
5. Success → populate workspace dropdown
6. Failure → show error state
```

---

## localStorage Schema

| Key | Value | Description |
|---|---|---|
| `marco_bearer_token` | JWT string | The current bearer token |
| `marco_token_saved_at` | Unix timestamp (ms) | When the token was last saved |

Both keys are written together atomically. Any component reading `marco_bearer_token` directly gets the latest token, but should prefer calling `getBearerToken()` to benefit from TTL + automatic refresh.

---

## Why No Broadcast / No Supabase Scan

- **No broadcast needed**: All components read from the same localStorage. When the Auth Bridge saves a fresh token, it's immediately available to all components on the same origin.
- **No Supabase scan**: The system does not use Supabase. Tokens come from the Lovable session cookie only.
- **No multi-tier fallthrough**: Two steps are sufficient — localStorage cache with TTL, and cookie fallback. Adding more tiers adds complexity without value.

---

## Design Principles

1. **Components don't manage tokens** — they call the Auth Bridge
2. **Reads are cheap** — localStorage within TTL returns instantly
3. **Writes are consolidated** — only the Auth Bridge writes tokens
4. **Cookie reads are rare** — only when TTL expires (every ~2 min max)
5. **No unnecessary validation** — if a token is within TTL, trust it
6. **Configurable** — TTL is adjustable via config settings

---

*Auth Bridge Service spec v2.0.0 — 2026-04-03*
