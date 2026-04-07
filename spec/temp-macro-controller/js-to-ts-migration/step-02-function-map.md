# Step 02 — Function Map & Split Plan

**Version**: 1.0.0
**Date**: 2026-03-21
**Status**: In Progress

---

## Function Map (macro-looping.ts — 9,122 lines)

### Proposed Modules (~500 lines each)

| Module | Lines | Functions | Description |
|--------|-------|-----------|-------------|
| **config-and-theme.ts** | 1–340 | `resolvePreset`, theme vars, config parsing | Config reader + theme resolver |
| **state-and-constants.ts** | 341–430 | `safeSetItem`, `getProjectIdFromUrl`, state object | Global state + storage helpers |
| **logging.ts** | 430–850 | `log`, `logSub`, `persistLog`, `getAllLogs`, `formatLogsForExport`, `copyLogsToClipboard`, `downloadLogs`, activity log UI | Logging system |
| **auth-token.ts** | 850–1080 | `getBearerTokenFromSessionBridge`, `extractTokenFromAuthBridgeResponse`, `requestTokenFromExtension`, `refreshBearerTokenFromBestSource`, `getBearerTokenFromCookie`, `resolveToken` | Token resolution chain |
| **credits.ts** | 1080–1420 | `calcTotalCredits`, `calcAvailableCredits`, `renderCreditBar`, `parseLoopApiResponse`, `fetchLoopCredits`, `fetchLoopCreditsAsync` | Credit calculation + API |
| **workspace-detection.ts** | 1420–1830 | `autoDetectLoopCurrentWorkspace`, `detectWorkspaceViaProjectDialog`, `findProjectButtonWithRetry`, `pollForWorkspaceName`, `findWorkspaceNameViaCss`, `closeProjectDialogSafe` | Workspace detection strategies |
| **workspace-ops.ts** | 1830–2400 | `moveToWorkspace`, `renameWorkspace`, `bulkRenameWorkspaces`, `undoLastRename`, `updateUndoBtnVisibility` | Workspace move/rename operations |
| **workspace-ui.ts** | 2400–3400 | `handleWsCheckboxClick`, `updateWsSelectionUI`, `showWsContextMenu`, workspace rendering, sorting, filtering | Workspace list UI |
| **loop-engine.ts** | 3400–4500 | `startLoop`, `stopLoop`, `runCycle`, combo switch logic, project button interaction | Core loop engine |
| **xpath-utils.ts** | 4500–5100 | `XPathUtils`, `findByXPath`, `clickByXPath`, `fireAll` | XPath utility module |
| **js-executor.ts** | 5100–5500 | `navigateLoopJsHistory`, `executeJs`, `showAboutModal`, `destroyPanel` | JS executor + about modal |
| **ui-panel.ts** | 5500–6600 | `createUI` (first half): panel layout, floating, resize, minimize, check button, countdown | Panel creation + core controls |
| **prompts-ui.ts** | 6600–7300 | `renderPromptsDropdown`, `loadPromptsFromJson`, `pasteIntoEditor`, `findPasteTarget`, task-next system | Prompts dropdown + paste logic |
| **prompt-creation.ts** | 7300–7900 | `openPromptCreationModal`, `sendToExtension`, menu items, save prompt injection | Prompt creation + save button |
| **settings-ui.ts** | 7900–8900 | `createCollapsibleSection`, `renderWsHistory`, `updateAuthDiagRow`, `showSettingsDialog` | Settings dialog + collapsible sections |
| **bootstrap.ts** | 8900–9122 | `loadWorkspacesOnStartup`, `tryReinject`, keyboard shortcuts, global API binding | Initialization + keyboard shortcuts |

**Total**: 16 modules, ~570 lines average

---

## Confidence Assessment

| Aspect | Level | Notes |
|--------|-------|-------|
| Module boundaries | **High** | Aligned with existing section separators |
| Variable dependencies | **Medium** | Many shared variables (state, theme colors, config) — need careful extraction |
| Function interdependencies | **Medium** | Some cross-module calls (e.g., `log()` used everywhere) |
| Build correctness | **High** | IIFE wrapping handles scope isolation |

## Risk Areas

1. **Shared mutable state**: `state`, `loopCreditState`, theme color variables are accessed by nearly all modules
2. **Closure scope**: Many inner functions inside `createUI()` reference outer scope variables
3. **Event listeners**: Registered across modules, cleanup must be coordinated

## Extraction Strategy

1. Start with **leaf modules** (no dependencies on other custom code): `logging.ts`, `xpath-utils.ts`
2. Then extract **data modules**: `config-and-theme.ts`, `state-and-constants.ts`
3. Then **business logic**: `auth-token.ts`, `credits.ts`, `workspace-detection.ts`
4. Finally **UI modules**: These are tightly coupled inside `createUI()` — extract last

---

*Function map v1.0.0 — 2026-03-21*
