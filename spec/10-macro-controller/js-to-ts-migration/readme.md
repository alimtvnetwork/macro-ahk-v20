# MacroController JS → TS Migration

**Total Lines**: ~9,113
**Chunk Size**: ~500 lines per iteration
**Estimated Segments**: ~18

## Migration Steps

| Step | Description | Status |
|------|-------------|--------|
| 01 | Baseline: Copy JS into single TS file with @ts-nocheck | ✅ Complete |
| 02 | Function map + split plan (16 modules identified) | ✅ Complete |
| 02a | Dependency analysis — why direct extraction fails | ✅ Complete |
| 02b | Create shared-state.ts — extract constants + mutable state | ✅ Complete |
| 02c | Remove IIFE wrapper, convert to module-level code | ✅ Complete |
| 02d | Extract logging.ts (~500 lines, 20 functions) | ✅ Complete |
| 02e | Extract xpath-utils.ts (7 functions + ML_ELEMENTS) | ✅ Complete |
| 02f | Extract config-and-theme.ts (already in shared-state; XPath updaters → xpath-utils) | ✅ Complete |
| 02g | Extract auth.ts (10 functions, token resolution chain) | ✅ Complete |
| 02h | Extract credit-api.ts (5 calc helpers + credit bar renderer) | ✅ Complete |
| 02i | Extract workspace-detection.ts (10 functions, ~400 lines) | ✅ Complete |
| 02j | Extract toast.ts + invalidateSessionBridgeKey→auth.ts | ✅ Complete |
| 03a | Extract ui/panel-layout.ts (drag, resize, minimize, floating) | ✅ Complete |
| 03b | Extract ui/menu-helpers.ts (createMenuItem, createMenuSep, createSubmenu) | ✅ Complete |
| 03c | Extract ui/countdown.ts (startCountdownTick, stopCountdownTick, updateStartStopBtn) | ✅ Complete |
| 03d | Extract ui/prompt-utils.ts (normalizePromptEntries, parseWithRecovery, pasteIntoEditor, showPasteToast) | ✅ Complete |
| 03e | Extract ui/task-next-ui.ts (runTaskNextLoop, openTaskNextSettingsModal, settings) | ✅ Complete |
| 03f | Extract ui/auto-attach.ts (resolveAutoAttachConfig, clickByXPath, insertTextIntoElement, runAutoAttachGroup) | ✅ Complete |
| 03g | Extract ui/save-prompt.ts (htmlToMarkdown, onSavePromptClick, injectSavePromptButton) | ✅ Complete |
| 03h | Extract ui/sections.ts (createCollapsibleSection, createWsHistorySection, createAuthDiagRow) | ✅ Complete |
| 03i | Extract ui/settings-ui.ts (showSettingsDialog, makeField, switchTab) | ✅ Complete |
| 03 | Extract UI logic into ui/ folder | ✅ Complete |
| 04a | Remove @ts-nocheck from 9 extracted UI modules | ✅ Complete |
| 04b | Remove @ts-nocheck from 7 core modules + globals.d.ts | ✅ Complete |
| 04c | Remove @ts-nocheck from macro-looping.ts (main controller) | ✅ Complete — 0 tsc errors |
| 05a | Create controller-registry.ts (late-binding function registry) | ✅ Complete |
| 05b | Extract workspace-rename.ts (~318 lines) using registry pattern | ✅ Complete |

## Folder Structure

```
standalone-scripts/macro-controller/
├── src/
│   ├── index.ts              ← Entry point (imports macro-looping.ts)
│   ├── macro-looping.ts      ← Full controller (Step 1: @ts-nocheck)
│   └── types.ts              ← Extracted type definitions
├── dist/
│   └── macro-looping.js      ← Compiled IIFE output
├── 01-macro-looping.js       ← Original JS (kept as reference)
├── 02-macro-controller-config.json
├── 03-macro-prompts.json
└── readme.md
```

## Build

```bash
npm run build:macro
```

This runs `tsc --noEmit` (type check) then `vite build` (IIFE bundle).

## Documentation

Each step has a markdown file in this folder documenting:
- Original JS code
- Converted TS code
- Confidence level (High/Medium/Low)
- Risk areas
- Potential failure points
- Fix strategy

---

*Migration tracker — 2026-03-21*
