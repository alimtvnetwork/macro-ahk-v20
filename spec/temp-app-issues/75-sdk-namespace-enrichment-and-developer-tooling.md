# Issue 75: SDK Namespace Enrichment, Developer Tooling & Dependency-Only Execution

**Version**: v1.70.0
**Date**: 2026-03-26
**Status**: Complete

---

## Overview

Enrich the `RiseupAsiaMacroExt` global namespace to expose full project metadata, scripts, DB, REST APIs, and docs at runtime. Add developer tooling (downloadable `.d.ts`, LLM-ready `.md` guide) and a dependency-only execution flag for the SDK project.

---

## Requirements

### R1: Enrich `RiseupAsiaMacroExt.Projects` Namespace

**Current state**: Each project registers a frozen namespace with sub-modules (`vars`, `urls`, `xpath`, `cookies`, `kv`, `files`, `meta`, `log`) via `project-namespace-builder.ts`.

**Target state**: Extend the namespace so a developer can do:

```js
// List all registered projects
console.log(RiseupAsiaMacroExt.Projects);
// → { MacroController: {...}, RiseupMacroSdk: {...} }

// Access project metadata
RiseupAsiaMacroExt.Projects.MacroController.meta
// → { name, version, slug, codeName, id, description, dependencies }

// Access scripts list
RiseupAsiaMacroExt.Projects.MacroController.scripts
// → [{ name: "macro-looping.js", order: 1, isEnabled: true }]

// Access DB (Prisma-style proxy)
RiseupAsiaMacroExt.Projects.MacroController.db.Prompts.findMany()

// Access REST API endpoints
RiseupAsiaMacroExt.Projects.MacroController.api.kv.get("key")
RiseupAsiaMacroExt.Projects.MacroController.api.files.list()

// Access docs
RiseupAsiaMacroExt.Projects.MacroController.docs
// → { vars: "...", urls: "...", xpath: "...", ... }
// Full developer guide text for each sub-namespace
```

#### Changes to `project-namespace-builder.ts`

1. **`meta`**: Add `id`, `description`, `dependencies` array.
2. **`scripts`**: New frozen array of `{ name, order, isEnabled }` objects (populated from project's `StoredScript[]`).
3. **`db`**: Add Prisma-style proxy that delegates to `window.marco.db.*` scoped to the project.
4. **`api`**: Add REST endpoint helpers that delegate to the localhost HTTP proxy (port 19280) or bridge.
5. **`docs`**: New frozen object with per-sub-namespace developer guide text (vars, urls, xpath, cookies, kv, files, meta, log, db, api).

#### Interface update for `NamespaceContext`

```ts
interface NamespaceContext {
    codeName: string;
    slug: string;
    projectName: string;
    projectVersion: string;
    projectId: string;
    description?: string;
    dependencies?: { projectId: string; version: string }[];
    scripts?: { name: string; order: number; isEnabled: boolean }[];
}
```

The `injection-handler.ts` must populate these new fields from the stored project data before calling `buildProjectNamespaceScript()`.

---

### R2: Developer Guide in General Tab

Add a collapsible "Developer Guide" section to the **General** tab of `ProjectDetailView`, consistent with the existing developer guide sections on other tabs (Scripts, URL Rules, etc.).

**Content**: Top-level overview of the `RiseupAsiaMacroExt.Projects.<CodeName>` namespace with all sub-modules listed, including `db` and `api`.

---

### R3: Downloadable LLM Developer Guide (.md)

Generate a comprehensive Markdown file containing:

1. **Architecture overview**: Injection pipeline (5 stages), dependency resolution, MAIN world execution.
2. **SDK API reference**: Full `RiseupAsiaMacroExt.Projects.<CodeName>` namespace documentation with every sub-module (vars, urls, xpath, cookies, kv, files, meta, log, db, api).
3. **Data models**: Prisma-style schema for all tables (Prompts, Logs, Errors, ProjectSchema, etc.).
4. **REST API reference**: All HTTP proxy endpoints (GET/POST/PUT/DELETE on port 19280).
5. **Message types**: Bridge message protocol (GET_TOKEN, INJECT_SCRIPTS, etc.).
6. **Usage examples**: Common automation patterns.

**Delivery**:
- Available as a "Download LLM Guide" button in the General tab.
- Also accessible via `RiseupAsiaMacroExt.docs.llmGuide` at runtime.

---

### R4: Downloadable `.d.ts` TypeScript Declarations

Generate a `.d.ts` file that developers can import into their script projects for IntelliSense.

**Approach**: Hybrid (auto-generated base + manual runtime type additions).

**Contents**:
```ts
declare global {
    interface Window {
        RiseupAsiaMacroExt: RiseupAsiaMacroExtRoot;
        marco: MarcoSDK;
    }
}

interface RiseupAsiaMacroExtRoot {
    Projects: Record<string, ProjectNamespace>;
    docs: { llmGuide: string };
}

interface ProjectNamespace {
    vars: VarsModule;
    urls: UrlsModule;
    xpath: XPathModule;
    cookies: CookiesModule;
    kv: KvModule;
    files: FilesModule;
    meta: MetaModule;
    log: LogModule;
    db: DbModule;
    api: ApiModule;
    scripts: ScriptInfo[];
    docs: Record<string, string>;
}
// ... full type definitions for each module
```

**Delivery**:
- "Download .d.ts" button in the General tab (next to LLM Guide download).
- File name: `riseup-macro-sdk.d.ts`.

---

### R5: Dependency-Only Execution Flag

Add an `onlyRunAsDependency` boolean flag to project settings.

**Behavior**:
- When `true`, the project's scripts are **not** auto-injected even if URL rules match.
- The project's scripts are **only** injected when another project lists it as a dependency.
- The URL rules are preserved (for reference/documentation) but skipped during auto-injection filtering.

**Implementation**:
1. Add `onlyRunAsDependency?: boolean` to `ProjectSettings` in `src/shared/project-types.ts`.
2. In `auto-injector.ts`, skip projects where `settings.onlyRunAsDependency === true` unless they're being resolved as a dependency.
3. In `injection-handler.ts`, the dependency resolver already loads dependency projects regardless of URL rules — no change needed there.
4. The Riseup Macro SDK default project should have this flag set to `true` in the seeder.
5. Add a toggle in the General tab UI for this setting.

---

## Task Breakdown

| Phase | Task | Description | Status |
|-------|------|-------------|--------|
| 1 | Extend `NamespaceContext` and `buildProjectNamespaceScript` | Add `description`, `dependencies`, `scripts`, `db`, `api`, `docs` to the generated IIFE | ✅ Done |
| 2 | Update `injection-handler.ts` | Populate new `NamespaceContext` fields from stored project data | ✅ Done |
| 3 | Add `onlyRunAsDependency` flag | Update types, auto-injector filter, SDK seeder default, General tab toggle | ✅ Done |
| 4 | Developer Guide + Downloads in General tab | Collapsible guide section, LLM guide generator, `.d.ts` generator, download buttons | ✅ Done |
| 5 | `RiseupAsiaMacroExt.Settings` namespace | Global frozen settings (Broadcast.Port, Logging, Injection, Limits, General) | ✅ Done |
| 6 | Runtime LLM guide access | Make guide accessible via `RiseupAsiaMacroExt.docs.llmGuide` | ✅ Done |
| 7 | Static `.d.ts` file output | Write `standalone-scripts/marco-sdk/dist/riseup-macro-sdk.d.ts` at build time | ✅ Done |
| 8 | Cookie namespace bindings | Expose `cookies.bindings`, `getByRole()`, `getSessionToken()` + macro controller reads dynamically (Issue 76) | ✅ Done |

---

## Files Affected

| File | Change |
|------|--------|
| `src/background/project-namespace-builder.ts` | Extend IIFE with scripts, db, api, docs; dynamic API_BASE from Settings |
| `src/background/settings-namespace-builder.ts` | New: IIFE for `RiseupAsiaMacroExt.Settings` |
| `src/background/handlers/injection-handler.ts` | Populate enriched NamespaceContext + inject Settings namespace |
| `src/background/handlers/settings-handler.ts` | Add `broadcastPort`, `logRetentionDays` to ExtensionSettings |
| `src/background/project-matcher.ts` | Filter out `onlyRunAsDependency` projects from auto-injection |
| `src/shared/project-types.ts` | Add `onlyRunAsDependency` to ProjectSettings |
| `src/background/default-project-seeder.ts` | Set SDK `onlyRunAsDependency: true` |
| `src/components/options/ProjectDetailView.tsx` | General tab: developer guide, download buttons, flag toggle |
| `src/lib/generate-llm-guide.ts` | New: LLM guide Markdown generator |
| `src/lib/generate-dts.ts` | New: TypeScript declaration generator |
| `standalone-scripts/marco-sdk/dist/riseup-macro-sdk.d.ts` | Planned: Static TypeScript declarations |

---

## Acceptance Criteria

- [x] `console.log(RiseupAsiaMacroExt.Projects)` lists all registered projects with full metadata
- [x] Each project namespace exposes `.scripts`, `.db`, `.api`, `.docs`
- [x] `.d.ts` file downloadable from General tab and provides IntelliSense for all sub-modules
- [x] LLM guide `.md` downloadable and contains architecture + API + examples
- [x] SDK project only injects when a dependent project triggers it
- [x] Developer Guide section visible in General tab
- [x] `RiseupAsiaMacroExt.Settings` exposes Broadcast.Port, Logging, Injection, Limits, General
- [x] All existing tests pass (15/15 namespace builder tests)
- [x] LLM guide accessible at runtime via `RiseupAsiaMacroExt.docs.llmGuide`
- [x] Static `.d.ts` written to `standalone-scripts/marco-sdk/dist/`
- [x] Cookie bindings exposed via `cookies.bindings`, `cookies.getByRole()`, `cookies.getSessionToken()` (Issue 76)
- [x] Macro controller reads session cookie names dynamically from namespace bindings
