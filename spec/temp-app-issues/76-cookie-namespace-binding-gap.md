# Issue 76 — Cookie Namespace Binding Gap

**Status**: ✅ Resolved (2026-03-26)  
**Severity**: High (breaks session cookie resolution from SDK namespace)  
**Component**: `project-namespace-builder.ts`, `injection-handler.ts`, `macro-controller/auth.ts`

## Symptom

Scripts calling `RiseupAsiaMacroExt.Projects.<CodeName>.cookies.get("session")`
or trying to discover which cookie names are bound to the project receive
`null` or must hardcode cookie names.

The macro controller (`auth.ts`) hardcodes `SESSION_COOKIE_EXPECTED_NAMES`
instead of reading from its namespace because the namespace doesn't expose
cookie binding metadata.

## Root Cause

**Two gaps in the per-project namespace registration pipeline:**

### Gap 1 — Cookie bindings not passed to namespace builder

`injection-handler.ts` constructs the `NamespaceContext` with `codeName`,
`slug`, `scripts`, `dependencies`, and `fileCache`, but **never passes the
project's `cookies` array**. The `NamespaceContext` interface doesn't even
have a `cookies` field.

```ts
// injection-handler.ts — line 425
const nsScript = buildProjectNamespaceScript({
    codeName,
    slug: projectSlug,
    projectName: project.name,
    // ...
    // ❌ project.cookies is NEVER included
});
```

### Gap 2 — Namespace cookies.get() requires literal cookie name

The generated namespace exposes:

```js
cookies: Object.freeze({
  get: function(bindTo) { return m.cookies.get(bindTo); },
  getAll: function() { return m.cookies.getAll(); }
})
```

`m.cookies.get(name)` sends `COOKIES_GET` which calls
`readCookieValueFromCandidates(name, url)` — a **literal cookie name**
lookup via `chrome.cookies.get()`.

There is no role-based lookup (e.g., `.cookies.get("session")` → resolves
to `lovable-session-id.id`), and no way to list what cookie names are
bound to the project.

### Gap 3 — No `cookies.bindings` exposed

Scripts have zero visibility into which cookies the project declared.
The macro controller compensates by hardcoding:

```ts
const SESSION_COOKIE_EXPECTED_NAMES = [
  'lovable-session-id.id',
  '__Secure-lovable-session-id.id',
  '__Host-lovable-session-id.id',
];
```

This bypasses the project model entirely, defeating the purpose of
configurable cookie bindings.

## Fix Plan

1. **Add `cookieBindings` to `NamespaceContext`** — a serializable array
   of `{ cookieName, url, role }`.

2. **Pass `project.cookies` in injection-handler.ts** when building the
   namespace context.

3. **Enrich the generated namespace's `cookies` sub-object** with:
   - `cookies.bindings` — frozen array of `{ cookieName, url, role }`
   - `cookies.getByRole(role)` — resolves the first cookie matching the
     given role (e.g., `"session"` → reads `lovable-session-id.id`)
   - `cookies.getSessionToken()` — convenience alias for
     `cookies.getByRole("session")`

4. **Update `generate-dts.ts`** and the docs object to document the new
   methods.

## Files to Change

| File | Change |
|------|--------|
| `src/background/project-namespace-builder.ts` | Add `cookieBindings` to context + enrich IIFE |
| `src/background/handlers/injection-handler.ts` | Pass `project.cookies` |
| `src/lib/generate-dts.ts` | Add `bindings`, `getByRole`, `getSessionToken` |
| `src/components/options/DevGuideSection.tsx` | Update docs snippet |

## Non-Regression

- Existing `cookies.get(literalName)` must continue to work unchanged.
- `cookies.getAll()` must continue to return all cookies.
- New methods are additive — no breaking changes.
