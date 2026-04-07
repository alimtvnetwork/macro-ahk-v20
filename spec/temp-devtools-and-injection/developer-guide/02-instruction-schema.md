# 02 — Instruction Schema Reference

> Complete `instruction.ts` schema with field-by-field documentation and examples.

---

## TypeScript Interface

```typescript
interface ProjectInstruction {
    /** Schema version for forward-compatible evolution (e.g., "1.0") */
    schemaVersion: string;

    /** Project identifier — must match the folder name under standalone-scripts/ */
    name: string;

    /** Human-readable display name shown in extension UI */
    displayName: string;

    /** Semantic version (e.g., "2.1.0") */
    version: string;

    /** Brief description of the project's purpose */
    description: string;

    /** Chrome execution world: "MAIN" (shares page DOM) or "ISOLATED" (content script sandbox) */
    world: "MAIN" | "ISOLATED";

    /** Other project names that must be injected before this one */
    dependencies: string[];

    /** Global load order — lower values load first (xpath=1, macro-controller=2) */
    loadOrder: number;

    /** Asset declarations — determines the injection sequence */
    assets: {
        /** CSS files injected into <head> FIRST via chrome.scripting.insertCSS() */
        css: Array<{
            file: string;       // Filename in dist/ (e.g., "macro-looping.css")
            inject: "head";     // Always "head"
        }>;

        /** JSON config files loaded BEFORE JavaScript */
        configs: Array<{
            file: string;       // Filename in dist/ (e.g., "macro-looping-config.json")
            key: string;        // Runtime identifier (e.g., "config")
            injectAs?: string;  // Window global name (e.g., "__MARCO_CONFIG__")
        }>;

        /** JavaScript files loaded LAST, in declared order */
        scripts: Array<{
            file: string;           // Filename in dist/ (e.g., "macro-looping.js")
            order: number;          // Injection order within this project
            configBinding?: string; // Which config key this script needs
            themeBinding?: string;  // Which config key provides theme data
            isIife?: boolean;       // Whether the script is an IIFE wrapper (default: true)
        }>;

        /** Template registries loaded alongside configs */
        templates: Array<{
            file: string;       // Filename in dist/ (e.g., "templates.json")
            injectAs?: string;  // Window global name (e.g., "__MARCO_TEMPLATES__")
        }>;

        /** Prompt data files seeded into SQLite */
        prompts: Array<{
            file: string;       // Filename in dist/ (e.g., "prompts.json")
        }>;
    };
}
```

## Injection Load Order

Assets are injected in this strict sequence:

1. **CSS** → injected into `<head>` via `chrome.scripting.insertCSS()`
2. **JSON configs** → fetched and injected as `window` globals
3. **Templates** → fetched and injected as `window` globals
4. **Prompts** → seeded into SQLite `Prompts` table
5. **JavaScript** → fetched and executed in declared `order`

## Example: Minimal Project (No Config)

```typescript
const instruction: ProjectInstruction = {
    name: "xpath",
    displayName: "XPath Utilities",
    version: "1.0.0",
    description: "Global XPath utility library (getByXPath, findElement, reactClick)",
    world: "MAIN",
    dependencies: [],
    loadOrder: 1,
    assets: {
        css: [],
        configs: [],
        scripts: [
            { file: "xpath.js", order: 1, isIife: true },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
```

## Example: Full-Featured Project (CSS, Configs, Templates)

```typescript
const instruction: ProjectInstruction = {
    name: "macro-controller",
    displayName: "Macro Controller",
    version: "2.1.0",
    description: "Macro Controller for workspace and credit management",
    world: "MAIN",
    dependencies: ["xpath"],
    loadOrder: 2,
    assets: {
        css: [
            { file: "macro-looping.css", inject: "head" },
        ],
        configs: [
            { file: "macro-looping-config.json", key: "config", injectAs: "__MARCO_CONFIG__" },
            { file: "macro-theme.json", key: "theme", injectAs: "__MARCO_THEME__" },
        ],
        scripts: [
            { file: "macro-looping.js", order: 1, configBinding: "config", themeBinding: "theme", isIife: true },
        ],
        templates: [
            { file: "templates.json", injectAs: "__MARCO_TEMPLATES__" },
        ],
        prompts: [],
    },
};

export default instruction;
```

## Compilation

```bash
node scripts/compile-instruction.mjs standalone-scripts/{project-name}
```

This reads `src/instruction.ts`, extracts the default export object literal, and writes `dist/instruction.json`.
