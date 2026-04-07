# Issue 66 — SDK Global Object `RiseupAsiaMacroExt` Not Defined (Critical)

**Date**: 2026-03-25  
**Status**: Fixed (SDK creates RiseupAsiaMacroExt root; project-namespace-builder registers per-project namespaces)  
**Severity**: Critical  
**Component**: Marco SDK, SDK Template, Developer Guide

---

## Issue Summary

When developers copy code snippets from the Developer Guide (e.g., `RiseupAsiaMacroExt.Projects.MacroController.vars.get("apiKey")`) and paste them into the browser console, they get:

```
ReferenceError: RiseupAsiaMacroExt is not defined
```

The entire per-project SDK namespace documented in spec 63 is non-functional.

## Root Cause

**The global `window.RiseupAsiaMacroExt` object is never created.** Two SDK injection mechanisms exist, and neither creates it:

### 1. `standalone-scripts/marco-sdk/src/index.ts` (IIFE bundle)
- Line 37: Only creates `window.marco` — a flat namespace with auth, cookies, config, xpath, kv, files
- **Never creates** `window.RiseupAsiaMacroExt`
- **Never creates** per-project sub-namespaces like `.Projects.MacroController`

### 2. `src/background/marco-sdk-template.ts` (template injection)
- Line 45: Only creates `window.marco` with log, store, kv, context
- **Never creates** `window.RiseupAsiaMacroExt`
- **Never creates** per-project sub-namespaces

### Impact

- All Developer Guide code snippets referencing `RiseupAsiaMacroExt.Projects.<CodeName>.*` fail at runtime
- The entire namespace hierarchy documented in spec 63 (vars, urls, xpath, cookies, kv, files, meta, log, db, api) is vapor — the documentation describes an API that doesn't exist
- Developers cannot use any of the documented per-project APIs

## Affected Files

| File | Issue |
|------|-------|
| `standalone-scripts/marco-sdk/src/index.ts` | Only creates `window.marco`, not `window.RiseupAsiaMacroExt` |
| `src/background/marco-sdk-template.ts` | Only creates `window.marco`, not `window.RiseupAsiaMacroExt` |
| `src/components/options/DevGuideSection.tsx` | All snippets reference non-existent `RiseupAsiaMacroExt.Projects.<X>.*` |
| `src/lib/slug-utils.ts` | `toSdkNamespace()` generates namespace strings that resolve to nothing |
| `spec/11-chrome-extension/63-rise-up-macro-sdk.md` | Documents API surface that doesn't exist |

## Solution Direction

The SDK must bootstrap the `window.RiseupAsiaMacroExt` root object and populate per-project namespaces during injection.

### Option A: Root object in SDK IIFE, project namespaces in injection handler
1. In `standalone-scripts/marco-sdk/src/index.ts`:
   - Create `window.RiseupAsiaMacroExt = { Projects: {} }` (unfrozen, extensible)
   - Keep `window.marco` as the low-level bridge API
2. In the injection handler (`src/background/handlers/injection-handler.ts`):
   - After injecting a project's scripts, inject a small namespace registration IIFE:
     ```js
     window.RiseupAsiaMacroExt.Projects.MacroController = Object.freeze({
       vars: { get: (k) => marco.config.get(k), set: (k,v) => marco.config.set(k,v), getAll: () => marco.config.getAll() },
       urls: { getMatched: () => ..., listOpen: () => ..., getVariables: () => ... },
       // ... etc
     });
     ```
3. Each sub-namespace delegates to `window.marco.*` with project context

### Option B: Template-based namespace in `marco-sdk-template.ts`
- Extend `buildMarcoSdkScript()` to also register `window.RiseupAsiaMacroExt.Projects.<CodeName>` using the project context

### Recommendation
Option A is cleaner — the root SDK creates the container, and each project registers itself. This keeps concerns separated and supports multiple projects on the same page.

## Done Checklist

- [ ] `window.RiseupAsiaMacroExt` created by SDK IIFE on injection
- [ ] `window.RiseupAsiaMacroExt.Projects.<CodeName>` registered per project
- [ ] All sub-namespaces (vars, urls, xpath, cookies, kv, files, meta, log) functional
- [ ] Developer Guide snippets work when pasted into console
- [ ] Spec 63 updated to match implementation
