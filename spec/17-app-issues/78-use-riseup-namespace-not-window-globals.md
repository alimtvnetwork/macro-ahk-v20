# Issue 78 — Use RiseupAsiaMacroExt Namespace Instead of Window Globals

| Field        | Value                                       |
| ------------ | ------------------------------------------- |
| ID           | 78                                          |
| Status       | ✅ Fixed                                     |
| Severity     | Convention / Standards                       |
| Version      | 1.70.0                                      |
| Created      | 2026-03-26                                  |
| Component    | Macro Controller                            |

---

## Problem Statement

Issue 77 (Script Re-Inject) introduced `window.__MARCO_VERSION__` as a global variable to expose the running script version for hot-reload version comparison. This violates the project convention that **all runtime metadata must be exposed via the `RiseupAsiaMacroExt` SDK namespace**, not bare `window` globals.

### Convention

The `RiseupAsiaMacroExt` global object (registered during the SDK injection stage) provides project-scoped namespaces under `Projects.<CodeName>`. Each project namespace contains `.meta` for metadata like version, name, and slug. Using `window.__MARCO_VERSION__` bypasses this established pattern.

## Root Cause

- `standalone-scripts/macro-controller/src/shared-state.ts` line 67 sets `window.__MARCO_VERSION__ = VERSION`
- The hot-reload section (`hot-reload-section.ts`) compares `VERSION` (compile-time constant) against the bundled version — it does NOT actually read from `window.__MARCO_VERSION__` at runtime
- The `window` global was unnecessary; the SDK namespace should be used if external version access is needed

## Fix

1. **Remove** `window.__MARCO_VERSION__` from `shared-state.ts`
2. **Set** version on `RiseupAsiaMacroExt.Projects.MacroController.meta.version` instead
3. **Update** spec 77 references from `window.__MARCO_VERSION__` to the namespace path

### Namespace Path

```
RiseupAsiaMacroExt.Projects.MacroController.meta.version  →  "1.70.0"
```

This is consistent with how cookie bindings and other metadata are already accessed:
```typescript
const root = (window as any).RiseupAsiaMacroExt;
root.Projects.MacroController.meta.version  // "1.70.0"
```

## Files Modified

- `standalone-scripts/macro-controller/src/shared-state.ts` — Remove `window.__MARCO_VERSION__`, set version on SDK namespace
- `spec/17-app-issues/77-live-script-hot-reload.md` — Update references
