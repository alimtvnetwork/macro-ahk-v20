# Step 03: UI Isolation Plan

**Status**: Planning
**Date**: 2026-03-21

## Problem

`createUI()` (lines 3726–7110, ~3,384 lines, 62 nested functions) is a monolithic closure. All functions share closure-scoped variables (`menuDropdown`, `menuBtnStyle`, `autoAttachRunning`, DOM element refs, etc.), making direct extraction impossible without a structural change.

## Proposed Strategy: Context Object Pattern

### Phase 1: Create UIContext type
```ts
interface UIContext {
  // DOM elements created in createUI
  panel: HTMLElement;
  menuDropdown: HTMLElement;
  menuBtn: HTMLElement;
  statusEl: HTMLElement;
  // Style strings
  menuBtnStyle: string;
  // State
  autoAttachRunning: boolean;
  forceMoveInFlight: boolean;
  // Callbacks to non-UI functions
  showToast: Function;
  log: Function;
  stopLoop: Function;
  startLoop: Function;
  // ... etc
}
```

### Phase 2: Extract sub-modules that accept UIContext
| Module | Functions | Lines |
|--------|-----------|-------|
| `ui/panel-layout.ts` | enableFloating, positionLoopController, startDragHandler, createResizeHandle, toggleMinimize, restorePanel | ~200 |
| `ui/prompts-ui.ts` | loadPromptsFromJson, getPromptsConfig, findPasteTarget, pasteIntoEditor, renderPromptsDropdown, openPromptCreationModal | ~600 |
| `ui/task-next-ui.ts` | loadTaskNextSettings, saveTaskNextSettings, runTaskNextLoop, openTaskNextSettingsModal | ~300 |
| `ui/settings-ui.ts` | showSettingsDialog, switchTab, makeField | ~250 |
| `ui/menu-helpers.ts` | createMenuItem, createMenuSep, createSubmenu | ~100 |
| `ui/auto-attach.ts` | resolveAutoAttachConfig, runAutoAttachGroup, clickByXPath, insertTextIntoElement | ~200 |
| `ui/save-prompt.ts` | htmlToMarkdown, onSavePromptClick, findSavePromptContainer, injectSavePromptButton | ~150 |
| `ui/sections.ts` | createCollapsibleSection, renderWsHistory, updateAuthDiagRow | ~400 |
| `ui/countdown.ts` | startCountdownTick, stopCountdownTick, updateStartStopBtn, resetCheckButtonState, doRunCheck | ~200 |

### Phase 3: Refactor createUI to orchestrate
`createUI()` becomes a thin orchestrator that:
1. Creates DOM elements
2. Builds `UIContext`
3. Calls extracted module functions with context

### Risks
- **Closure variable audit**: Must identify ALL shared variables before refactoring
- **Event listener cleanup**: Some functions register global listeners
- **Incremental approach**: Can extract one module at a time, testing build after each

### Estimated Effort
- Phase 1: Low (type definition only)
- Phase 2: Medium per module (~1 hour each, ~9 modules)
- Phase 3: Low (wiring)
- Total: ~10-12 iterations

---

*Step 03 plan — 2026-03-21*
