# Step 01 — Baseline Migration: JS → Single TS File

**Version**: 1.0.0
**Date**: 2026-03-21
**Status**: Complete

---

## Summary

Copy the entire `01-macro-looping.js` (9,113 lines, v7.38) into a single TypeScript file
(`src/macro-looping.ts`) with `@ts-nocheck` to establish the build pipeline without breaking anything.

## Original Code

- **File**: `standalone-scripts/macro-controller/01-macro-looping.js`
- **Lines**: 9,113
- **Format**: Single IIFE, plain JavaScript
- **Version**: 7.38

## Converted Code

- **File**: `standalone-scripts/macro-controller/src/macro-looping.ts`
- **Lines**: 9,122 (9 header lines added)
- **Changes**: `@ts-nocheck` + `eslint-disable` header prepended, zero logic changes

## Confidence Level

**High** — No logic was modified. The `@ts-nocheck` directive suppresses all type errors,
making this a 1:1 copy that compiles identically to the original JS.

## Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| IIFE not bundled correctly | Low | Vite IIFE format tested in prior scaffold |
| Import side-effect ordering | Low | Single file, no imports to reorder |
| Source map accuracy | Low | Inline source maps enabled |

## Potential Failure Points

1. **Vite IIFE wrapping**: The file is already an IIFE. Vite may double-wrap it.
   - **Fix**: Check dist output for double `(function(){...})()` nesting
2. **`@ts-nocheck` scope**: Applies to entire file, so no type errors surface yet.
   - **Fix**: This is intentional for Step 1. Types are added incrementally in Step 2+.

## Fix Strategy If Failure Occurs

1. Compare `dist/macro-looping.js` byte-for-byte with `01-macro-looping.js`
2. If double-wrapped, change entry point to import the raw JS with `?raw` and eval
3. If runtime errors, diff the dist output against the known-good original

## What's Next

- **Step 02**: Remove `@ts-nocheck`, split functions into individual files (~500 lines each)
- **Step 03**: Extract UI/DOM logic into `src/ui/` folder

---

*Migration spec v1.0.0 — 2026-03-21*
