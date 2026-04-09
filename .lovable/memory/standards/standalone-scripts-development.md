# Memory: standards/standalone-scripts-development
Updated: 2026-03-21

## Build Architecture

Standalone scripts use a **root-level build configuration** — no per-folder `tsconfig.json` or `vite.config.ts`. Each script folder contains only `src/` (TypeScript source) and `dist/` (compiled output).

### Root-Level Config Files
- `tsconfig.macro.json` — TypeScript config for macro-controller (strict, noEmit)
- `vite.config.macro.ts` — Vite IIFE build config, outputs to `standalone-scripts/macro-controller/dist/`
- `npm run build:macro` — Runs `tsc --noEmit` then `vite build`

### Folder Structure
```
standalone-scripts/macro-controller/
├── src/
│   ├── index.ts              ← Build entry point
│   ├── macro-looping.ts      ← Full controller (Step 1: @ts-nocheck)
│   └── types.ts              ← Extracted interfaces
├── dist/
│   └── macro-looping.js      ← Compiled IIFE (injected into browser)
├── 01-macro-looping.js       ← Original JS reference
└── readme.md
```

## TypeScript Migration (In Progress)

- **Step 1** ✅: Entire JS copied into `src/macro-looping.ts` with `@ts-nocheck`
- **Step 2** 🔲: Split functions into individual files (~500 lines each)
- **Step 3** 🔲: Extract UI logic into `src/ui/` folder
- Migration docs: `spec/10-macro-controller/js-to-ts-migration/`

## Coding Standards
- PascalCase for constants
- Descriptive, human-readable variable names
- JSDoc on all public functions
- No `any` types except unavoidable DOM APIs
