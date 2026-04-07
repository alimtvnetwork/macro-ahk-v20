# Issue 83: Dependency Resolution, Global Project Injection & Auth Fixes

**Date**: 2026-03-26  
**Status**: Fixed  
**Severity**: P0  

---

## Issues Fixed

### 1. Global Projects Not Auto-Injected

**Root Cause**: `prependDependencyScripts()` only traversed projects listed in `activeProject.dependencies`. If the active project had no explicit dependency on global projects, globals were never prepended to the injection queue — even though `isGlobal === true` was set.

**Fix**: Always collect ALL global projects (`isGlobal === true`) and include them in the topological sort graph, regardless of explicit dependencies. Added a `collectGlobalScripts()` fallback for when topological sort fails.

### 2. Global Project Namespaces Not Registered

**Root Cause**: `injectProjectNamespaces()` only registered namespaces for the active project and its explicit transitive dependencies. Global projects were excluded from namespace registration, making `RiseupAsiaMacroExt.Projects.<GlobalCodeName>` unavailable in the console.

**Fix**: Added global project collection to the namespace registration loop — all `isGlobal === true` projects now get their namespaces registered.

### 3. Auth Token Exchange Silently Failing (P0)

**Root Cause**: The `fetchAuthToken()` function in `config-auth-handler.ts` used `fetch()` from the MV3 service worker with a manually set `cookie` header:

```js
const response = await fetch(url, {
    headers: { "cookie": cookieHeader },
});
```

**`Cookie` is a [forbidden header name](https://fetch.spec.whatwg.org/#forbidden-header-name)** — Chrome silently strips it from `fetch()` calls in service workers. The request reached `api.lovable.dev/projects/{id}/auth-token` without any cookies, always returning 401.

**Fix**: Added `fetchAuthTokenViaPlatformTab()` as the primary strategy. This uses `chrome.scripting.executeScript()` to run the fetch from within a lovable.dev platform tab's MAIN world, where `credentials: 'include'` naturally sends HttpOnly cookies. The service worker direct-fetch is kept as a secondary fallback for Chromium variants that don't enforce the restriction.

### 4. Cookie URL Candidates Missing `www.` Subdomains

**Fix**: Added `www.lovable.dev`, `www.lovable.app`, `www.lovableproject.com` to `DEFAULT_COOKIE_URL_CANDIDATES` in `cookie-helpers.ts`.

---

## Files Changed

- `src/background/handlers/injection-handler.ts` — global project injection + namespace registration
- `src/background/handlers/config-auth-handler.ts` — platform tab auth strategy
- `src/background/cookie-helpers.ts` — expanded URL candidates

---

*Issue 83 — Fixed 2026-03-26*
