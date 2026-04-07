# Spec 57 — Project Dependency System

**Priority**: Medium
**Status**: Planning
**Related**: `spec/11-chrome-extension/50-script-dependency-system.md` (script-level deps)

---

## Overview

Projects can declare dependencies on other "global" (shared) projects. Before injecting a project's scripts, all dependencies must be loaded first. Dependencies are cached in IndexedDB for fast access, with version-based invalidation.

---

## Data Model Changes

### StoredProject Extension

```typescript
interface StoredProject {
  // ... existing fields ...
  
  /** Whether this project is a shared/global dependency */
  isGlobal?: boolean;
  
  /** Project IDs this project depends on */
  dependencies?: ProjectDependency[];
}

interface ProjectDependency {
  projectId: string;        // ID of the dependency project
  minVersion?: string;      // Minimum required version
  required?: boolean;       // If true, fail injection if missing (default: true)
}
```

### Version Field

Every project already has a `version: string` field in `StoredProject`. This will be used for cache invalidation.

---

## Injection Flow

```
[Page matches URL rule for Project A]
         │
         ▼
[Resolve dependencies of Project A]
         │
         ├── Dependency: Project B (v1.2.0)
         │        │
         │        ▼
         │   [Check IndexedDB cache]
         │        │
         │        ├── Cached + version matches → use cached scripts
         │        │
         │        └── Not cached or version mismatch
         │                 │
         │                 ▼
         │            [Load from chrome.storage.local]
         │                 │
         │                 ▼
         │            [Cache to IndexedDB]
         │                 │
         │                 ▼
         │            [Inject dependency scripts]
         │
         ▼
[Inject Project A scripts]
```

---

## IndexedDB Cache Schema

```
Database: marco_dep_cache
  Store: scripts
    Key: projectId
    Value: {
      projectId: string,
      version: string,
      scripts: ScriptEntry[],
      configs: ConfigEntry[],
      cachedAt: number (timestamp),
      size: number (bytes)
    }
```

### Cache Invalidation Rules

1. Version mismatch: dependency project version > cached version → re-cache
2. TTL: cached entries older than 7 days are refreshed
3. Manual: user can clear cache from Storage UI
4. On project update: when a global project is saved, invalidate its cache entry

---

## UI Changes

### Project Editor

Add "Dependencies" tab or section:
- List of dependency project IDs with version constraints
- Add/remove dependency buttons
- "Global Project" toggle checkbox

### Dependency Resolution Status

During injection, log dependency resolution:
```
[Deps] Resolving 2 dependencies for Project A
[Deps] Project B v1.2.0 — cached (IndexedDB)
[Deps] Project C v2.0.0 — loaded from storage, cached
[Deps] All dependencies resolved, injecting Project A
```

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| 57.1 | Add `isGlobal` and `dependencies` to StoredProject | 1h |
| 57.2 | Implement IndexedDB cache layer | 3h |
| 57.3 | Implement dependency resolver in injection handler | 3h |
| 57.4 | Add Dependencies UI to Project Editor | 2h |
| 57.5 | Add cache invalidation on project save | 1h |
| 57.6 | Logging and error handling for missing deps | 1h |

---

## Open Questions

1. **Circular dependencies**: How to detect and handle A → B → A?
   - Proposed: Topological sort with cycle detection; throw error on cycle
2. **Cross-version conflicts**: What if Project A needs B v1.x but Project C needs B v2.x?
   - Proposed: Last-loaded wins (warn in logs); advanced resolution deferred
3. **Remote dependencies**: Can dependencies be fetched from URLs?
   - Deferred to Spec 58 (script update mechanism)

---

## Acceptance Criteria

1. [ ] Projects can declare dependencies on other projects
2. [ ] Dependencies injected before dependent project scripts
3. [ ] IndexedDB cache hit avoids chrome.storage.local read
4. [ ] Version mismatch triggers cache refresh
5. [ ] Circular dependency detected and reported as error
6. [ ] UI allows adding/removing dependencies in Project Editor
