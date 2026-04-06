# Phase 5: Module Splitting

**Status**: In Progress
**Started**: 2026-03-28

## Goal

Split all monolithic files (>200 lines) in `standalone-scripts/macro-controller/src/` into focused sub-modules following the [200-line file limit](../../../spec/08-coding-guidelines/chrome-extension-guidelines/05-file-organization.md) (Rule ORG1). Each extraction uses a barrel re-export in the original file to preserve backward compatibility.

---

## Completed

### Phase 5A — ws-selection-ui.ts (909 → 4 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `ws-checkbox-handler.ts` | 160 | `handleWsCheckboxClick`, `updateWsSelectionUI`, `triggerLoopMoveFromSelection`, `setLoopWsNavIndex` |
| `ws-context-menu.ts` | 142 | `showWsContextMenu`, `removeWsContextMenu`, `startInlineRename` |
| `ws-list-renderer.ts` | 372 | `renderLoopWorkspaceList`, `populateLoopWorkspaceDropdown`, `buildLoopTooltipText`, compact/free-only state |
| `ui/bulk-rename.ts` | 451 | `renderBulkRenameDialog`, `removeBulkRenameDialog`, DOM builder helpers |
| `ws-selection-ui.ts` | 41 | Barrel re-export |

### Phase 5B — auth.ts (740 → 3 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `auth-resolve.ts` | 340 | Token utils (normalize, validate, extract), session bridge, Supabase scan, cookie reading, `resolveToken()`, persistence, badge, `markBearerTokenExpired`, `invalidateSessionBridgeKey` |
| `auth-bridge.ts` | 395 | Extension bridge communication, relay health check, bridge outcome tracking, `AuthDebugSnapshot`, `extractTokenFromAuthBridgeResponse` |
| `auth-recovery.ts` | 236 | `recoverAuthOnce()` with concurrency lock (RCA-4), `refreshBearerTokenFromBestSource()` waterfall, `RefreshTokenOptions` |
| `auth.ts` | 44 | Barrel re-export |

---

### Phase 5C — loop-engine.ts (836 → 3 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `loop-controls.ts` | 435 | `startLoop`, `stopLoop`, `runCheck`, interval management, idle detection, status refresh timers |
| `loop-cycle.ts` | 292 | `runCycle`, API-based iteration, auth recovery cycles, double-confirm credit check |
| `loop-dom-fallback.ts` | 128 | `runCycleDomFallback`, `performDirectMove`, `forceSwitch`, deprecated AHK delegation signals |
| `loop-engine.ts` | 11 | Barrel re-export |

### Phase 5D — ui/prompt-manager.ts (884 → 3 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `ui/prompt-loader.ts` | 312 | `DEFAULT_PROMPTS`, `loadPromptsFromJson`, `getPromptsConfig`, `sendToExtension`, cache invalidation |
| `ui/prompt-dropdown.ts` | 305 | `renderPromptsDropdown`, category filtering, Task Next submenu, prompt item actions |
| `ui/prompt-injection.ts` | 302 | `openPromptCreationModal`, file drag-and-drop, variable template support |
| `ui/prompt-manager.ts` | 24 | Barrel re-export |

## Planned

### Phase 5E — types.ts (710 → 4 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `types/config-types.ts` | 422 | All config interfaces (MacroControllerConfig tree), theme types (MacroThemeRoot tree), enums (LoopDirection), TimingConfig, XPathConfig, ElementIds, ControllerState |
| `types/credit-types.ts` | 93 | `CreditSource`, `WorkspaceCredit`, `LoopCreditState`, `CreditInfo`, `WorkspaceInfo`, `ProjectInfo`, `MarkViewedResponse`, `DiagnosticDump` |
| `types/workspace-types.ts` | 49 | `BulkRenameEntry`, `RenameStrategy`, `BulkRenameResults`, `RenameHistoryEntry`, `UndoRenameResults`, `WorkspaceMatchCandidate`, `ExtensionResponse` |
| `types/ui-types.ts` | 139 | `PromptEntry`, `PromptsCfg`, `ResolvedPromptsConfig`, `HTMLElementWithHandlers`, `DraggableElement`, `ToastEntry`, `ActivityLogEntry`, `PersistedLogEntry`, `CollapsibleSectionOpts`, `AutoAttachGroupRuntime`, `ExtensionCallbackResponse`, `RefreshOutcome`, Window augmentation |
| `types/index.ts` | 12 | Barrel re-export |

### Phase 5F — ui/panel-builder.ts (741 → 3 modules + orchestrator)

| File | Lines | Contents |
|------|-------|----------|
| `ui/panel-header.ts` | 237 | `buildTitleRow`, workspace name badge, auth badge, minimize/close buttons, drag handlers |
| `ui/panel-controls.ts` | 319 | `buildButtonRow`, start/stop toggle, credits button, prompts dropdown, `isTokenExpired`, `focusCurrentWorkspaceInList` |
| `ui/panel-sections.ts` | 263 | `buildStatusBar`, `buildToolsMasterSection`, `createRecordIndicator`, `injectKeyframeStyles`, tools/logs collapsible, settings gear, hot-reload |
| `ui/panel-builder.ts` | 168 | Orchestrator: `PanelBuilderDeps`, `createUI` composing sub-modules |

---

## Execution Order

| Phase | File | Priority | Rationale |
|-------|------|----------|-----------|
| 5A | `ws-selection-ui.ts` | ✅ Done | Self-contained, few deps |
| 5B | `auth.ts` | ✅ Done | Clean tier boundaries |
| 5C | `loop-engine.ts` | ✅ Done | Core business logic, high value |
| 5D | `ui/prompt-manager.ts` | ✅ Done | Large but well-bounded |
| 5E | `types.ts` | ✅ Done | Type-only, zero runtime risk |
| 5F | `ui/panel-builder.ts` | ✅ Done | Most coupling, highest risk |

---

## Constraints

1. **Barrel re-export pattern**: Every split file's original path becomes a barrel that re-exports all public symbols. No consumer imports change.
2. **No `any` or `Record<string, any>`**: All new files follow [TypeScript standards](../../../.lovable/memory/standards/macro-controller-typescript-standards.md).
3. **Error handling via `toErrorMessage()`**: All catch blocks use the centralized helper.
4. **Build verification**: Each phase must pass `tsc --noEmit -p tsconfig.macro.json` and `npm run build` before merge.
5. **Test preservation**: Pre-existing test results must not regress (new failures are tracked separately).

---

## Post-Phase 5 Splits

### credit-fetch.ts (436 → 2 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `credit-parser.ts` | 170 | `parseLoopApiResponse`, `syncCreditStateFromApi`, `resolveWsTier`, `WsTier`, `WS_TIER_LABELS` |
| `credit-fetch.ts` | 280 | `fetchLoopCredits`, `fetchLoopCreditsAsync`, auth failure helpers, barrel re-exports |

### workspace-detection.ts (627 → 3 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `ws-name-matching.ts` | 153 | `normalizeWorkspaceName`, `matchWorkspaceByName`, `collectWorkspaceNameCandidatesFromNode`, candidate expansion helpers |
| `ws-dialog-detection.ts` | 305 | `detectWorkspaceViaProjectDialog`, `closeProjectDialogSafe`, dialog polling, CSS fallback, `detectWorkspaceFromDom` |
| `workspace-detection.ts` | 209 | `extractProjectIdFromUrl`, `autoDetectLoopCurrentWorkspace` (Tier 1 API), barrel re-exports |

### workspace-management.ts (427 → 2 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `ws-move.ts` | 210 | `moveToWorkspace`, `updateLoopMoveStatus`, `verifyWorkspaceSessionAfterFailure` |
| `ws-adjacent.ts` | 225 | `moveToAdjacentWorkspace`, `moveToAdjacentWorkspaceCached` |
| `workspace-management.ts` | 10 | Barrel re-export |

### Phase 5J — ui/database-modal.ts (763 → 3 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/database-modal-styles.ts` | 297 | `injectDatabaseStyles`, scoped CSS for modal |
| `ui/database-modal-data.ts` | 648 | `loadTables`, `loadTableData`, filter bar, pagination, data table rendering |
| `ui/database-modal.ts` | 205 | `showDatabaseModal` orchestrator, tab wiring, sidebar/content builders |

> **Note**: `database-modal-data.ts` (648 lines) remains a future split candidate.

### Phase 5K — ui/database-schema-tab.ts (672 → 4 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/database-schema-helpers.ts` | 51 | `el`, `escHtml`, `showMsg` shared DOM utilities |
| `ui/database-schema-styles.ts` | 119 | `injectSchemaStyles`, scoped CSS |
| `ui/database-schema-editors.ts` | 370 | Validation panel, FK panel, validation tester, types (`ColumnValidation`, `ForeignKeyDef`, `ColumnEntry`) |
| `ui/database-schema-tab.ts` | 469 | `buildSchemaTab` orchestrator, create handler, table list, column rendering |

### Phase 5L — ui/sections.ts (638 → 5 modules + barrel)

| File | Lines | Contents |
|------|-------|----------|
| `ui/section-collapsible.ts` | 87 | `createCollapsibleSection`, localStorage persistence |
| `ui/section-ws-history.ts` | 86 | `createWsHistorySection`, workspace navigation history panel |
| `ui/auth-jwt-utils.ts` | 106 | `decodeJwtPayload`, `formatRemaining`, `recordRefreshOutcome` |
| `ui/section-auth-diag.ts` | 578 | `createAuthDiagRow`, diagnostic rows, waterfall, clipboard copy |
| `ui/sections.ts` | 17 | Barrel re-export |

> **Note**: `section-auth-diag.ts` (578 lines) remains a future split candidate.

### Phase 5M — ui/save-prompt.ts (611 → 5 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/save-prompt-html-converter.ts` | 97 | `htmlToMarkdown`, tag converter map |
| `ui/save-prompt-task-next.ts` | 161 | Task Next hover submenu (presets, custom count, settings) |
| `ui/save-prompt-prompt-list.ts` | 258 | Search, category chips, filtering, prompt item rendering |
| `ui/save-prompt-dropdown.ts` | 152 | Dropdown orchestrator (create, position, header, render flow) |
| `ui/save-prompt.ts` | 250 | `onSavePromptClick`, `findSavePromptContainer`, `injectSavePromptButton`, toolbar constants |

### Phase 5N — workspace-rename.ts (568 → 4 modules)

| File | Lines | Contents |
|------|-------|----------|
| `rename-forbidden-cache.ts` | 75 | GroupedKv forbidden workspace cache |
| `rename-template.ts` | 72 | Numbering template engine ($$$, ###, ***) |
| `rename-api.ts` | 282 | Single rename PUT with auth/rate/limit fallbacks |
| `rename-bulk.ts` | 305 | Bulk rename, undo, history, delay, ETA, circuit breaker |
| `workspace-rename.ts` | 37 | Barrel re-export |

> **Note**: `rename-api.ts` (282) and `rename-bulk.ts` (305) are within tolerance but could be split further if needed.

### Phase 5O — ui/section-auth-diag.ts (578 → 4 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/auth-diag-rows.ts` | 265 | Row builder, update functions (cookie, bridge, JWT, source, refresh, ws-cache), buttons |
| `ui/auth-diag-waterfall.ts` | 176 | Startup waterfall bar chart, skeletons, clipboard export |
| `ui/auth-diag-clipboard.ts` | 71 | Copy button, header badge, diagnostic text builder |
| `ui/section-auth-diag.ts` | 124 | Orchestrator: createAuthDiagRow, interfaces, re-exports |

### Phase 5P — startup.ts (530 → 4 modules)

| File | Lines | Contents |
|------|-------|----------|
| `startup-token-gate.ts` | 93 | `ensureTokenReady` polling gate with extension bridge refresh |
| `startup-persistence.ts` | 74 | SPA persistence observer (MutationObserver + visibilitychange) |
| `startup-global-handlers.ts` | 85 | Global error/rejection handlers + diagnostic dump API |
| `startup.ts` | 354 | Bootstrap orchestrator, workspace loading, auth resync |

> **Note**: `startup.ts` (354) is within tolerance — single cohesive bootstrap flow with closures.

### Phase 5Q — ui/database-json-tab.ts (524 → 4 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/database-json-types.ts` | 67 | Types (JsonColumnDef, JsonTableDef, JsonMigration, JsonSchema) + SAMPLE_SCHEMA |
| `ui/database-json-migrate.ts` | 238 | validateSchema, applySchema, applyMigration |
| `ui/database-json-docs.ts` | 87 | downloadSchemaDocs (markdown reference generator) |
| `ui/database-json-tab.ts` | 152 | Orchestrator: styles, buildJsonTab, appendLog helper |

### Phase 5R — ui/database-modal-data.ts (648 → 3 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/database-data-filter.ts` | 211 | Filter bar: column/mode/case selects, search button, active badge |
| `ui/database-data-table.ts` | 141 | Table rendering (header/body/cells), pagination, escapeHtml/truncate |
| `ui/database-modal-data.ts` | 342 | Orchestrator: loadTables, loadTableData, renderDataTable, filter state |

> **Note**: `database-modal-data.ts` (342) is within tolerance — cohesive data loading orchestration.

### Phase 5S — logging.ts (468 → 3 modules)

| File | Lines | Contents |
|------|-------|----------|
| `log-csv-export.ts` | 146 | CSV header/row builder, workspace CSV export (all + available) |
| `log-activity-ui.ts` | 93 | Activity log UI: addActivityLog, updateActivityLogUI, toggleActivityLog |
| `logging.ts` | 257 | Orchestrator: safeSetItem, URL helpers, persistence, log/logSub, re-exports |

### Phase 5T — ui/settings-ui.ts (461 → 2 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/settings-tab-panels.ts` | 288 | Panel builders: XPaths, Timing, Task Next, Logging, Config DB, General |
| `ui/settings-ui.ts` | 278 | Orchestrator: dialog shell, tab bar, makeField, save/reset footer |

---

### Phase 5U — ui/bulk-rename.ts (451 → 2 modules)

| File | Lines | Contents |
|------|-------|----------|
| `ui/bulk-rename-fields.ts` | 141 | Input row, template row, start number, token row, formatEta |
| `ui/bulk-rename.ts` | 348 | Dialog orchestrator: panel, drag, preview, apply/stop, ETA |

> **Note**: `bulk-rename.ts` (348) is within tolerance — single cohesive dialog with tightly coupled closure state.

---

## Remaining Large Files (>400 lines)

| File | Lines | Priority | Status |
|------|-------|----------|--------|
| `shared-state.ts` | 472→354 | ✅ | Split → `shared-state-runtime.ts` (163) |
| `loop-controls.ts` | 512→308 | ✅ | Split → `loop-check.ts` (194) |
| `ui/ui-updaters.ts` | 468→189 | ✅ | Split → `ui/ui-status-renderer.ts` (270) |
| `ui/database-schema-tab.ts` | 469 | 🟡 | Future split candidate |
| `types/config-types.ts` | 436 | 🟡 | Acceptable — type-only file |

---

*Phase 5 spec — 2026-03-28, updated 2026-03-29*
