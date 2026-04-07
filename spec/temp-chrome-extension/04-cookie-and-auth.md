# Chrome Extension — Cookie & Auth Specification

**Version**: v0.2 (Updated)
**Date**: 2026-03-02

---

## Purpose

The Chrome extension's primary authentication advantage over the AHK approach is **native cookie access** via `chrome.cookies` API. This eliminates the HttpOnly cookie problem that makes `document.cookie` useless for reading the Lovable session token.

---

## Lovable Session Cookies

Lovable uses two HttpOnly cookies for authentication:

| Cookie Name | Role | Purpose |
|---|---|---|
| `lovable-session-id.id` | **Session** | Primary bearer token for API authentication |
| `lovable-session-id.refresh` | **Refresh** | Used to obtain a new session when the ID expires |

Both cookies are:
- Set on domain `lovable.dev`
- Flagged `HttpOnly` (not readable via `document.cookie`)
- Flagged `Secure` (HTTPS only)

---

## The Cookie Problem (AHK / Current)

The Lovable session cookies are set with the `HttpOnly` flag by the server. This means:

- ✅ Visible in DevTools → Application → Cookies
- ✅ Sent automatically with `fetch(..., { credentials: 'include' })`
- ❌ **NOT** readable via `document.cookie` in JavaScript
- ❌ Cannot be extracted by injected content scripts via DOM APIs

**Current workaround**: User manually copies the token from DevTools → Cookies tab and pastes it into the controller's bearer token input. This is error-prone and the token expires, requiring repeated manual intervention.

---

## The Cookie Solution (Chrome Extension)

The `chrome.cookies` API can read **all** cookies including HttpOnly ones:

```javascript
// background.js (service worker)
async function getLovableSessionId() {
  const cookie = await chrome.cookies.get({
    url: 'https://lovable.dev',
    name: 'lovable-session-id.id'
  });
  return cookie?.value ?? null;
}

async function getLovableRefreshToken() {
  const cookie = await chrome.cookies.get({
    url: 'https://lovable.dev',
    name: 'lovable-session-id.refresh'
  });
  return cookie?.value ?? null;
}
```

### Required Permissions

> **Note**: The permissions below are a subset. The canonical manifest with all permissions is in `17-build-system.md` and `01-overview.md` §Consolidated Manifest Permissions.

```json
// manifest.json (cookie-related subset)
{
  "permissions": [
    "cookies"
  ],
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://api.lovable.dev/*",
    "https://*.lovable.app/*"
  ]
}
```

---

## Default Cookie Bindings (Lovable Automation Project)

The default "Lovable Automation" project seeds two cookie bindings automatically:

```json
{
  "cookies": [
    {
      "cookieName": "lovable-session-id.id",
      "url": "https://lovable.dev",
      "role": "session",
      "description": "Lovable session ID — primary bearer token for API auth"
    },
    {
      "cookieName": "lovable-session-id.refresh",
      "url": "https://lovable.dev",
      "role": "refresh",
      "description": "Lovable refresh token — used to obtain a new session"
    }
  ]
}
```

Scripts bound to this project automatically resolve the session ID cookie for `Authorization: Bearer` headers.

---

## Token Flow

```
┌──────────────┐    chrome.cookies.get()    ┌──────────────┐
│   Lovable    │ ──────────────────────────► │  background  │
│   Cookie     │    (reads HttpOnly cookie)  │   .js        │
│   Store      │                             │              │
│  .id         │                             │  sessionId   │
│  .refresh    │                             │  refreshToken│
└──────────────┘                             └──────┬───────┘
                                                    │
                                        chrome.runtime.sendMessage
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │  content     │
                                             │  script      │
                                             │  (combo.js / │
                                             │  macro-loop) │
                                             └──────────────┘
                                                    │
                                          fetch() with Bearer
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │  Lovable     │
                                             │  API         │
                                             └──────────────┘
```

### Sequence

1. Content script needs a token → sends `{ type: 'GET_TOKEN' }` to background
2. Background calls `chrome.cookies.get()` for `lovable-session-id.id` → returns session ID
3. Content script uses token as `Authorization: Bearer {sessionId}` header
4. On 401/403 → content script sends `{ type: 'REFRESH_TOKEN' }` → background re-reads both cookies
5. If session cookie is gone → use refresh token to obtain new session, or notify user to log in
6. Content script can also send `{ type: 'GET_TOKENS' }` to get both session + refresh at once

---

## Token Caching

```javascript
// background.js
let cachedSessionId = null;
let cachedRefreshToken = null;
let cachedAt = 0;
const TOKEN_CACHE_TTL_MS = 30000; // 30 seconds

async function getTokens() {
  const now = Date.now();
  if (cachedSessionId && (now - cachedAt) < TOKEN_CACHE_TTL_MS) {
    return { sessionId: cachedSessionId, refreshToken: cachedRefreshToken };
  }
  cachedSessionId = await readCookie('lovable-session-id.id');
  cachedRefreshToken = await readCookie('lovable-session-id.refresh');
  cachedAt = now;
  return { sessionId: cachedSessionId, refreshToken: cachedRefreshToken };
}
```

---

## Cookie Change Listener

```javascript
// background.js — listen for cookie changes (login/logout/expiry)
chrome.cookies.onChanged.addListener(function(changeInfo) {
  const cookieName = changeInfo.cookie.name;
  const isLovableDomain = changeInfo.cookie.domain.includes('lovable.dev');
  const isSessionCookie = cookieName === 'lovable-session-id.id';
  const isRefreshCookie = cookieName === 'lovable-session-id.refresh';
  const isRelevantCookie = isLovableDomain && (isSessionCookie || isRefreshCookie);

  if (!isRelevantCookie) return;

  if (changeInfo.removed) {
    // Cookie was deleted (logout or expiry)
    if (isSessionCookie) cachedSessionId = null;
    if (isRefreshCookie) cachedRefreshToken = null;
    // Notify content scripts
    chrome.tabs.query({ url: 'https://lovable.dev/*' }, function(tabs) {
      tabs.forEach(function(tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'TOKEN_EXPIRED', cookie: cookieName });
      });
    });
  } else {
    // Cookie was set/updated (login or refresh)
    if (isSessionCookie) cachedSessionId = changeInfo.cookie.value;
    if (isRefreshCookie) cachedRefreshToken = changeInfo.cookie.value;
    cachedAt = Date.now();
  }
});
```

---

## Auth Modes Comparison

| Mode | AHK (Current) | Chrome Extension |
|------|---------------|------------------|
| Cookie Session | `credentials: 'include'` (works for same-origin fetch only) | `chrome.cookies.get()` → Bearer header (works for all requests) |
| Manual Token | User pastes from DevTools | Eliminated — auto-read from `lovable-session-id.id` cookie |
| Token Expiry | Red indicator, manual re-paste | Auto-refresh via `cookies.onChanged` + refresh token fallback |
| HttpOnly Cookies | ❌ Cannot read | ✅ Full access via `chrome.cookies` API |

---

## Security Considerations

1. **Minimal permissions** — Only request `cookies` for `lovable.dev` domain, not all sites
2. **Token never stored in extension storage** — Read fresh from cookie each time (with short TTL cache)
3. **No token in logs** — Same REDACTED logging pattern as current controllers
4. **Content Security Policy** — Extension CSP prevents XSS injection into the extension itself
5. **Cookie bindings are project-scoped** — Each project declares which cookies it needs, limiting exposure
