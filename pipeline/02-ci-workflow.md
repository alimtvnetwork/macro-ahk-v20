# 02 — CI Workflow

**File**: `.github/workflows/ci.yml`
**Triggers**: Push to `main`, Pull requests to `main`
**Concurrency**: Cancel previous in-flight builds when a new commit lands

## Pipeline Architecture

The CI pipeline is structured as **5 parallel-capable jobs** with dependency edges:

```
┌──────────┐
│  setup   │  ← Checkout, lint (root + extension), test
└────┬─────┘
     │
     ├─────────────────────┐
     │                     │
┌────▼─────┐        ┌─────▼──────┐
│ build-sdk│        │build-prompts│
└────┬─────┘        └─────┬──────┘
     │                     │
     ├──────────┐          │
     │          │          │
┌────▼───┐ ┌───▼──────┐   │
│ xpath  │ │controller│   │
└────┬───┘ └───┬──────┘   │
     │         │           │
     └────┬────┘───────────┘
          │
   ┌──────▼───────┐
   │build-extension│  ← Downloads all artifacts, final build
   └──────────────┘
```

## Job Descriptions

### 1. `setup` — Lint & Test

Runs all quality gates before any build work begins.

| Step | Command | Purpose |
|------|---------|---------|
| Checkout | `actions/checkout@v4 (fetch-depth: 0)` | Full history for changelog generation |
| Enforce lowercase .md | `find + grep` | Block uppercase `.md` filenames |
| Setup Node.js | `actions/setup-node@v4 (node 20)` | Runtime environment |
| Setup pnpm | `pnpm/action-setup@v4 (pnpm 9)` | Package manager |
| Install root deps | `pnpm install --no-frozen-lockfile` | Root workspace packages |
| Install ext deps | `cd chrome-extension && pnpm install` | Extension-specific packages |
| Root lint | `pnpm run lint` | ESLint 9 flat config (root) |
| Extension lint | `cd chrome-extension && pnpm run lint` | ESLint legacy config (extension) |
| Tests | `pnpm run test` | Vitest single-pass run |

### 2. `build-sdk` — Marco SDK

**Depends on**: `setup`
**Uploads**: `standalone-scripts/marco-sdk/dist/` as `sdk-dist` artifact

The SDK must build first because XPath and Macro Controller depend on it.

Build command chain:
```
check-axios-version → compile-instruction → tsc --noEmit → vite build → generate-dts
```

### 3a. `build-xpath` — XPath Utility

**Depends on**: `build-sdk`
**Downloads**: `sdk-dist`
**Uploads**: `standalone-scripts/xpath/dist/` as `xpath-dist` artifact

Build command chain:
```
check-axios-version → compile-instruction → tsc --noEmit → vite build
```

### 3b. `build-macro-controller` — Macro Controller

**Depends on**: `build-sdk`
**Downloads**: `sdk-dist`
**Uploads**: `standalone-scripts/macro-controller/dist/` as `macro-controller-dist` artifact

Build command chain:
```
check-axios-version → build:prompts → build:macro-less → build:macro-templates
→ compile-instruction → build:seed-manifest → check-version-sync
→ tsc --noEmit → vite build → sync-macro-controller-legacy
```

### 3c. `build-prompts` — Prompt Aggregation

**Depends on**: `setup` (no SDK dependency)
**Uploads**: `standalone-scripts/prompts/` as `prompts-dist` artifact

Build command: `node scripts/aggregate-prompts.mjs`

### 4. `build-extension` — Chrome Extension

**Depends on**: `build-sdk`, `build-xpath`, `build-macro-controller`, `build-prompts`
**Downloads**: All 4 artifacts into their respective `dist/` directories

Build command chain:
```
check-axios-version → lint-const-reassign → compile-instruction (×3)
→ check-standalone-dist → check-version-sync → vite build
```

## Concurrency Strategy

```yaml
concurrency:
  group: ci-main-${{ github.sha }}
  cancel-in-progress: true
```

A new push to `main` cancels any in-progress CI run. This saves runner minutes
since only the latest commit matters.

## Artifact Passing Between Jobs

Each standalone script build uploads its `dist/` directory using `actions/upload-artifact@v4`.
Downstream jobs download these artifacts into the same relative paths before building.

| Artifact Name | Source Path | Consumed By |
|---------------|------------|-------------|
| `sdk-dist` | `standalone-scripts/marco-sdk/dist/` | xpath, controller, extension |
| `xpath-dist` | `standalone-scripts/xpath/dist/` | extension |
| `macro-controller-dist` | `standalone-scripts/macro-controller/dist/` | extension |
| `prompts-dist` | `standalone-scripts/prompts/` | extension |

Artifacts have a 1-day retention — they are ephemeral build intermediates only.

## Dependency Installation Notes

**Root** (`/`): Uses `--no-frozen-lockfile` because the lockfile may not exist
in all environments (Lovable editor doesn't generate one).

**Extension** (`chrome-extension/`): Tries `--frozen-lockfile` first (if lockfile exists),
falls back to `--no-frozen-lockfile --lockfile=false`. Also removes `pnpm-workspace.yaml`
which may contain local-only Windows store paths.

## Lint Configuration

Two separate lint passes run in the `setup` job:

### Root Lint (`eslint.config.js` — ESLint 9 flat config)
- `eslint-plugin-sonarjs` for code quality (cognitive complexity, function size)
- Zero warnings policy: `--max-warnings 0` enforced
- Different function-size limits per directory:
  - Default: 25 lines
  - React components (`src/components/`, `src/pages/`): 50 lines
  - Background/hooks/lib: 40 lines
  - Standalone scripts: 50 lines
  - Tests: unlimited

### Extension Lint (`chrome-extension/.eslintrc.json` — ESLint legacy config)
- Type-aware rules (`@typescript-eslint/recommended-requiring-type-checking`)
- `eslint-plugin-sonarjs`, `eslint-plugin-import`, `eslint-plugin-unicorn`, `eslint-plugin-jsdoc`
- Strict boolean expressions, explicit return types
- Architecture enforcement: `import/no-restricted-paths` prevents cross-boundary imports
- Max 200 lines per file, max 3 params per function, max 25 lines per function
- Cognitive complexity: max 10
- Zero warnings: `--max-warnings 0`

## Test Configuration

- Vitest with `vitest run` (single pass, no watch)
- jsdom environment for DOM-dependent tests
- Tests located in `src/__tests__/`, `src/test/`, and `**/__tests__/`

## What "Build Extension" Does Internally

The `build:extension` script chains several validation steps before the actual Vite build:

```
check-axios-version → lint-const-reassign → compile-instruction (×3)
→ check-standalone-dist → check-version-sync → vite build
```

See [05-build-chain.md](05-build-chain.md) for details.
