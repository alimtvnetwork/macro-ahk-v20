# Spec: Instruction-Driven Seeding & LLM-Ready Developer Guide

**Status**: 📝 Draft  
**Version**: 1.0  
**Date**: 2026-04-03  
**Location**: `spec/12-devtools-and-injection/instruction-driven-seeding.md`

---

## 1. Problem Statement

### Current State (Hardcoded Seeding)

The extension seeds default scripts via **hardcoded TypeScript seed chunks** in `src/background/seed-chunks/`. Each script/config has a dedicated `.ts` file (`sdk-script-chunk.ts`, `looping-script-chunk.ts`, etc.) that returns a `StoredScript` or `StoredConfig` object with hardcoded metadata.

**Problems:**

1. **Not extensible** — Adding a new project requires writing a new seed chunk `.ts` file, importing it in `default-scripts-seeder.ts`, and adding boilerplate refresh logic. A third-party developer or AI cannot create a project without modifying extension internals.
2. **Duplicated source of truth** — `instruction.ts` already declares load order, dependencies, assets, and configs. The seed chunks duplicate this information in a different format.
3. **No self-documenting extensibility** — There's no single document an AI agent can read to understand how to build, structure, and deploy a new project end-to-end.

### Desired State

1. **instruction.json-driven seeding** — The seeder reads `instruction.json` from each project's `dist/` subfolder and generates `StoredScript`/`StoredConfig`/`StoredProject` entries dynamically. No hardcoded seed chunks needed.
2. **LLM-ready developer guide** — A comprehensive set of markdown files that any AI can ingest to create a fully compatible project from scratch.
3. **One-click export** — A button inside each project view that compiles all guide docs into a single downloadable/copyable document for feeding to an AI.

---

## 2. Architecture: Instruction-Driven Seeding

### 2.1. Enhanced instruction.json Schema

The existing `ProjectInstruction` schema is extended with seeding metadata so it becomes the **single source of truth** for both build-time asset management AND runtime seeding.

```typescript
interface ProjectInstruction {
    // === Existing fields (unchanged) ===
    name: string;                    // "macro-controller"
    displayName: string;             // "Macro Controller"
    version: string;                 // "2.1.0"
    description: string;
    world: "MAIN" | "ISOLATED";
    dependencies: string[];          // ["xpath", "marco-sdk"]
    loadOrder: number;               // 2

    // === NEW: Seeding metadata ===
    seed: {
        /** Deterministic ID for chrome.storage.local (replaces seed-ids.ts) */
        id: string;                  // "default-macro-looping"

        /** Whether this project seeds on first install */
        seedOnInstall: boolean;      // true

        /** Whether this is a global utility (injected for all URL-matched pages) */
        isGlobal: boolean;           // false

        /** Whether the user can remove this project */
        isRemovable: boolean;        // false

        /** Target URL patterns for injection */
        targetUrls: Array<{
            pattern: string;         // "https://lovable.dev/projects/*"
            matchType: "glob" | "regex";
        }>;

        /** Cookie bindings for auth */
        cookies?: Array<{
            cookieName: string;
            url: string;
            role: "session" | "refresh";
            description: string;
        }>;

        /** Project-level settings overrides */
        settings?: {
            isolateScripts?: boolean;
            logLevel?: "debug" | "info" | "warn" | "error";
            retryOnNavigate?: boolean;
            chatBoxXPath?: string;
            onlyRunAsDependency?: boolean;
            allowDynamicRequests?: boolean;
        };

        /** Updater system registration (optional) */
        updater?: {
            name: string;
            scriptUrl: string;
            versionInfoUrl: string;
            isGit: boolean;
            autoCheckIntervalMinutes: number;
            categories: string[];    // ["Script", "Core"]
        };
    };

    // === Existing: assets (unchanged) ===
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{
            file: string;
            key: string;
            injectAs?: string;
        }>;
        scripts: Array<{
            file: string;
            order: number;
            configBinding?: string;
            themeBinding?: string;
            isIife?: boolean;
        }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}
```

### 2.2. Discovery-Based Seeder

Replace the hardcoded seed chunks with a **dynamic discovery** approach:

```
chrome-extension/dist/
├── projects/
│   └── scripts/
│       ├── marco-sdk/
│       │   ├── marco-sdk.js
│       │   └── instruction.json    ← seeder reads this
│       ├── xpath/
│       │   ├── xpath.js
│       │   └── instruction.json    ← seeder reads this
│       └── macro-controller/
│           ├── macro-looping.js
│           ├── macro-looping.css
│           ├── macro-looping-config.json
│           ├── macro-theme.json
│           ├── templates.json
│           └── instruction.json    ← seeder reads this
```

#### Seeding Algorithm

```
1. On chrome.runtime.onInstalled:
2.   Fetch manifest of known project folders (see §2.3)
3.   For each project folder:
4.     a. Fetch `projects/scripts/{name}/instruction.json` via chrome.runtime.getURL()
5.     b. Parse ProjectInstruction
6.     c. If seed.seedOnInstall === true:
7.        - Generate StoredScript entries from assets.scripts[]
8.        - Generate StoredConfig entries from assets.configs[]
9.        - Generate StoredProject entry from top-level + seed fields
10.       - Upsert into chrome.storage.local (keyed by seed.id)
11.    d. If seed.updater exists:
12.       - Ensure UpdaterInfo entry
13.   Sort all scripts by loadOrder for injection ordering
14.   Prune entries whose seed.id no longer appears in any instruction.json
```

### 2.3. Project Registry: `projects-manifest.json`

A build-generated file listing all discovered projects:

```json
// chrome-extension/dist/projects/projects-manifest.json
{
    "generatedAt": "2026-04-03T10:00:00Z",
    "projects": [
        "marco-sdk",
        "xpath",
        "macro-controller"
    ]
}
```

Generated by `copyProjectScripts()` Vite plugin during extension build. The seeder fetches this manifest to know which folders to scan.

### 2.4. Mapping: instruction.json → Storage Entities

| instruction.json field | → | StoredScript field |
|---|---|---|
| `name` | → | part of `filePath` prefix |
| `assets.scripts[].file` | → | `name`, `filePath` (`projects/scripts/{name}/{file}`) |
| `assets.scripts[].order` | → | `order` |
| `assets.scripts[].isIife` | → | `isIife` |
| `assets.scripts[].configBinding` | → | `configBinding` (resolved to config seed.id) |
| `assets.scripts[].themeBinding` | → | `themeBinding` (resolved to config seed.id) |
| `seed.isGlobal` | → | `isGlobal` |
| `loadOrder` | → | `loadOrder` |
| `dependencies` | → | `dependencies[]` (resolved to seed.ids) |

| instruction.json field | → | StoredConfig field |
|---|---|---|
| `assets.configs[].file` | → | `name`, read JSON from `projects/scripts/{name}/{file}` |
| `assets.configs[].key` | → | used for binding resolution |
| `assets.configs[].injectAs` | → | `injectAs` |

| instruction.json field | → | StoredProject field |
|---|---|---|
| `seed.id` + `-project` | → | `id` |
| `displayName` | → | `name` |
| `version` | → | `version` |
| `description` | → | `description` |
| `seed.targetUrls` | → | `targetUrls` |
| `seed.cookies` | → | `cookies` |
| `seed.settings` | → | `settings` |
| `seed.isGlobal` | → | `isGlobal` |
| `seed.isRemovable` | → | `isRemovable` |
| `dependencies` | → | `dependencies` (resolved to project IDs) |

### 2.5. Migration Path

The transition from hardcoded to instruction-driven seeding is **backwards-compatible**:

1. **Phase 1**: Add `seed` block to each project's `instruction.ts`. Keep hardcoded seed chunks as fallback.
2. **Phase 2**: Implement the dynamic seeder that reads `instruction.json`. Run both seeders in parallel; log mismatches.
3. **Phase 3**: Remove hardcoded seed chunks (`src/background/seed-chunks/`). The seeder reads exclusively from `instruction.json`.
4. **Phase 4**: Add `projects-manifest.json` generation to the Vite plugin.

---

## 3. LLM-Ready Developer Guide

### 3.1. Purpose

A set of markdown files that, when combined and fed to any AI agent, provide **everything needed** to:

1. Create a new standalone script project from scratch
2. Set up the TypeScript + LESS + templates build pipeline
3. Write an `instruction.ts` that correctly declares assets and seeding
4. Understand the SDK namespace (`marco.*`) and available APIs
5. Know where the Chrome extension is located and how paths resolve
6. Build, deploy, and test the script

### 3.2. Document Structure

All files live in `spec/12-devtools-and-injection/developer-guide/`:

```
spec/12-devtools-and-injection/developer-guide/
├── 00-guide-overview.md           # Entry point — read this first
├── 01-project-structure.md        # Folder layout, file naming, conventions
├── 02-instruction-schema.md       # Full instruction.ts schema reference
├── 03-build-pipeline.md           # TypeScript, LESS, templates, Vite build
├── 04-sdk-namespace.md            # marco.* API reference (auth, cookies, xpath, etc.)
├── 05-injection-lifecycle.md      # How scripts are loaded and executed
├── 06-seeding-system.md           # How instruction.json drives seeding
├── 07-xpath-and-dom.md            # XPath utilities, DOM interaction patterns
├── 08-config-and-theme.md         # Runtime config injection, theme system
├── 09-testing-and-debugging.md    # Testing scripts, debugging in DevTools
└── 10-examples.md                 # Complete example: building a new project
```

### 3.3. Document Contents (Summary)

#### 00-guide-overview.md
- What this guide is and who it's for (AI agents and human developers)
- System architecture in one paragraph
- Reading order
- Dynamically resolved paths (Chrome extension location, project root)

#### 01-project-structure.md
- Required folder structure under `standalone-scripts/{name}/`
- Required files: `src/index.ts`, `src/instruction.ts`, `script-manifest.json`
- Optional: `less/`, `templates/`, `readme.md`
- `dist/` output structure
- Naming conventions (kebab-case folder, camelCase TS)

#### 02-instruction-schema.md
- Full `ProjectInstruction` TypeScript interface with JSDoc
- Every field explained with examples
- The `seed` block for seeding metadata
- Example `instruction.ts` for a minimal project
- Example `instruction.ts` for a full-featured project (CSS, configs, templates, prompts)

#### 03-build-pipeline.md
- How `run.ps1 -d` discovers and builds projects
- `npm run build:{name}` — what it does
- LESS compilation: `less/` → `dist/{name}.css`
- Template compilation: `templates/` → `dist/templates.json`
- Prompt aggregation: `prompts/` → `dist/prompts/`
- `compile-instruction.mjs` → `dist/instruction.json`
- Vite IIFE build → `dist/{name}.js`
- `package.json` script setup

#### 04-sdk-namespace.md
- `window.marco` — frozen namespace, available in MAIN world
- `marco.auth` — token management
- `marco.cookies` — cookie access
- `marco.config` — project config get/set
- `marco.xpath` — XPath evaluation and DOM element resolution
- `marco.kv` — key-value storage
- `marco.files` — file storage
- `marco.http` — HTTP requests via background proxy
- `marco.notify` — toast notifications
- `marco.prompts` — prompt chain access
- Bridge pattern: MAIN → postMessage → content script → background → response
- Message type naming convention (SCREAMING_SNAKE_CASE)

#### 05-injection-lifecycle.md
- 7-stage lifecycle: dependency resolution → namespace bootstrap → relay → IIFE → communication → CSP fallback → dynamic loading
- `chrome.scripting.executeScript` with MAIN world
- CSS injection via `chrome.scripting.insertCSS`
- Config injection as window globals
- Load order: CSS → configs → templates → JavaScript

#### 06-seeding-system.md
- How `instruction.json` drives seeding
- `projects-manifest.json` discovery
- StoredScript / StoredConfig / StoredProject mapping
- Idempotent upsert logic
- Legacy pruning

#### 07-xpath-and-dom.md
- `XPathUtils.getByXPath()` / `getAllByXPath()`
- `findElement()` — multi-method element search
- `reactClick()` — React-compatible synthetic click
- Retry patterns for dynamic DOM
- Common XPath patterns for Lovable UI elements

#### 08-config-and-theme.md
- `macro-looping-config.json` structure
- `macro-theme.json` — CSS custom properties mapping
- `window.__MARCO_CONFIG__` / `window.__MARCO_THEME__` injection
- LESS variables → CSS custom properties pipeline
- Runtime config reactivity via `marco.config.set()`

#### 09-testing-and-debugging.md
- Testing scripts in isolation (browser console)
- Chrome DevTools debugging (Sources → Content Scripts)
- `console.log` conventions and log levels
- Common errors and fixes (CSP, injection order, missing deps)

#### 10-examples.md
- **Example A**: Minimal project — single JS file, no config
- **Example B**: Full project — CSS, config, theme, templates
- Step-by-step walkthrough from `mkdir` to working injection
- Complete `instruction.ts` for each example

### 3.4. Dynamic Path Resolution

Each guide document includes a **preamble block** with dynamically resolved paths:

```markdown
> **System Paths** (auto-populated at export time):
> - Chrome extension: `chrome-extension://{EXTENSION_ID}/`
> - Project scripts root: `projects/scripts/`
> - Build script: `scripts/compile-instruction.mjs`
> - Project root: `/path/to/project/`
```

The export feature (§4) populates these placeholders with actual values.

---

## 4. Export / Download Feature

### 4.1. UI Location

Inside each project's detail view in the extension popup/options page, a button labeled **"Export AI Guide"** or **"Copy for AI"**.

### 4.2. Behavior

When clicked:

1. Reads all markdown files from `spec/12-devtools-and-injection/developer-guide/` (bundled into the extension at build time, or fetched from the repo)
2. Concatenates them in order (`00-` through `10-`)
3. Prepends a header with:
   - Current extension version
   - Extension ID
   - Current project context (if viewing a specific project)
   - Timestamp
4. Resolves dynamic placeholders (`{EXTENSION_ID}`, `{PROJECT_ROOT}`, etc.)
5. Copies to clipboard OR downloads as a single `.md` file

### 4.3. Build Integration

The Vite plugin copies the guide files into the extension dist:

```
chrome-extension/dist/
├── guide/
│   ├── 00-guide-overview.md
│   ├── 01-project-structure.md
│   ├── ...
│   └── 10-examples.md
```

These are served as `web_accessible_resources` so the export feature can `fetch()` them.

---

## 5. What Changes

### Files to CREATE

| File | Purpose |
|------|---------|
| `spec/12-devtools-and-injection/developer-guide/*.md` (11 files) | LLM-ready developer guide |
| `src/background/instruction-seeder.ts` | New dynamic seeder that reads instruction.json |
| N/A (build-generated) | `chrome-extension/dist/projects/projects-manifest.json` |

### Files to MODIFY

| File | Change |
|------|--------|
| `standalone-scripts/*/src/instruction.ts` | Add `seed` block to each project |
| `vite.config.ts` (extension) | Generate `projects-manifest.json`, copy guide files |
| `src/background/default-scripts-seeder.ts` | Phase 2: delegate to instruction-seeder; Phase 3: remove |
| `src/background/default-project-seeder.ts` | Phase 2: delegate to instruction-seeder; Phase 3: remove |
| Extension popup/options UI | Add "Export AI Guide" button |

### Files to DELETE (Phase 3)

| File | Reason |
|------|--------|
| `src/background/seed-chunks/looping-script-chunk.ts` | Replaced by instruction.json |
| `src/background/seed-chunks/looping-config-chunk.ts` | Replaced by instruction.json |
| `src/background/seed-chunks/sdk-script-chunk.ts` | Replaced by instruction.json |
| `src/background/seed-chunks/theme-config-chunk.ts` | Replaced by instruction.json |
| `src/background/seed-chunks/xpath-script-chunk.ts` | Replaced by instruction.json |
| `src/background/seed-chunks/seed-ids.ts` | IDs move into instruction.ts `seed.id` |

---

## 6. Phased Implementation Plan

### Phase 1: Developer Guide Documentation
**Scope**: Write all 11 markdown files for the developer guide.  
**Depends on**: Nothing  
**Output**: `spec/12-devtools-and-injection/developer-guide/` populated  

### Phase 2: Enhance instruction.ts Schema
**Scope**: Add `seed` block to the `ProjectInstruction` interface. Update each project's `instruction.ts` with seeding metadata. Recompile `instruction.json` files.  
**Depends on**: Phase 1 (guide docs reference the schema)  
**Output**: Updated `instruction.ts` for marco-sdk, xpath, macro-controller  

### Phase 3: Build projects-manifest.json
**Scope**: Modify the `copyProjectScripts()` Vite plugin to generate `projects-manifest.json` listing all discovered projects. Copy guide files into `dist/guide/`.  
**Depends on**: Phase 2  
**Output**: Build generates `dist/projects/projects-manifest.json` and `dist/guide/`  

### Phase 4: Implement Instruction-Driven Seeder
**Scope**: Create `instruction-seeder.ts` that reads `projects-manifest.json` → fetches each `instruction.json` → generates storage entries. Run alongside existing seed chunks for validation.  
**Depends on**: Phase 3  
**Output**: Dual-mode seeding (old + new), logged mismatches  

### Phase 5: Remove Hardcoded Seed Chunks
**Scope**: Delete all files in `src/background/seed-chunks/`. Update `default-scripts-seeder.ts` and `default-project-seeder.ts` to delegate fully to the instruction-driven seeder.  
**Depends on**: Phase 4 (validated dual-mode)  
**Output**: Clean codebase, single source of truth  

### Phase 6: Export AI Guide Feature
**Scope**: Add "Export AI Guide" button to project detail view. Concatenates guide docs, resolves placeholders, copies to clipboard or downloads as `.md`.  
**Depends on**: Phase 3 (guide files in dist)  
**Output**: Working export feature in extension UI  

---

## 7. Open Questions

1. **Should third-party projects also auto-seed?** — Currently `seedOnInstall` is only for built-in projects. Third-party projects would need an import flow.
2. **Should the guide include Go/PHP backend references?** — The current system is extension-only, but the spec folder has cross-language coding guidelines.
3. **Version compatibility** — Should `instruction.json` declare a `schemaVersion` to handle future schema changes?

---

## 8. Acceptance Criteria

- [ ] A new project can be created by: (a) creating a folder under `standalone-scripts/`, (b) writing `instruction.ts` with the seed block, (c) running the build — and it auto-seeds into the extension without modifying any seeder code.
- [ ] An AI agent, given only the exported guide document, can produce a working project from scratch.
- [ ] All existing projects (marco-sdk, xpath, macro-controller) continue to seed correctly after migration.
- [ ] No hardcoded seed chunks remain after Phase 5.
- [ ] The "Export AI Guide" button produces a single document containing all guide content with resolved paths.
