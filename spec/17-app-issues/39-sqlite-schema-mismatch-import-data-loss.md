# Issue 39: SQLite Schema Mismatch Causes Silent Import Data Loss

**Version**: v1.16.0
**Date**: 2026-03-15
**Status**: Resolved

---

## Issue Summary

### What happened

The Chrome extension's SQLite bundle used a `data` column in the `configs` table, while the `StoredConfig` TypeScript interface and web app SQLite bundle used a `json` column. This mismatch caused imported configs to be silently dropped — `readConfigsFromDb()` returned objects with `data` field but consumers expected `json`.

### Where it happened

- **Feature**: Import/Export SQLite Bundle
- **Files**: `chrome-extension/src/popup/popup-sqlite-bundle.ts`, `src/lib/sqlite-bundle.ts`
- **Functions**: `readConfigsFromDb()`, `insertConfigs()`

### Symptoms and impact

- User exports DB from web app, imports into extension → configs silently lost
- User exports DB from extension, imports into web app → configs silently lost
- No error messages — data appeared to import successfully but configs were empty

### How it was discovered

Code review during batch issue fix session.

---

## Root Cause Analysis

### Direct cause

Column name divergence: extension used `CREATE TABLE configs (id TEXT, projectId TEXT, data TEXT)` while web app used `json TEXT`. `readConfigsFromDb()` returned `row.data` but TypeScript type expected `row.json`.

### Contributing factors

1. No shared schema definition between extension and web app SQLite bundles
2. No runtime validation that imported records contain expected fields
3. JavaScript silently returns `undefined` for missing object properties

### Triggering conditions

Any cross-context import (extension ↔ web app) of SQLite bundles containing configs.

### Why the existing spec did not prevent it

No spec required schema consistency between the two SQLite bundle implementations.

---

## Fix Description

### What was changed

1. Extension `popup-sqlite-bundle.ts`: Changed `configs` table from `data TEXT` to `json TEXT`
2. Extension `readConfigsFromDb()`: Returns `json` field instead of `data`
3. Extension `insertConfigs()`: Inserts into `json` column
4. Web app `sqlite-bundle.ts`: Made `meta.value` column nullable to match extension

### The new rules or constraints added

> **RULE**: All SQLite bundle schemas MUST be identical between extension and web app. Column names must match TypeScript interfaces exactly.

### Why the fix resolves the root cause

Both codebases now use `json` column, matching the `StoredConfig` TypeScript interface. Data flows correctly in both import directions.

### Config changes or defaults affected

None.

### Logging or diagnostics required

None — fix is structural (schema alignment).

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: SQLite table schemas must be defined once and shared. Any schema change must be applied to ALL SQLite bundle implementations simultaneously.

### Acceptance criteria / test scenarios

1. Export DB from extension → import into web app → all configs present
2. Export DB from web app → import into extension → all configs present
3. `readConfigsFromDb()` returns objects with `json` field matching `StoredConfig` type

### Guardrails

- TypeScript interface `StoredConfig` uses `json` field — any mismatch will cause type errors if properly typed

### References to spec sections updated

- `chrome-extension/changelog.md` — v1.16.0 entry

---

## Done Checklist

- [x] Code fixed in both extension and web app SQLite bundles
- [x] Issue write-up created under `/spec/17-app-issues/`
- [x] Memory updated with summary and prevention rule
- [x] Version bumped to v1.16.0
