# Issue 69 — Auth Cookie Bindings Missing from SDK Project

**Date**: 2026-03-25  
**Status**: Fixed (buildSdkCookieBindings() seeds all 4 cookie bindings including __Secure- and __Host- prefixed)  
**Severity**: High  
**Component**: Default Project Seeder, Cookie System

---

## Issue Summary

The Riseup Macro SDK project is seeded with `cookies: []` (empty array), but since the SDK is the global foundation that all projects depend on, it should define the standard Lovable session cookie bindings. The Macro Controller project has the correct bindings, but the SDK — which is the shared project responsible for auth — does not.

This contributes to the recurring "No session cookie found" auth failures because:
1. The SDK is the project that provides `marco.auth` and `marco.cookies` APIs
2. The SDK's cookie bindings should be the authoritative source for session cookie names
3. Without cookie bindings on the SDK project, the auth handler cannot resolve which cookies to look for via project context

## Root Cause

In `src/background/default-project-seeder.ts`, `buildSdkProject()` (line 137-163) sets `cookies: []`. The cookie bindings are only defined on the Macro Controller project (lines 197-212).

## Seeding Default Values

The SDK project should seed these cookie bindings:

```typescript
cookies: [
  {
    cookieName: "lovable-session-id.id",
    url: "https://lovable.dev",
    role: "session",
    description: "Primary session cookie — JWT bearer token for API auth",
  },
  {
    cookieName: "lovable-session-id.refresh",
    url: "https://lovable.dev",
    role: "refresh",
    description: "Refresh token cookie — used to obtain a new session",
  },
  {
    cookieName: "__Secure-lovable-session-id.id",
    url: "https://lovable.dev",
    role: "session",
    description: "Secure-prefixed session cookie alias",
  },
  {
    cookieName: "__Host-lovable-session-id.id",
    url: "https://lovable.dev",
    role: "session",
    description: "Host-prefixed session cookie alias",
  },
]
```

## Solution Direction

1. Add cookie bindings to `buildSdkProject()` in the seeder
2. Add the same bindings to the Cookies tab UI for the SDK project
3. Ensure `normalizeDefaultProject` also normalizes the SDK project's cookies
4. The auth handler should look up cookie bindings from the **active project's dependency chain** (SDK → Controller) to know which cookies to check

## Done Checklist

- [ ] SDK project seeded with Lovable session cookie bindings
- [ ] Cookies tab shows bindings for SDK project
- [ ] Auth handler resolves cookie names from project dependency chain
- [ ] `__Secure-` and `__Host-` prefixed aliases included
