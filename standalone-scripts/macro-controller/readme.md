# Marco — Standalone Macro Controller

**Author**: Marco Automation Team
**Version**: 7.41
**Status**: TypeScript migration in progress (Step 1 complete)

## What This Script Does

The MacroLoop Controller automates workspace and credit management on Lovable.dev.
It injects a floating UI panel into the browser that provides:

- **Loop automation**: Cycles through workspaces with configurable intervals
- **Credit monitoring**: Real-time credit balance tracking with visual bar
- **Prompt management**: Save, load, and inject prompts into the chat
- **Workspace navigation**: Automated project switching (up/down direction)
- **Diagnostic tools**: Logging, CSV export, clipboard copy

## Files

| File | Purpose |
|------|---------|
| `01-macro-looping.js` | Original JS source (reference, 9113 lines) |
| `src/macro-looping.ts` | TypeScript migration (Step 1: @ts-nocheck copy) |
| `src/index.ts` | Build entry point |
| `src/types.ts` | Extracted TypeScript interfaces |
| `02-macro-controller-config.json` | Default JSON config (XPaths, timing, element IDs) |
| `03-macro-prompts.json` | Prompt chains for macro automation |
| `04-macro-theme.json` | Theme configuration (dark/light presets) |
| `dist/macro-looping.js` | Compiled IIFE output (injected into browser) |

## Build

```bash
# From repository root
npm run build:macro
```

This compiles `src/` → `dist/macro-looping.js` (single IIFE bundle with inline source maps).

## How It's Used

- The **Chrome Extension** seeds the compiled `dist/macro-looping.js` into `chrome.storage.local`
- The injected script reads config from `window.__MARCO_CONFIG__` and theme from `window.__MARCO_THEME__`
- Communication with the extension uses the Content Script Bridge

## API — Namespace (v1.71.0+)

All public APIs live on the structured SDK namespace. Access via:

```
RiseupAsiaMacroExt.Projects.MacroController
```

### Console API (`api.loop`)

```js
const mc = RiseupAsiaMacroExt.Projects.MacroController.api;

mc.loop.start('up')        // Start macro loop (up direction)
mc.loop.start('down')      // Start macro loop (down direction)
mc.loop.stop()             // Stop loop
mc.loop.check()            // One-shot credit check
mc.loop.diagnostics()      // Diagnostic dump
mc.loop.setInterval(30000) // Set loop interval (ms)
mc.loop.isRunning()        // Check if loop is active
```

### Credits (`api.credits`)

```js
mc.credits.fetch()         // Fetch credit balance
mc.credits.getState()      // Get current credit state object
```

### Auth (`api.auth`)

```js
mc.auth.getToken()         // Get current bearer token
mc.auth.refreshToken(cb)   // Force token refresh with callback
mc.auth.verifySession()    // Verify session validity
```

### Workspace (`api.workspace`)

```js
mc.workspace.detect()            // Detect current workspace
mc.workspace.moveAdjacent('up')  // Navigate to adjacent workspace
mc.workspace.getCurrentName()    // Get current workspace name
mc.workspace.bulkRename(...)     // Bulk rename workspaces
```

### UI (`api.ui`)

```js
mc.ui.create()             // Create the floating panel
mc.ui.delete()             // Remove the floating panel
mc.ui.update()             // Refresh panel state
```

### Config (`api.config`)

```js
mc.config.exportBundle()   // Export config bundle (internal)
```

### Auto Attach (`api.autoAttach`)

```js
mc.autoAttach.run()        // Run auto-attach groups
```

### Metadata (`meta`)

```js
RiseupAsiaMacroExt.Projects.MacroController.meta.version       // e.g. "7.41"
RiseupAsiaMacroExt.Projects.MacroController.meta.displayName   // "Macro Controller"
```

### Singleton Class

```js
window.MacroController     // MacroController singleton (kept on window as a proper class name)
```

> **Note**: Legacy `window.__loop*` globals were removed in v1.71.0 (Issue 79, Phase 9D).
> See `spec/17-app-issues/79-migrate-window-globals-to-namespace.md` for migration details.

## TypeScript Migration

See [Migration Spec](../../spec/10-macro-controller/js-to-ts-migration/readme.md) for the full migration plan.

| Step | Description | Status |
|------|-------------|--------|
| 01 | Copy JS into single TS file | ✅ Complete |
| 02 | Split functions into individual files | 🟡 In Progress (3 modules extracted, IIFE-coupled functions deferred) |
| 03 | Extract UI logic into ui/ folder | ✅ Partially Complete (12 ui/ modules) |

## Related Specs

| Spec | Topic |
|------|-------|
| [40 — Macro Looping Reference](../../spec/11-chrome-extension/40-macro-looping-script-complete-reference.md) | Script internals |
| [42 — Data Bridge](../../spec/11-chrome-extension/42-user-script-logging-and-data-bridge.md) | `window.marco` SDK |
| [48 — TS Migration](../../spec/17-app-issues/48-typescript-migration-standalone-scripts.md) | Migration spec |
| [79 — Namespace Migration](../../spec/17-app-issues/79-migrate-window-globals-to-namespace.md) | `window.__*` → namespace |
| [80 — Auth Bridge Fix](../../spec/17-app-issues/80-auth-token-bridge-null-on-preview.md) | Token resolution hardening |
