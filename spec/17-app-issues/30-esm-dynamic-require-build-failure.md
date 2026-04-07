# Issue #30: ESM Dynamic require() Build Failure in vite.config.ts

**Version:** v1.0.0 toolchain  
**Date:** 2026-03-02  
**Status:** Resolved  
**Priority:** HIGH — This class of error silently breaks production builds.

---

## Issue Summary

### What happened
`vite build --mode production` failed with:
```
[copy-manifest] Dynamic require of "fs" is not supported
```

The custom `copyManifest()` Vite plugin used `require('fs').readFileSync()` and `require('fs').writeFileSync()` inside the `writeBundle` hook. Because `vite.config.ts` is compiled to ESM (`.mjs`) by Vite at build time, dynamic `require()` calls are not supported and throw at runtime.

### Where it happened
- **Feature:** Extension build pipeline
- **File:** `chrome-extension/vite.config.ts`
- **Function:** `copyManifest()` plugin, `writeBundle` hook (lines 20–55)

### Symptoms and impact
- Build failed after 808ms with `ELIFECYCLE` exit code 1.
- Extension could not be built or deployed.
- The error message was misleading — it pointed to a generated `.mjs` timestamp file, not the source `.ts` file.

### How it was discovered
User build log from `.\run.ps1 -d` execution.

---

## Root Cause Analysis

### Direct cause
The `copyManifest()` plugin used CommonJS-style dynamic `require('fs')` calls:
```typescript
// ❌ BROKEN — ESM context does not support require()
const manifest = JSON.parse(
  require('fs').readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8')
);
require('fs').writeFileSync(resolve(distDir, 'manifest.json'), ...);
```

Vite compiles `vite.config.ts` to an ESM module (`.mjs`) before executing it. In ESM context, `require()` is not available — only static `import` statements and dynamic `import()` are supported.

### Contributing factors
1. The original code was written in a CommonJS-compatible style, likely copied from a CJS example or template.
2. The `fs` module was partially imported at the top of the file (`import { copyFileSync, mkdirSync, existsSync } from 'fs'`), but the plugin body used a separate `require('fs')` pattern instead of the already-imported functions.
3. No ESM compatibility check existed in the build pipeline or preflight system.

### Triggering conditions
- Any `vite build` execution (dev or production mode).
- The error is deterministic — it fails 100% of the time.

### Why existing guardrails did not prevent it
- The preflight system (`-pf`) checked for package resolution but did not scan config files for ESM compatibility issues.
- TypeScript compilation does not flag `require()` as an error when `@types/node` is installed (it provides CJS type definitions).

---

## Fix Description

### What was changed

**File: `chrome-extension/vite.config.ts`**

1. Added `readFileSync` and `writeFileSync` to the existing static `import` from `'fs'`:
```typescript
// BEFORE
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// AFTER
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
```

2. Replaced all `require('fs')` calls in the `copyManifest()` plugin with the statically imported functions:
```typescript
// BEFORE — ❌ Dynamic require (crashes in ESM)
const manifest = JSON.parse(
  require('fs').readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8')
);
require('fs').writeFileSync(resolve(distDir, 'manifest.json'), ...);

// AFTER — ✓ Static import (ESM-safe)
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8')
);
writeFileSync(resolve(distDir, 'manifest.json'), ...);
```

### Why this resolves the root cause
Static `import` from `'fs'` is fully supported in ESM context. The functions are resolved at module load time, not at runtime, eliminating the dynamic `require()` incompatibility.

### Preventive guardrail added

**File: `run.ps1`** — Added a preflight check that scans `vite.config.ts` for dynamic `require()` usage:
```powershell
# ESM compatibility: scan vite.config.ts for dynamic require()
$requireMatches = [regex]::Matches($viteConfigContent, "(?m)(?<!//.*)\brequire\s*\(")
if ($requireMatches.Count -gt 0) {
    Write-Host "  ✗ vite.config.ts: contains dynamic require()" -ForegroundColor Red
    # Fails preflight with remediation guidance
}
```

This check:
- Runs during `.\run.ps1 -pf` (preflight mode)
- Ignores commented-out `require()` calls
- Provides a clear remediation message pointing to ESM-compatible static imports
- Fails the preflight check, preventing a confusing build error

---

## Iterations History

**Iteration 1 (final):** Replace `require('fs')` with static imports + add preflight ESM scanner.
- Result: Build succeeds. Preflight catches future regressions.

---

## Prevention and Non-Regression

### Prevention rule
> **RULE:** In ESM projects (`"type": "module"` in package.json), ALL `vite.config.ts` and plugin code MUST use static `import` statements. Dynamic `require()` is NEVER permitted. This applies to ALL Node.js built-in modules (`fs`, `path`, `url`, etc.) and ALL third-party packages.

### Anti-pattern reference
```typescript
// ❌ NEVER DO THIS in vite.config.ts or any ESM config file
require('fs').readFileSync(...)
require('path').resolve(...)
const pkg = require('./package.json')

// ✓ ALWAYS DO THIS
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pkg from './package.json' assert { type: 'json' };
// OR: const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
```

### Acceptance criteria / test scenarios
1. Run `.\run.ps1 -pf` — preflight shows `✓ vite.config.ts: no dynamic require() found (ESM-safe)`.
2. Run `.\run.ps1 -d` — build completes without `Dynamic require` errors.
3. Introduce a `require('fs')` in `vite.config.ts` — preflight shows `✗` and fails.

### Guardrails
- Preflight ESM scanner in `run.ps1` (active).
- This RCA document as a reference for AI and developer awareness.

### References
- `chrome-extension/vite.config.ts` — fixed file
- `run.ps1` — preflight ESM compatibility check
- `spec/17-app-issues/29-extension-build-resolves-wrong-dependency-context.md` — related build issue

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root cause and prevention rule documented
- [x] Anti-pattern reference included
- [x] Preflight guardrail implemented and documented
- [x] Iterations history included

---

*Issue #30 — Resolved 2026-03-02*
