# 05 — File Organization

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

## Purpose

Files must be **small** and **focused**. A developer should understand the scope of a file from its name and location alone. Large files are split into logical sub-modules.

---

## 1. File Size Limit (Rule ORG1)

Every source file **MUST** stay at or below **200 lines**. This is a strict limit.

This does NOT mean cramming code onto fewer lines. The formatting rules in [04-formatting-rules.md](04-formatting-rules.md) still apply — one property per line, one argument per line, etc. When a file approaches 200 lines, **extract a sub-module**.

---

## 2. Single Responsibility Per File (Rule ORG2)

Each file must have **one clear purpose**. If you can describe a file with "and" (e.g., "handles injection **and** URL matching"), split it.

```
// ❌ FORBIDDEN — mixed concerns
src/background/injection-and-matching.ts

// ✅ REQUIRED — separated files
src/background/injector.ts
src/background/url-matcher.ts
```

---

## 3. Module Splitting Strategy (Rule ORG3)

When a file grows beyond 200 lines, split by **logical domain**, not by arbitrary line count.

### Before: Single large file

```
src/background/project-manager.ts  (350 lines)
```

### After: Domain-split modules

```
src/background/project-manager/
    index.ts              ← public API (re-exports)
    loader.ts             ← loadProject, loadAllProjects
    validator.ts          ← validateProject, isProjectValid
    serializer.ts         ← toStorageFormat, fromStorageFormat
```

The `index.ts` re-exports the public interface so consumers don't need to know the internal structure:

```typescript
// src/background/project-manager/index.ts
export { loadProject, loadAllProjects } from "./loader";
export { validateProject, isProjectValid } from "./validator";
export { toStorageFormat, fromStorageFormat } from "./serializer";
```

---

## 4. Canonical Folder Structure (Rule ORG4)

```
chrome-extension/src/
├── background/
│   ├── index.ts                  ← service worker entry
│   ├── message-router.ts         ← message dispatch
│   ├── injector.ts               ← script injection
│   ├── url-matcher.ts            ← URL pattern matching
│   ├── cookie-manager.ts         ← auth cookie handling
│   └── project-manager/          ← split module example
│       ├── index.ts
│       ├── loader.ts
│       └── validator.ts
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.ts
│   ├── options.css
│   └── sections/                 ← options page tabs
│       ├── projects.ts
│       ├── scripts.ts
│       ├── configs.ts
│       └── general.ts
├── content-scripts/
│   └── (injected scripts)
├── shared/
│   ├── types.ts                  ← TypeScript interfaces
│   ├── messages.ts               ← MessageType enum + helpers
│   ├── constants.ts              ← storage keys, limits
│   ├── utils.ts                  ← shared utility functions
│   └── url-patterns.ts           ← URL matching utilities
└── assets/
    └── icons/
```

---

## 5. Export Rules (Rule ORG5)

### 5.1 — Named Exports Only

Always use **named exports**. Default exports are prohibited (they make refactoring and imports harder to trace).

```typescript
// ❌ FORBIDDEN
export default function matchUrl() { ... }

// ✅ REQUIRED
export function matchUrl() { ... }
```

### 5.2 — Export at Declaration

Export functions and types at the point of declaration, not at the bottom of the file.

```typescript
// ✅ REQUIRED — export at declaration
export function matchUrl(pattern: string, url: string): boolean {
    ...
}

export interface UrlMatchResult {
    isMatch: boolean;
    capturedGroups: string[];
}
```

---

## 6. Test File Colocation (Rule ORG6)

Test files live **next to** their source file:

```
src/background/
    url-matcher.ts
    url-matcher.test.ts       ← colocated
    injector.ts
    injector.test.ts          ← colocated
```

---

## 7. Circular Dependency Prevention (Rule ORG7)

### 7.1 — Dependency Direction

Imports **MUST** follow a strict direction. Lower layers never import from higher layers:

```
shared/        ← Foundation: types, constants, utils (imports from NOTHING in src/)
    ↑
background/    ← Core: service worker logic (imports from shared/)
    ↑
popup/         ← UI: popup (imports from shared/, never from background/)
options/       ← UI: options page (imports from shared/, never from background/)
content-scripts/ ← Injected (imports from shared/ only)
```

```typescript
// ❌ FORBIDDEN — background importing from popup
import { formatStatus } from "@/popup/status-formatter";

// ❌ FORBIDDEN — shared importing from background
import { getToken } from "@/background/cookie-reader";

// ✅ REQUIRED — popup imports from shared
import { MessageType } from "@/shared/messages";
```

### 7.2 — Detection (Rule ORG8)

If TypeScript reports a circular dependency or a module fails to load at runtime:

1. Identify the cycle using `madge --circular src/`
2. Extract the shared type/function into `shared/`
3. Both modules import from `shared/` instead of each other

### 7.3 — Communication Between Layers (Rule ORG9)

Popup/options/content-scripts communicate with background **only** via `chrome.runtime.sendMessage`. They never import background modules directly.

```typescript
// ❌ FORBIDDEN — direct import of background logic
import { matchProject } from "@/background/project-matcher";

// ✅ REQUIRED — message passing
const matchedProject = await chrome.runtime.sendMessage({
    type: MessageType.MATCH_PROJECT,
    url: currentUrl,
});
```

---

## 8. Prohibited Patterns

| Pattern | Why | Fix |
|---------|-----|-----|
| Files > 200 lines | Hard to navigate | Split into sub-modules |
| `utils.ts` growing beyond 200 lines | Becomes a dumping ground | Split by domain: `url-utils.ts`, `format-utils.ts` |
| Barrel files re-exporting everything | Circular dependency risk | Only use `index.ts` for split modules |
| Default exports | Hard to trace in refactoring | Named exports only |
| Mixed concerns in one file | Violates SRP | One domain per file |
| Circular imports | Runtime failures | Follow dependency direction (§7) |
| Popup/options importing from background | Coupling violation | Use message passing |

---

## ESLint Enforcement

| Rule | ESLint Rule / Plugin | Enforces |
|------|---------------------|----------|
| ORG1 | `max-lines: [error, { max: 200, skipBlankLines: false, skipComments: false }]` | 200-line file limit |
| ORG5 | `import/no-default-export: error` | Named exports only |
| ORG7 | `import/no-cycle: [error, { maxDepth: 3 }]` | Circular dependency detection |
| ORG7 | `import/no-restricted-paths` (custom zones) | Dependency direction enforcement |
| ORG9 | `no-restricted-imports: [error, { patterns: [{ group: ["@/background/*"], message: "Use message passing instead" }] }]` | Block popup/options importing from background |

**Plugins required**: `eslint-plugin-import`

**Zone configuration for `import/no-restricted-paths`**:

```json
{
    "zones": [
        { "target": "./src/shared", "from": "./src/background" },
        { "target": "./src/shared", "from": "./src/popup" },
        { "target": "./src/popup", "from": "./src/background" },
        { "target": "./src/options", "from": "./src/background" },
        { "target": "./src/content-scripts", "from": "./src/background" }
    ]
}
```

**External tool**: Use `madge --circular src/` in CI to catch cycles ESLint misses.

---

## Cross-References

- [Function Standards](02-function-standards.md) — 15-line function limit
- [Formatting Rules](04-formatting-rules.md) — One-per-line formatting (don't compress to save lines)
- [Build System (Spec 17)](../../07-chrome-extension/17-build-system.md) — Canonical directory structure
- [Message Protocol (Spec 18)](../../07-chrome-extension/18-message-protocol.md) — Cross-layer message types

*File organization v1.2.0 — 2026-02-28*
