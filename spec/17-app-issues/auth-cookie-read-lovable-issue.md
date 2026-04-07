# Issue: Auth Cookie Read Failure in Macro Controller

**Date**: 2026-03-24
**Status**: Fixed (v1.65.0) — Added Supabase localStorage scan as Tier 2 fallback
**Severity**: P0

---

## 1. Problem Description

The macro controller fails to authenticate despite the Lovable session cookie (`lovable-session-id.id`) existing in the browser. Bearer token is not refreshed, and API calls fail with auth errors.

---

## 2. Architecture Trace (End-to-End)

### Token Resolution Waterfall (`refreshBearerTokenFromBestSource`)

```
Step 1: getBearerTokenFromSessionBridge()
  → Reads localStorage keys: marco_bearer_token, lovable-session-id,
    lovable-session-id.id, ahk_bearer_token
  → SYNC, no chrome API needed

Step 2: requestTokenFromExtension(forceRefresh=false)  [5s timeout + 1 retry]
  → Same bridge path but type:'GET_TOKEN'
  → background handleGetToken() → chrome.cookies.get (no validation probe)

Step 3: requestTokenFromExtension(forceRefresh=true)  [5s timeout + 1 retry]
  → window.postMessage({type:'REFRESH_TOKEN'}) → content script relay
  → chrome.runtime.sendMessage → background handleRefreshToken()
  → chrome.cookies.get({url, name:'lovable-session-id.id'})
  → Returns {sessionId, refreshToken, authToken}

Step 4: getBearerTokenFromCookie()
  → document.cookie parse for 'lovable-session-id.id='
  → CANNOT read HttpOnly cookies (always fails for Lovable)
```

### Pre-Seeding Path (Token Seeder)

```
Extension injects token-seeder.ts before user scripts:
  → chrome.cookies.get('lovable-session-id.id') from tab URL candidates
  → chrome.scripting.executeScript → writes to localStorage:
    marco_bearer_token, lovable-session-id, lovable-session-id.id,
    lovable-session-id.refresh, marco_refresh_token
  → Step 1 above then finds the token
```

---

## 3. Root Cause Analysis

### Failure Point Matrix

| Step | Mechanism | Fails When |
|------|-----------|------------|
| 1 (localStorage) | Token seeder pre-seeds | Seeder hasn't run yet; tab not on lovable.dev/app; seeder script injection failed |
| 2-3 (extension bridge) | Content script relay → background | Content script not injected on current page; relay rate-limited; extension context invalidated; background service worker still booting |
| 4 (document.cookie) | JS cookie parse | Cookie is HttpOnly (always true for Lovable session) |

### Most Likely Failure Scenarios

**Scenario A — Content Script Not Injected**
- Macro controller runs on a page where the content script relay (`message-relay.ts`) is not injected
- `window.postMessage` goes unanswered, both bridge calls timeout after 2.5s each
- Total delay: 5s of wasted waiting before falling through to `document.cookie` (which also fails)

**Scenario B — Token Seeder Race Condition**
- Macro controller initializes before token seeder runs
- localStorage is empty at Step 1
- Bridge calls may also fail if content script isn't ready

**Scenario C — Background Service Worker Asleep (MV3)**
- Chrome suspends the background service worker after 30s idle
- First message wakes it, but cookie read takes time
- Response arrives after the 2.5s timeout in `requestTokenFromExtension`

**Scenario D — Cookie Domain Mismatch**
- Active tab URL doesn't match cookie domain
- `chrome.cookies.get({url: activeTabUrl, name: 'lovable-session-id.id'})` returns null
- Fallback candidates (`lovable.dev`, `lovable.app`, `localhost`) should catch this, but only if the cookie was set on those domains

---

## 4. Files Involved

| File | Role |
|------|------|
| `standalone-scripts/macro-controller/src/auth.ts` | Token resolution waterfall, cookie parsing, extension bridge requests |
| `standalone-scripts/macro-controller/src/shared-state.ts` | SESSION_BRIDGE_KEYS definition |
| `src/background/handlers/config-auth-handler.ts` | GET_TOKEN/REFRESH_TOKEN handlers using chrome.cookies |
| `src/background/cookie-helpers.ts` | `readCookieValueFromCandidates()` — candidate URL iteration |
| `src/background/handlers/token-seeder.ts` | Pre-seeds cookies into tab localStorage |
| `src/content-scripts/message-relay.ts` | Bridges page ↔ background (ALLOWED_TYPES includes GET_TOKEN, REFRESH_TOKEN); forwards TOKEN_UPDATED payload |
| `standalone-scripts/macro-controller/src/token-broadcast-listener.ts` | Applies TOKEN_UPDATED/TOKEN_EXPIRED broadcasts to localStorage/auth badge |

---

## 5. Specific Code Issues Found

### 5a. `getBearerTokenFromCookie()` is fundamentally broken for HttpOnly cookies
**File**: `standalone-scripts/macro-controller/src/auth.ts:289-345`
- Uses `document.cookie` which cannot read HttpOnly cookies
- Lovable sets `lovable-session-id.id` with HttpOnly flag
- This function will ALWAYS fail in production — it's only useful as diagnostic
- Already documented in spec/17-app-issues/36-bearer-token-removal-broke-credit-bar.md

### 5b. Extension bridge timeout too short for cold-start
**File**: `standalone-scripts/macro-controller/src/auth.ts:207-209`
- 2.5s timeout for `requestTokenFromExtension`
- MV3 service worker cold-start + cookie read can exceed 2.5s
- Two sequential calls = 5s total, but each individually may timeout

### 5c. No retry on bridge timeout
**File**: `standalone-scripts/macro-controller/src/auth.ts:184-210`
- If the bridge times out, the waterfall falls through to document.cookie (broken)
- No retry mechanism — a transient timeout is treated as permanent failure

### 5d. Token validation in GET_TOKEN adds latency and failure modes
**File**: `src/background/handlers/config-auth-handler.ts:94-147`
- `handleGetToken()` validates the cookie by calling `GET /projects/{id}/auth-token`
- If the API is slow/down, a valid cookie is rejected
- If no project ID in URL, validation is skipped (returns token as-is) — inconsistent

---

## 6. Fix Strategy

### Immediate Fixes

1. **Increase extension bridge timeout** from 2.5s to 5s to handle MV3 cold-start
2. **Add single retry** on bridge timeout before falling through
3. **Remove token validation from GET_TOKEN** — cookie existence IS the auth; validation should happen at API call time, not at cookie read time
4. **Fix TOKEN_UPDATED payload extraction** so broadcast tokens are read from relayed payload shape (`payload.token`)

### Structural Improvements

5. **Prioritize GET_TOKEN before REFRESH_TOKEN** in the waterfall to avoid slow refresh API path when cookie read is enough
6. **Throttle document.cookie diagnostics** to avoid log storms when HttpOnly cookie is not JS-readable
7. **Log bridge message round-trip timing** for diagnosing timeout issues
8. **Fast-path auth bridge messages during service-worker boot** so GET_TOKEN / REFRESH_TOKEN are not delayed behind heavy DB reseed tasks
9. **Support session cookie alias names** (`lovable-session-id.id`, `__Secure-lovable-session-id.id`, `__Host-lovable-session-id.id`) and the same refresh aliases for robust retrieval

---

## 7. Correct Authentication Flow (Target State)

```
[Macro Controller Init]
       ↓
[Check localStorage SESSION_BRIDGE_KEYS] ← pre-seeded by token-seeder
       ↓ (found → use immediately)
       ↓ (not found ↓)
[Extension Bridge: GET_TOKEN] ← 5s timeout, 1 retry
       ↓
[Background: chrome.cookies.get()] ← reads HttpOnly cookie
       ↓
[Return token via postMessage bridge]
       ↓ (if empty)
[Extension Bridge: REFRESH_TOKEN] ← fallback path
       ↓
[Persist to localStorage for future sync access]
       ↓
[Update auth badge UI]
```

---

## 8. Acceptance Criteria

1. Session cookie read succeeds when cookie exists (HttpOnly)
2. Bearer token refreshed and persisted to localStorage
3. API calls succeed after token refresh
4. No UI freeze during auth recovery (max 5s timeout)
5. Logs clearly show which step succeeded/failed

---

## 9. Related Issues

- spec/17-app-issues/36-bearer-token-removal-broke-credit-bar.md
- spec/17-app-issues/check-button/07-auth-bridge-stall.md
- spec/17-app-issues/42-macro-controller-button-bar-and-cookie-auth.md
- .lovable/memory/features/macro-controller/token-fallback-auth.md
