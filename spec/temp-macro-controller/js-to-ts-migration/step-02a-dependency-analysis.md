# Step 02a — Dependency Analysis: Why Direct Extraction Fails

**Version**: 1.0.0
**Date**: 2026-03-21
**Status**: Complete (Analysis)

---

## Finding

The entire macro controller is wrapped in a single IIFE:

```js
(function() {
  'use strict';
  // ... 9,100 lines of shared closure scope ...
})();
```

**All ~120 functions share closure-scoped variables.** You cannot extract `logging.ts` as a separate ES module because it references ~20 variables declared in the IIFE:

### Logging Dependencies (lines 430–836)

| Variable | Declared At | Type |
|----------|-------------|------|
| `VERSION` | Line 11 | Constant |
| `LOG_STORAGE_KEY` | Line 330 | Constant |
| `LOG_MAX_ENTRIES` | Line 333 | Constant |
| `activityLogLines` | Line 324 | Mutable array |
| `activityLogVisible` | Line 323 | Mutable boolean |
| `maxActivityLines` | Line 325 | Constant |
| `_logRenderedCount` | Line 713 | Mutable number |
| `safeSetItem()` | Line 342 | Function |
| `getLogStorageKey()` | Line 423 | Function |
| `cLogDefault` | Line 118 | Theme color |
| `cLogError` | Line 119 | Theme color |
| `cLogInfo` | Line 120 | Theme color |
| `cLogSuccess` | Line 121 | Theme color |
| `cLogDebug` | Line 122 | Theme color |
| `cLogWarn` | Line 123 | Theme color |
| `cLogDelegate` | Line 124 | Theme color |
| `cLogCheck` | Line 125 | Theme color |
| `cLogSkip` | Line 126 | Theme color |
| `cLogTimestamp` | Line 127 | Theme color |
| `tFont` | Line 130 | Typography |
| `tFontSm` | Line 132 | Typography |

## Confidence Level

**High** — This is a structural constraint, not a code quality issue.

## Revised Strategy

The IIFE must be unwrapped first. New step order:

1. **Step 2a** ✅: Analyze dependencies (this document)
2. **Step 2b**: Create `shared-state.ts` — extract all shared mutable state + constants into an exported object
3. **Step 2c**: Remove IIFE wrapper, convert to module-level code
4. **Step 2d**: Extract `logging.ts` (now possible — imports from `shared-state.ts`)
5. **Step 2e+**: Continue extracting remaining modules

## Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| IIFE removal changes scoping | **High** | Vite IIFE format re-wraps at build time |
| Shared mutable state race conditions | **Low** | Single-threaded execution model |
| Global API (`window.__loopStart`) breakage | **Medium** | Keep global assignments in `bootstrap.ts` |

## Fix Strategy If Failure Occurs

1. Revert to `@ts-nocheck` single-file version (always available as `01-macro-looping.js`)
2. Use `?raw` import in extension seeder as fallback
3. Compare `dist/macro-looping.js` output against known-good original

---

*Dependency analysis v1.0.0 — 2026-03-21*
