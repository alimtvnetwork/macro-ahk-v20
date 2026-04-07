# Issue 48: TypeScript-First Standalone Scripts Build Pipeline

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: Fixed (macro-controller fully migrated to TypeScript in standalone-scripts/macro-controller/src/)

---

## Issue Summary

### What happened

Standalone scripts (`01-macro-looping.js`) are written in plain JavaScript with machine-oriented variable names, making them difficult to read, maintain, and debug.

### Symptoms and impact

- Poor readability: short, cryptic variable names.
- No type safety: runtime errors from type mismatches.
- No IDE support: no autocomplete, refactoring, or error highlighting.

---

## Fix Description

### What should change

1. **Rewrite in TypeScript**: Convert `01-macro-looping.js` to TypeScript source files.
2. **Build pipeline**: Add a Vite/esbuild config that compiles TS → single JS bundle for injection.
3. **Coding standards**:
   - `PascalCase` for constants (e.g., `MaxRetries`, `DefaultTimeout`).
   - Descriptive variable names (e.g., `workspaceList` not `perWs`, `creditBalance` not `cr`).
   - JSDoc comments on all public functions.
4. **Output**: Compiled JS placed in `standalone-scripts/macro-controller/dist/` for the extension seeder to consume.

### Migration approach

- Phase 1: Extract types/interfaces for state, config, theme, prompts.
- Phase 2: Convert core logic modules (token resolution, API calls, UI builders).
- Phase 3: Convert main orchestrator and entry point.
- Phase 4: Remove original JS file, update seeder paths.

---

## Acceptance Criteria

1. TypeScript source compiles to a single injectable JS file.
2. All constants use PascalCase.
3. All variables have descriptive, human-readable names.
4. No `any` types except where unavoidable (DOM APIs).
5. Existing functionality is preserved 1:1.

---

*TypeScript migration spec v1.48.0 — 2026-03-20*
