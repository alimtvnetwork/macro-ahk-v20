# 01 — Project Structure

> How to organize a standalone script project.

---

## Folder Layout

Every project lives under `standalone-scripts/{project-name}/`:

```
standalone-scripts/{project-name}/
├── src/
│   ├── index.ts              # Build entry point (compiled → dist/{name}.js)
│   ├── instruction.ts        # Load manifest (compiled → dist/instruction.json)
│   └── ...                   # Additional TypeScript source files
├── dist/                     # Compiled output (never edit directly)
│   ├── {name}.js             # IIFE bundle
│   ├── {name}.css            # Compiled LESS styles (optional)
│   ├── templates.json        # Compiled HTML templates (optional)
│   ├── instruction.json      # Compiled load manifest
│   └── ...                   # Configs, prompts, other assets
├── less/                     # LESS source files (optional)
├── templates/                # HTML template source files (optional)
├── prompts/                  # Prompt data files (optional)
└── readme.md                 # Project documentation
```

## Required Files

### 1. `src/index.ts` — Entry Point

The main TypeScript file that becomes the IIFE bundle. This is what executes in the browser.

```typescript
// Minimal example
(function () {
    console.log("[my-project] Loaded");
    // Access SDK
    const token = await marco.auth.getToken();
})();
```

### 2. `src/instruction.ts` — Project Manifest (Sole Source of Truth)

Declares **all** project metadata: name, version, dependencies, assets, seed configuration, and build output. Compiled to `dist/instruction.json` at build time. See `02-instruction-schema.md` for the full schema.

`instruction.ts` is the **only manifest file required** — no separate `script-manifest.json` is needed.

## Optional Directories

| Directory | Purpose | Output |
|-----------|---------|--------|
| `less/` | LESS stylesheets | `dist/{name}.css` |
| `templates/` | HTML template files | `dist/templates.json` |
| `prompts/` | Prompt data (JSON) | `dist/prompts/` |

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Project folder | kebab-case | `macro-controller` |
| TypeScript files | camelCase | `creditResolver.ts` |
| CSS/LESS files | kebab-case | `macro-looping.css` |
| Config JSON files | kebab-case | `macro-looping-config.json` |
| Compiled output | matches project name | `macro-controller.js` |

## Rules

1. **`src/` is canonical** — never hand-edit files in `dist/`.
2. **`dist/` is the sole runtime input** — seeding and deployment read only from `dist/`.
3. **Legacy root-level JS files** (e.g., `01-macro-looping.js`) are off-limits — build automation must never read or write them.

## Project Identifiers

Each project has two derived identifiers:

| Field | Format | Example | Usage |
|-------|--------|---------|-------|
| `slug` | kebab-case | `macro-controller` | URLs, file paths, DB keys |
| `codeName` | PascalCase | `MacroController` | SDK namespace key (`RiseupAsiaMacroExt.Projects.MacroController`) |

Derivation: `slug → codeName` by capitalizing each segment after hyphens.
