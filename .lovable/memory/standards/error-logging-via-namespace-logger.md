---
name: Error Logging via NamespaceLogger
description: All errors in macro-controller must use RiseupAsiaMacroExt.Logger.error(), never bare log() for errors. Every catch must log.
type: preference
---

## NamespaceLogger (T1 — Implemented)

- **File**: `standalone-scripts/marco-sdk/src/logger.ts`
- **Class**: `NamespaceLogger` — static methods: `error(fn, msg, error?)`, `warn(fn, msg)`, `info(fn, msg)`, `debug(fn, msg)`
- **Prefix**: `[RiseupAsia] [fnName] message`
- **error()** includes stack trace via `formatError()` when Error object provided
- **Exposed on**: `RiseupAsiaMacroExt.Logger` (set in SDK index.ts)
- **Wired in**: `marco-sdk/src/index.ts` — imported and assigned to namespace root

## Rules
- R1: Every `catch` block MUST log (use Logger.error for unexpected, Logger.warn for recoverable, Logger.debug for intentional fallbacks)
- R2: NEVER use `/* ignore */`, `/* silent */`, or empty catch bodies
- R5: Only error-level logs migrate to Logger; info/success/warn stay on `log()` for now

## Remaining Tasks
- T2: Update `globals.d.ts` with full namespace + Logger types
- T3: Fix 16 swallowed errors (S1–S16)
- T4: Eliminate `any` types (5 files)
- T5: Migrate controller `log(msg, 'error')` calls to `Logger.error()`
- T6: Build verification
