# Spec 63 — Rise Up Macro SDK IIFE Bundle

**Date**: 2026-03-23  
**Status**: Implemented  
**Spec**: `spec/07-chrome-extension/63-rise-up-macro-sdk.md`

---

## Overview

The Rise Up Macro SDK is a standalone IIFE bundle that exposes `window.marco` (and `window.RiseupAsiaMacroExt.Projects.<CodeName>.*` per-project namespaces) for injected scripts in the page's MAIN world. It provides unified access to extension services via the message bridge.

## Architecture

### Build Pipeline

```
standalone-scripts/marco-sdk/src/index.ts
  → vite.config.sdk.ts (IIFE build)
  → standalone-scripts/marco-sdk/dist/marco-sdk.js
  → chrome-extension dist/projects/scripts/marco-sdk/ (via copyProjectScripts plugin)
```

### Namespace Structure

```
window.RiseupAsiaMacroExt.Projects.<CodeName>.vars.get(key)
window.RiseupAsiaMacroExt.Projects.<CodeName>.vars.set(key, value)
window.RiseupAsiaMacroExt.Projects.<CodeName>.vars.getAll()
window.RiseupAsiaMacroExt.Projects.<CodeName>.urls.getMatched()
window.RiseupAsiaMacroExt.Projects.<CodeName>.urls.listOpen()
window.RiseupAsiaMacroExt.Projects.<CodeName>.urls.getVariables()
window.RiseupAsiaMacroExt.Projects.<CodeName>.xpath.getChatBox()
window.RiseupAsiaMacroExt.Projects.<CodeName>.cookies.get(bindTo)
window.RiseupAsiaMacroExt.Projects.<CodeName>.cookies.getAll()
window.RiseupAsiaMacroExt.Projects.<CodeName>.kv.get(key)
window.RiseupAsiaMacroExt.Projects.<CodeName>.kv.set(key, value)
window.RiseupAsiaMacroExt.Projects.<CodeName>.kv.delete(key)
window.RiseupAsiaMacroExt.Projects.<CodeName>.kv.list()
window.RiseupAsiaMacroExt.Projects.<CodeName>.files.save(name, data)
window.RiseupAsiaMacroExt.Projects.<CodeName>.files.read(name)
window.RiseupAsiaMacroExt.Projects.<CodeName>.files.list()
window.RiseupAsiaMacroExt.Projects.<CodeName>.meta  // { name, version, slug, codeName }
window.RiseupAsiaMacroExt.Projects.<CodeName>.log.info(msg)
window.RiseupAsiaMacroExt.Projects.<CodeName>.log.warn(msg)
window.RiseupAsiaMacroExt.Projects.<CodeName>.log.error(msg, ctx)
```

### Project Identifiers

Each project has two derived identifiers:

| Field | Format | Example | Usage |
|-------|--------|---------|-------|
| `slug` | hyphen-case | `marco-dashboard` | URL-safe IDs, file paths, DB names |
| `codeName` | PascalCase | `MarcoDashboard` | SDK namespace key |

```
slug: "marco-dashboard" → codeName: "MarcoDashboard"
namespace: RiseupAsiaMacroExt.Projects.MarcoDashboard
```

### Script Manifest

```json
{
  "name": "marco-sdk",
  "displayName": "Rise Up Macro SDK",
  "version": "1.0.0",
  "outputFile": "marco-sdk.js",
  "world": "MAIN",
  "isGlobal": true,
  "isRemovable": false,
  "dependencies": [],
  "loadOrder": 0
}
```

- `loadOrder: 0` ensures SDK is injected before any project scripts.
- `isGlobal: true` means it's injected once, shared across all projects.
- `isRemovable: false` prevents user deletion.

### Build Commands

```bash
npm run build:sdk      # Compile SDK IIFE
npm run build:ext      # Build extension (requires SDK pre-built)
```

### Pre-Build Validation

The extension Vite config (`chrome-extension/vite.config.ts`) includes a pre-build check that fails fast if `standalone-scripts/marco-sdk/dist/marco-sdk.js` is missing.

## Related Files

| File | Purpose |
|------|---------|
| `standalone-scripts/marco-sdk/src/index.ts` | SDK entry point |
| `standalone-scripts/marco-sdk/src/instruction.ts` | Project manifest (sole source of truth) |
| `vite.config.sdk.ts` | Vite IIFE build config |
| `tsconfig.sdk.json` | TypeScript config for SDK |
| `chrome-extension/vite.config.ts` | Extension build (copyProjectScripts) |
| `src/lib/slug-utils.ts` | Slug generation + codeName + namespace derivation |
| `src/components/options/DevGuideSection.tsx` | Inline developer docs component |

## Dependencies

- Spec 50: Script Dependency System (`spec/07-chrome-extension/50-script-dependency-system.md`)
- Spec 43: Macro Controller Extension Bridge (`spec/07-chrome-extension/43-macro-controller-extension-bridge.md`)
- Spec 58: Updater System (`spec/07-chrome-extension/58-updater-system.md`)
