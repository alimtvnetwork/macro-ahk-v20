# Memory: development/issue-post-mortems

**Last Updated**: 2026-03-16

Post-mortems for critical bugs, stored as issue write-ups in `spec/17-app-issues/`.

## Documented Post-Mortems

### Issue #36 — Bearer Token Removal Broke Credit Bar
- **Root cause**: HttpOnly cookie restrictions broke credit display during session-bridge auth transition
- **Prevention**: Always verify downstream UI consumers when changing auth transport

### Issue #38 — Progress Bar Relative Scaling
- **Root cause**: UI bars not proportional to highest-capacity workspace
- **Prevention**: Scale all progress bars relative to `max(totalCredits)` across workspaces

### Issue #39 — SQLite Schema Mismatch Import Data Loss
- **Root cause**: configs table `data` vs `json` column name mismatch caused silent import drop
- **Prevention**: Schema column names must match between export and import code paths

### Issue #40 — Auto-Injector ResolutionResult Type Mismatch
- **Root cause**: `resolveScriptBindings()` return type changed from flat array to `{ resolved, skipped }` but `auto-injector.ts` call site was not updated, causing silent injection failure on every page navigation
- **Prevention**: When changing a shared function's return type, grep all call sites and update them in the same commit
- **Tests fixed**: `script-resolver.test.ts`, `injection-pipeline-integration.test.ts`, `default-project-seeder.test.ts`

### Issue #41 — React UI Unification: `vite.config.extension.ts` Options Entry Path
- **Root cause**: After porting the Options page to React (`src/options/`), the `vite.config.extension.ts` entry and `copyManifest()` plugin still referenced the legacy `chrome-extension/src/options/options.html` path
- **Iteration**: Initially created the React options page (Step 8) without updating the build config entry point
- **Solution**: Updated `vite.config.extension.ts` rollup input to `resolve(__dirname, "src/options/options.html")` and manifest rewrite to `"src/options/options.html"`
- **Learning**: When migrating a page from legacy to React, the build config entry point and manifest path must be updated in the **same step** as the page creation
- **Prevention**: Any new MPA entry point must include: (1) HTML file, (2) Vite rollup input entry, (3) manifest path rewrite — all verified together

### Issue #42 — False-Positive Hook Violation with `use` Prefix
- **Root cause**: Utility functions with `use` prefix (e.g., `useCachedConfig`) triggered ESLint `rules-of-hooks` violations in background (non-React) code
- **Prevention**: Non-hook utility functions MUST NOT use the `use` prefix. Rename to `getCachedConfig`, `fetchCachedConfig`, etc.

### Issue #43 — Background Migration: tsconfig Preview Build Errors
- **Root cause**: Moving 56 background files from `chrome-extension/src/background/` to `src/background/` caused them to be included in `tsconfig.app.json` (`include: ["src"]`). These files use full `chrome.*` APIs (`webNavigation`, `contextMenus`, `scripting`, `cookies`, etc.) that require `@types/chrome`, which is only installed in `chrome-extension/node_modules/`
- **Iteration**: Discovered immediately after moving files — 80+ TypeScript errors for missing chrome API types
- **Solution**: Added `"exclude": ["src/background"]` to `tsconfig.app.json`
- **Learning**: When migrating browser-API-dependent code into a shared `src/` tree, the preview tsconfig must explicitly exclude those directories to prevent type errors from missing ambient type packages
- **Prevention**: Before moving chrome-extension-specific code to `src/`, check if the target tsconfig has the required type definitions. If not, add an exclude rule.

### Issue #44 — Legacy Deletion: Old Vite Config Still Referenced Deleted Files
- **Root cause**: After deleting `chrome-extension/src/popup/` and `chrome-extension/src/options/`, the `chrome-extension/vite.config.ts` still had rollup input entries pointing to the deleted HTML files
- **Solution**: Updated `chrome-extension/vite.config.ts` popup and options entries to point to the React HTML files at `resolve(__dirname, '..', 'src/popup/popup.html')` and `resolve(__dirname, '..', 'src/options/options.html')`
- **Learning**: When deleting legacy files, always check ALL build configs (not just the primary one) for references
- **Prevention**: Before deleting any build entry point file, grep all `vite.config.*` files for references and update them in the same step