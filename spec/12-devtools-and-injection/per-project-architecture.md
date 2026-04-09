# 18 — Per-Project Architecture

**Version**: v1.0.0
**Date**: 2026-03-22
**Status**: Active

---

## 1. Overview

Each standalone script is a **project** — a self-contained unit with its own source, compiled artifacts, load manifest, and runtime identity. Projects are compiled into per-project subfolders, deployed into the Chrome extension's `dist/`, and loaded at injection time via file-path references stored in SQLite.

---

## 2. Project Folder Structure

```
standalone-scripts/{project-name}/
├── src/
│   ├── index.ts              # Build entry point
│   ├── instruction.ts        # Load manifest (→ dist/instruction.json)
│   └── ...                   # TypeScript source files
├── dist/                     # Compiled artifacts (build output)
│   ├── {name}.js             # IIFE bundle
│   ├── {name}.css            # Compiled LESS styles (optional)
│   ├── templates.json        # Compiled HTML templates (optional)
│   ├── instruction.json      # Compiled load manifest
│   └── ...                   # Other assets (configs, prompts)
├── less/                     # LESS source (optional)
├── templates/                # HTML template source (optional)
└── readme.md
```

### Rules

- `src/` is the **canonical source of truth** — never edit compiled output.
- `dist/` is the **sole input** for seeding and deployment.
- Legacy root-level JS files (e.g., `01-macro-looping.js`) are **off-limits** — build automation must never read or write them.

---

## 3. instruction.ts — Project Load Manifest

Each project declares an `instruction.ts` in `src/` that compiles to `dist/instruction.json`. This manifest defines **what** to load and **in what order**.

### Schema

```typescript
interface ProjectInstruction {
    /** Project identifier (matches folder name) */
    name: string;
    /** Human-readable display name */
    displayName: string;
    /** Semantic version */
    version: string;
    /** Description */
    description: string;
    /** Chrome execution world */
    world: "MAIN" | "ISOLATED";
    /** Other project names that must load first */
    dependencies: string[];
    /** Global load order (lower = first) */
    loadOrder: number;
    /** Asset declarations — determines injection sequence */
    assets: {
        /** CSS files injected into <head> FIRST */
        css: Array<{
            file: string;
            inject: "head";
        }>;
        /** JSON config files loaded BEFORE JavaScript */
        configs: Array<{
            file: string;
            key: string;
            injectAs?: string;       // window global name
        }>;
        /** JavaScript files loaded LAST, in declared order */
        scripts: Array<{
            file: string;
            order: number;
            configBinding?: string;   // which config key this script needs
            themeBinding?: string;    // which config key provides theme
            isIife?: boolean;
        }>;
        /** Template registries loaded alongside configs */
        templates: Array<{
            file: string;
            injectAs?: string;       // window global name
        }>;
        /** Prompt data files seeded into SQLite */
        prompts: Array<{
            file: string;
        }>;
    };
}
```

### Injection Load Order

The `assets` object defines a strict injection sequence:

1. **CSS** → injected into `<head>` via `chrome.scripting.insertCSS()`
2. **JSON configs** → fetched and injected as `window` globals (e.g., `window.__MARCO_CONFIG__`)
3. **Templates** → fetched and injected as `window` globals (e.g., `window.__MARCO_TEMPLATES__`)
4. **Prompts** → seeded into SQLite `Prompts` table
5. **JavaScript** → fetched and executed in declared `order`, with config/theme bindings resolved

### Compilation

```bash
node scripts/compile-instruction.mjs standalone-scripts/{project-name}
```

Reads `src/instruction.ts`, extracts the default export object literal, writes `dist/instruction.json`.

---

## 4. Per-Project Dist in Extension

After the Vite extension build, `copyProjectScripts()` deploys each project into its own subfolder:

```
chrome-extension/dist/
├── projects/
│   └── scripts/
│       ├── marco-sdk/
│       │   ├── marco-sdk.js
│       │   └── instruction.json
│       ├── xpath/
│       │   ├── xpath.js
│       │   └── instruction.json
│       └── macro-controller/
│           ├── macro-looping.js
│           ├── macro-looping.css
│           ├── macro-looping-config.json
│           ├── macro-theme.json
│           ├── templates.json
│           └── instruction.json
├── prompts/
│   └── macro-prompts.json        # Aggregated prompts (top-level, shared)
```

### manifest.json

All project subfolders and prompts are declared in `web_accessible_resources`:

```json
{
    "web_accessible_resources": [{
        "resources": [
            "projects/scripts/*/*",
            "prompts/*",
            "sql-wasm.wasm"
        ],
        "matches": ["<all_urls>"]
    }]
}
```

---

## 5. SQLite File-Path Storage

Scripts store **file paths** in SQLite, not embedded code blobs. Code is fetched at injection time.

### Scripts Table Columns

| Column       | Type    | Description |
|-------------|---------|-------------|
| `FilePath`  | TEXT    | Relative or absolute path to the script file |
| `IsAbsolute`| INTEGER | `0` = relative (resolved via Settings base path), `1` = absolute URL |

### Settings Table

| Key              | Value                          | Purpose |
|-----------------|--------------------------------|---------|
| `ExtensionBasePath` | `chrome-extension://{id}/` | Base URL for resolving relative file paths |

### Path Resolution at Injection Time

```
if (script.isAbsolute) {
    url = script.filePath;                              // use as-is
} else {
    url = chrome.runtime.getURL(script.filePath);       // resolve relative
}
// Fetch code from url; fallback to script.code if fetch fails
```

### Example Stored Paths

| Script | FilePath | IsAbsolute |
|--------|----------|------------|
| xpath.js | `projects/scripts/xpath/xpath.js` | 0 |
| macro-looping.js | `projects/scripts/macro-controller/macro-looping.js` | 0 |

---

## 6. Prompt Reseed Behavior

Prompts are aggregated from `standalone-scripts/prompts/` into `dist/prompts/macro-prompts.json` and deployed to `chrome-extension/dist/prompts/`.

### Reseed Strategy: Full Wipe + Reseed

On every `-d` deploy (and on extension boot):

1. **Clear** all rows from `Prompts`, `PromptsToCategory`, `PromptsCategory`
2. **Re-insert** all prompts from the compiled `macro-prompts.json`
3. User-created prompts are **not preserved** across deployments

This ensures the SQLite prompt data always matches the compiled source.

---

## 7. Script Dependency Resolution

### Declaration

Projects declare dependencies in `instruction.ts`:

```typescript
// instruction.ts
dependencies: ["xpath"],   // project names
loadOrder: 2,              // higher = loaded later
```

### Runtime Resolution

1. Injection request received with script entries
2. `resolveScriptBindings()` resolves entries to executable code
3. `resolveDependencies()` scans for `dependencies[]`
4. Missing dependencies auto-resolved from script store
5. All scripts sorted by `loadOrder` (xpath=1 → macro-controller=2)
6. Deduplication prevents double-injection

### Current Projects

| Project | loadOrder | Dependencies | isGlobal |
|---------|-----------|-------------|----------|
| xpath | 1 | none | true |
| macro-controller | 2 | xpath | false |

---

## 8. Build Pipeline Summary

When `run.ps1 -d` executes:

```
1. Auto-discover standalone-scripts/*/src/ folders
2. For each project:
   a. Compile instruction.ts → dist/instruction.json
   b. Compile LESS → dist/{name}.css (if less/ exists)
   c. Compile templates → dist/templates.json (if templates/ exists)
   d. Aggregate prompts → dist/prompts/macro-prompts.json
   e. TypeScript type-check (tsc --noEmit)
   f. Vite IIFE build → dist/{name}.js
3. Vite extension build:
   a. copyProjectScripts() → chrome-extension/dist/projects/scripts/{name}/
   b. Copy prompts → chrome-extension/dist/prompts/
4. Extension boot:
   a. Seeder stores file paths in SQLite
   b. reseedPrompts() wipes + re-inserts prompt data
5. At injection time:
   a. Read file paths from SQLite
   b. Fetch code via chrome.runtime.getURL(filePath)
   c. Inject in load order: CSS → configs → templates → JS
```

---

## 9. Adding a New Project

1. Create `standalone-scripts/{name}/src/index.ts` and `src/instruction.ts`
2. Add `build:{name}` npm script in root `package.json`
3. The build pipeline auto-discovers and deploys it

> **Note:** `instruction.ts` is the sole manifest — no separate config files needed.

---

## 10. Rules & Constraints

1. **TypeScript source is canonical** — edit `src/`, never `dist/`
2. **Legacy JS files are off-limits** — `01-macro-looping.js` must never be touched by automation
3. **dist/ is the sole runtime input** — seeding and deployment read only from `dist/`
4. **SQLite stores file paths** — code is fetched at injection time, not embedded
5. **instruction.ts defines load order** — CSS first, configs second, JS last
6. **Prompts are fully wiped on deploy** — no user-created prompt persistence
7. **Relative paths resolved via Settings** — `ExtensionBasePath` + `FilePath`
