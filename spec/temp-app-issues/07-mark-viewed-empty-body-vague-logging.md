# Issue #07: mark-viewed Returns Empty Body + Vague Fetch Logging

**Version**: v7.9.22 → v7.9.24
**Severity**: High — Workspace detection silently fails; logs provide no actionable data
**Status**: Fixed in v7.9.24

---

## Summary

The `POST /projects/{projectId}/mark-viewed` endpoint returns HTTP 200 with an **empty body** (content-length=0). Prior to v7.9.23, the code used `resp.json()` which threw `"Unexpected end of JSON input"`, causing workspace detection to fall back to DOM scraping (which found "Preview" → defaulted to first workspace P01).

Additionally, the fetch logging across both `macro-looping.js` and `combo.js` was **vague**: it did not include the full URL, bearer token (sanitized), request headers, response status, content-type, content-length, or response body preview. This made remote debugging nearly impossible.

---

## Root Cause Analysis (RCA)

### Primary Cause: `resp.json()` on Empty 200 Response

The `mark-viewed` API endpoint is a side-effect endpoint (it marks a project as viewed). It returns:
- HTTP 200 with an empty body (content-length: 0)
- OR HTTP 204 No Content

Calling `resp.json()` on an empty body throws:
```
Failed to execute 'json' on 'Response': Unexpected end of JSON input
```

This was caught as a generic error ("mark-viewed API failed: ...") and the system fell through to DOM fallback, which found "Preview" text and defaulted to P01.

### Secondary Cause: Vague Logging

Every fetch call logged only:
- `"POST <url>"` — no auth method, no token preview
- `"mark-viewed API failed: <error>"` — no status code, no content-type, no body preview
- `"mark-viewed response length=0"` — no content-type, no headers

Missing from logs:
1. **Auth method used** (bearer vs cookies)
2. **Bearer token preview** (first 12 chars, redacted)
3. **Request headers** (what was actually sent)
4. **Response status + statusText** (200 OK vs 204 No Content)
5. **Response content-type** (was it JSON? text/plain? none?)
6. **Response content-length** (header value, not just body length)
7. **Response body preview** (first 200 chars)
8. **Error body** on non-2xx responses

---

## Fix Description (v7.9.24)

### 1. Comprehensive Fetch Logging Standard

Every fetch call now logs:

**Before request:**
```
POST https://api.lovable.dev/projects/{id}/mark-viewed
  Auth: Bearer eyJhbGci...REDACTED | cookies only (no bearer)
  Request headers: {"Accept":"application/json","Content-Type":"application/json","Authorization":"Bearer eyJhbGci...REDACTED"}
  Request body: {}
  wsById keys count: 168
```

**After response:**
```
Response status=200 statusText="OK" content-type="application/json" content-length=(not set)
Response body length=0 status=200 body-preview="(empty)"
```

**On error:**
```
HTTP 401 error body: {"error":"unauthorized","message":"Invalid token"}
```

### 2. Safe Empty Body Handling (from v7.9.23)

Uses `resp.text()` + manual `JSON.parse()` instead of `resp.json()`:
```javascript
return resp.text().then(function(bodyText) {
  bodyText = (bodyText || '').trim();
  if (!bodyText) {
    // Empty body — use reverse DOM lookup
    reverseWorkspaceLookup(fn, perWs, wsById);
    return;
  }
  var data;
  try { data = JSON.parse(bodyText); } catch(e) {
    // Invalid JSON — log raw body and use fallback
  }
});
```

### 3. Applied to ALL Fetch Calls

| File | Function | Endpoint |
|------|----------|----------|
| macro-looping.js | `autoDetectLoopCurrentWorkspace.doFetch` | POST mark-viewed |
| macro-looping.js | `fetchLoopCredits` | GET /user/workspaces |
| macro-looping.js | `moveToWorkspace.doMove` | PUT move-to-workspace |
| combo.js | `autoDetectCurrentWorkspace.doFetch` | POST mark-viewed |
| combo.js | `checkCreditsViaApi` | GET /user/workspaces |
| combo.js | `moveToWorkspace` | PUT move-to-workspace |

---

## Iterations History

| Version | Change | Result |
|---------|--------|--------|
| v7.9.20 | Introduced mark-viewed API with `resp.json()` | Crashes on empty body |
| v7.9.22 | Added wsById dump and guard flag activation | Still crashed on `.json()` for old injections |
| v7.9.23 | Switched to `resp.text()` + manual `JSON.parse()` + reverse lookup | Empty body handled, but logging still vague |
| **v7.9.24** | Comprehensive logging: URL, auth, headers, status, content-type, body preview on every fetch | Full diagnostic visibility for remote debugging |

---

## Prevention / Non-Regression

1. **Rule**: Every `fetch()` call MUST log: URL, method, auth method (sanitized token), request body, response status, content-type, content-length, and body preview (first 200 chars).
2. **Rule**: NEVER use `resp.json()` directly. Always use `resp.text()` + `JSON.parse()` to handle empty/malformed responses gracefully.
3. **Rule**: Error paths MUST log the error response body (first 500 chars), not just the error message.
4. **Rule**: Bearer tokens in logs MUST be sanitized: first 12 chars + `...REDACTED`.
5. **Test**: After injecting, check console for `"Response status="` entries to verify comprehensive logging is active.
