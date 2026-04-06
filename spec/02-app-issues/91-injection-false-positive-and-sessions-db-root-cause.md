# 91 — Injection false-positive and Sessions DB root cause

## Summary

The extension logged `SCRIPT_INJECTED` even when the Macro Controller UI did not appear, while diagnostics also emitted repeated `no such table: Sessions` errors.

## Root cause

1. **Controller recovery namespace was broken**
   - UI recovery expects the controller singleton at `RiseupAsiaMacroExt.Projects.MacroController.api.mc`.
   - The active code no longer registered `__mc` / `api.mc`.
   - Result: when marker/globals existed but the panel DOM was missing, recovery silently failed.

2. **Startup recovery hooks were extracted but not wired into active bootstrap**
   - `setupPersistenceObserver`, `setupGlobalErrorHandlers`, and `setupDiagnosticDump` existed but were only re-exported.
   - Result: weaker post-injection recovery and missing visibility into panel-mount failures.

3. **Cross-database SQL referenced `Sessions` from the wrong database**
   - `Sessions` lives in `logs.db`, not `errors.db`.
   - Multiple code paths queried `Errors` using a `SELECT Id FROM Sessions...` subquery.
   - Result: repeated `MESSAGE-ROUTER_ERROR: no such table: Sessions`, which obscured the real injection issue.

## Fix applied

- Re-registered the `MacroController` singleton into `api.mc`.
- Rewired startup persistence/error/diagnostic hooks into bootstrap.
- Replaced bad cross-database `Sessions` subqueries with the current session ID from the logging subsystem.
- Bumped unified runtime/extension version to `2.95.0`.

## Expected outcome

- The Macro Controller can recover when the marker exists but the UI container is missing.
- The repeated `no such table: Sessions` logging noise is removed from these paths.
- Injection diagnostics now better reflect real post-injection state.