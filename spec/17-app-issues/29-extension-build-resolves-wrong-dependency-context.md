# Issue #29: Extension Build Resolves Wrong Dependency Context

**Version:** v1.0.0 toolchain
**Date:** 2026-03-02
**Status:** Resolved

---

## Issue Summary

### What happened
`./run.ps1 -f` repeatedly failed during `pnpm run build` with:
- `Cannot find package 'vite-plugin-static-copy'`
- then `Cannot find package 'esbuild' imported from vite/.../dep-*.js`

### Where it happened
- **Feature:** Extension build pipeline
- **Files:** `run.ps1`, `chrome-extension/vite.config.ts`
- **Functions:** `Configure-PnpmStore`, install/build command execution path

### Symptoms and impact
- Clean rebuild looked successful at install step, but runtime module resolution failed.
- Extension could not be built or deployed.

### How it was discovered
User run logs from repeated `./run.ps1 -f` executions.

---

## Root Cause Analysis

### Direct cause
`run.ps1` executed pnpm commands in a workspace-aware context, so installs were resolved to a parent dependency context (`../node_modules/.pnpm`) instead of the extension-local project context. Build then used a mismatched dependency graph and failed module resolution.

### Contributing factors
1. `pnpm config set --location=project` was executed outside the extension directory, which could apply project-level config in the wrong scope.
2. pnpm workspace behavior (recursive/workspace context) can install outside the intended package unless explicitly forced local (`--ignore-workspace`).
3. Earlier fixes adjusted symlink/copy behavior but did not enforce command scope to the extension package.

### Triggering conditions
- Running from a repo that contains multiple package roots / parent dependency tree.
- Force clean + reinstall (`-f`) followed by build.
- Node 24 + cross-drive setup increased fragility/noise, but was not the root cause.

### Why existing guardrails did not prevent it
The script validated package presence generally, but did not guarantee that install/build commands targeted the same package boundary (`chrome-extension/`).

---

## Fix Description

### What was changed
1. Added command normalization so pnpm commands are forced to local package mode:
   - `pnpm install ...` → `pnpm --ignore-workspace install ...`
   - `pnpm run build` → `pnpm --ignore-workspace run build`
2. Applied the same local-mode rule to build command execution (normal + watch mode).
3. Updated `Configure-PnpmStore` to execute inside `chrome-extension/` and use `--ignore-workspace`.
4. Kept pnpm v10 build-script allowance and force behavior compatible with new command form.

### Why this resolves the root cause
Install and build now run in the same explicit package scope, preventing parent/workspace dependency drift and ensuring extension-specific dependencies (including vite plugin chain + esbuild) resolve correctly.

### Logging/diagnostics
Preflight now prints the effective build command, making command scope visible (`--ignore-workspace`).

---

## Iterations History

**Iteration 1:** Cross-drive copy mode + symlink tuning (`symlink=false`).
- Result: Did not solve package-boundary mismatch.

**Iteration 2:** Cross-drive copy mode + `symlink=true`.
- Result: Reduced one class of linking issues but still failed with dependency-context mismatch.

**Iteration 3 (final):** Enforce pnpm local package mode with `--ignore-workspace` + scoped store config.
- Result: Addresses root cause.

---

## Prevention and Non-Regression

### Prevention rule
> **RULE:** For nested extension builds, all pnpm install/build/config commands must be executed with explicit local-package scope (`--ignore-workspace`) to avoid parent/workspace dependency resolution.

### Acceptance criteria / test scenarios
1. Run `./run.ps1 -f` and confirm step logs show:
   - `Running: pnpm --ignore-workspace run build`
2. Confirm `chrome-extension/node_modules` is created/populated after install.
3. Build completes without `ERR_MODULE_NOT_FOUND` for `vite-plugin-static-copy` or `esbuild`.
4. Run `./run.ps1 -pf` and verify effective install/build command output includes local package scoping.

### Guardrails
- Keep command normalization helper for pnpm commands in `run.ps1`.
- Keep store configuration scoped to `chrome-extension/`.

### References
- `run.ps1` — pnpm command normalization + scoped store config

---

## TODO and Follow-Ups

1. [ ] Optional hardening: add explicit post-install validation for `vite-plugin-static-copy` and `esbuild` in extension scope.
2. [ ] Optional hardening: print current effective working directory for install/build in verbose mode.

---

## Done Checklist

- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Root cause and prevention rule documented
- [x] Iterations history included
