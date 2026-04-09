# Spec 50: Script Dependency System & Modular Dist Structure

**Status**: Design Complete — Execute via "next"  
**Version**: 1.0.0  
**Date**: 2026-03-21

---

## 1. Current State Analysis

### How `run.ps1 -d` Works Today

```
┌─────────────────────────────────────────────────────────────┐
│  run.ps1 -d  Pipeline                                       │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Git pull                                           │
│  Step 2: Prerequisites (Node, pnpm)                         │
│  Step 3a: Install deps in chrome-extension/                 │
│  Step 3b: Aggregate prompts                                 │
│  Step 3c: Build standalone scripts                          │
│    └─ Scans standalone-scripts/*/src/                       │
│    └─ Runs `npm run build:<folder-name>`                    │
│    └─ build:macro-controller → TS→JS IIFE                   │
│    └─ Post-build: copies dist/macro-looping.js              │
│       → 01-macro-looping.js (source-of-truth file)          │
│  Step 3d: Build extension (Vite)                            │
│    └─ looping-script-chunk.ts imports 01-macro-looping.js   │
│       via `?raw` → embeds as string in background bundle    │
│    └─ Seeder stores code in chrome.storage.local            │
│  Step 4: Deploy to Chrome profile                           │
└─────────────────────────────────────────────────────────────┘
```

### Current Script Deployment Path

```
standalone-scripts/macro-controller/src/*.ts
    ↓  (vite build --config vite.config.macro.ts)
standalone-scripts/macro-controller/dist/macro-looping.js
    ↓  (post-build copy)
standalone-scripts/macro-controller/01-macro-looping.js
    ↓  (Vite ?raw import at extension build time)
Embedded as string literal in background bundle
    ↓  (runtime: seedDefaultScripts())
chrome.storage.local["marco_all_scripts"][0].code
    ↓  (runtime: injection-handler.ts)
Injected into page via chrome.scripting.executeScript
```

### Problems

1. **Monolithic bundle**: XPath logic (~264 lines) is bundled inside `macro-looping.js` (~3000+ lines)
2. **No reuse**: Other scripts cannot use XPath without duplicating it
3. **No load order**: All scripts are independent; no dependency graph
4. **No dist/projects/scripts/ structure**: Scripts live only in chrome.storage, not as files in dist/

---

## 2. Target Architecture

### Dist Structure

```
chrome-extension/dist/
├── manifest.json
├── background/
├── src/popup/
├── src/options/
├── assets/
├── wasm/
├── config/
└── projects/
    └── scripts/
        ├── xpath.js              ← Global utility (loaded first, always)
        └── macroController.js    ← Depends on xpath.js (loaded second)
```

### Dependency Flow

```
[Extension Boot / Injection Request]
    │
    ├─ 1. Load xpath.js (MAIN world)
    │     └─ Exposes window.XPathUtils = { getByXPath, getAllByXPath, findElement, reactClick }
    │
    └─ 2. Load macroController.js (MAIN world)
          └─ Assumes window.XPathUtils exists
          └─ No duplicate XPath code
```

### Script Layers

| Layer | Script | Scope | Load Order |
|-------|--------|-------|------------|
| **Global/Shared** | `xpath.js` | All scripts | 1 (always first) |
| **Application** | `macroController.js` | Per-project | 2+ (after globals) |
| **Future Shared** | `logger.js`, `domUtils.js` | All scripts | 1 (with xpath) |

---

## 3. Dependency Metadata Schema

Each standalone script declares dependencies in its `src/instruction.ts` (compiled to `dist/instruction.json`):

```typescript
// standalone-scripts/macro-controller/src/instruction.ts
const instruction = {
    schemaVersion: "1.0",
    name: "macro-controller",
    version: "2.1.0",
    world: "MAIN",
    dependencies: ["xpath"],
    loadOrder: 2,
    // ... assets, seed block
};
```

```typescript
// standalone-scripts/xpath/src/instruction.ts
const instruction = {
    schemaVersion: "1.0",
    name: "xpath",
    version: "1.0.0",
    world: "MAIN",
    dependencies: [],
    loadOrder: 1,
    // ... assets, seed block
};
```

---

## 4. Required Changes

### 4.1 Create XPath Standalone Script

**New folder**: `standalone-scripts/xpath/`

```
standalone-scripts/xpath/
├── src/
│   ├── index.ts          ← Entry: builds window.XPathUtils IIFE
│   ├── core.ts           ← getByXPath, getAllByXPath
│   ├── find-element.ts   ← findElement with multi-method fallback
│   └── react-click.ts    ← reactClick helper
├── dist/
│   ├── xpath.js          ← Compiled IIFE
│   └── instruction.json  ← Compiled manifest
└── readme.md
```

**Source**: Extract from `standalone-scripts/macro-controller/src/xpath-utils.ts`

**Key change**: XPath must NOT import from macro-controller's `shared-state.ts` or `logging.ts`. It must be self-contained with its own minimal logging.

### 4.2 Vite Config for XPath

**New file**: `vite.config.xpath.ts` (or extend existing pattern)

Builds `standalone-scripts/xpath/src/index.ts` → `standalone-scripts/xpath/dist/xpath.js` as IIFE exposing `window.XPathUtils`.

### 4.3 Update Macro Controller

- Remove `xpath-utils.ts` from macro-controller source
- Import nothing from xpath at build time
- At runtime, reference `window.XPathUtils` (already partially done via `hasXPathUtils` flag)
- The `hasXPathUtils` check becomes the primary path, not a fallback

### 4.4 Copy Scripts to dist/projects/scripts/

**New Vite plugin** in `vite.config.extension.ts` (or `chrome-extension/vite.config.ts`):

```typescript
function copyProjectScripts(): Plugin {
  return {
    name: "copy-project-scripts",
    writeBundle() {
      const scriptsDir = resolve(DIST_DIR, "projects", "scripts");
      mkdirSync(scriptsDir, { recursive: true });

      // Read all standalone-scripts/*/dist/instruction.json
      // Copy each project's dist/ artifacts → dist/projects/scripts/{name}/
    },
  };
}
```

### 4.5 Update Injection Handler

Modify `injection-handler.ts` to:

1. Read `instruction.json` dependency info (stored via seeder)
2. Before injecting a script, inject its dependencies first
3. Global scripts (like xpath) are injected once per tab, then cached

```typescript
// Pseudocode for injection order
async function injectWithDependencies(tabId, script) {
  const deps = script.dependencies || [];
  for (const dep of deps) {
    if (!isAlreadyInjected(tabId, dep)) {
      await injectGlobalScript(tabId, dep);
    }
  }
  await injectScript(tabId, script);
}
```

### 4.6 Update Seeder

The seeder must:
1. Seed xpath.js as a separate StoredScript with `isGlobal: true`
2. Seed macroController.js with `dependencies: ["xpath"]`
3. Mark global scripts so the injection handler knows load order

### 4.7 Update run.ps1

The standalone scripts build loop (lines 1309-1342) already handles this — it scans `standalone-scripts/*/src/` and runs `build:<folder-name>`. No changes needed if we add:

- `npm run build:xpath` script in `package.json`
- `standalone-scripts/xpath/src/` folder

### 4.8 Manifest Update

Add `projects/scripts/*.js` to `web_accessible_resources` so scripts can be loaded from extension context:

```json
{
  "resources": ["projects/scripts/*.js"],
  "matches": ["<all_urls>"]
}
```

---

## 5. Execution Plan (Step-by-Step)

Execute each step via "next" command:

| Step | Task | Files Changed |
|------|------|---------------|
| **01** | Create `standalone-scripts/xpath/` folder structure with `src/instruction.ts` and `readme.md` | New files |
| **02** | Extract XPath logic into `standalone-scripts/xpath/src/` (self-contained, no macro-controller deps) | New: `index.ts`, `core.ts`, `find-element.ts`, `react-click.ts` |
| **03** | Create `vite.config.xpath.ts` and add `build:xpath` npm script | New + `package.json` |
| **04** | Update macro-controller to remove bundled xpath-utils, use `window.XPathUtils` as primary | `macro-controller/src/xpath-utils.ts`, `macro-looping.ts` |
| **05** | Add `copyProjectScripts()` Vite plugin to copy built scripts into `dist/projects/scripts/` | `vite.config.extension.ts` or `chrome-extension/vite.config.ts` |
| **06** | Update manifest `web_accessible_resources` to include `projects/scripts/*` | `manifest.json` |
| **07** | Create xpath seeder chunk (`seed-chunks/xpath-script-chunk.ts`) and update `default-scripts-seeder.ts` | New + modified |
| **08** | Update injection handler to resolve dependencies and enforce load order | `injection-handler.ts`, `injection-request-resolver.ts` |
| **09** | Add dependency tracking to `StoredScript` type (`dependencies`, `isGlobal`, `loadOrder`) | `script-config-types.ts` |
| **10** | End-to-end validation: build pipeline, seeding, injection order | Manual test |

---

## 6. Remaining Tasks (from prior context)

| # | Task | Priority |
|---|------|----------|
| 11 | Define dropdown UI behavior and structure | Medium |
| 12 | Define execution loop logic for task automation | Medium |
| 13 | Define button interaction logic with enable check | Medium |
| 14 | Define settings schema and persistence | Medium |
| 15 | Define settings UI and override behavior | Medium |
| 16 | Define default reset behavior on -d run | Medium |
| 17 | Validate no regression in existing functionality | High |

---

## 7. Rules & Constraints

1. **xpath.js must be fully self-contained** — no imports from macro-controller
2. **Global scripts load before dependent scripts** — enforced by injection handler
3. **Backward compatible** — if xpath.js is missing, macroController falls back to inline (existing `hasXPathUtils` pattern)
4. **No global pollution** — only `window.XPathUtils` namespace
5. **Scripts independently testable** — each has its own build and can run standalone
6. **run.ps1 auto-discovers** — no hardcoded script list; scans `standalone-scripts/*/src/`
