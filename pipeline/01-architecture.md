# 01 — Project Architecture

## Repository Layout

```
repo-root/
├── src/                          # Shared source (types, components, background scripts)
├── chrome-extension/             # Chrome extension entry point
│   ├── manifest.json             # Extension manifest (carries version)
│   ├── src/                      # Extension-specific source
│   └── dist/                     # Build output (gitignored)
├── standalone-scripts/           # Independently built JS bundles
│   ├── marco-sdk/                # SDK library (built first — others depend on it)
│   ├── xpath/                    # XPath utility script
│   └── macro-controller/        # Main automation controller
├── scripts/                      # Build & validation Node.js scripts
├── .github/workflows/            # CI and Release GitHub Actions
├── changelog.md                  # Human-maintained changelog
└── package.json                  # Root — contains all build/lint/test commands
```

## Dependency Graph (Build Order)

```
marco-sdk  ──┐
              ├──→  macro-controller
xpath     ──┘       (depends on SDK types)
              │
              ▼
        chrome-extension
        (bundles all standalone dist/ into dist/projects/scripts/)
```

**Rule**: SDK must be built before macro-controller and xpath.
The extension build copies all standalone `dist/` folders into its own `dist/`.

## Key Concepts

### Standalone Scripts
Each standalone script in `standalone-scripts/{name}/` is a self-contained project with:
- `src/instruction.ts` — declarative manifest (name, version, assets, entry points)
- `dist/` — compiled output (JS bundle + instruction.json + assets)
- Its own Vite config at the repo root (`vite.config.{name}.ts`)
- Its own TypeScript config (`tsconfig.{name}.json`)

### instruction.ts → instruction.json
Every standalone script has an `instruction.ts` that is compiled to `instruction.json`
at build time by `scripts/compile-instruction.mjs`. This JSON file is the sole source
of truth for what assets belong to that script. The extension's Vite plugin reads it
during build to copy the right files.

### Chrome Extension Build
The extension's Vite config includes a custom plugin (`copyProjectScripts`) that:
1. Reads each standalone script's `dist/instruction.json`
2. Copies all dist artifacts into `chrome-extension/dist/projects/scripts/{name}/`
3. Generates a `seed-manifest.json` listing all bundled projects

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 |
| Bundler | Vite 5 |
| Package manager | pnpm 9 |
| Runtime | Node.js 20 |
| Test framework | Vitest |
| Linter | ESLint 9 (flat config) + eslint-plugin-sonarjs |
| CI platform | GitHub Actions |
| CSS (extension UI) | Tailwind CSS v3 |
| CSS (standalone) | Less → compiled CSS |
