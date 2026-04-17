/**
 * MacroLoop Controller — Workspace Selection UI (barrel re-export)
 * Phase 5A: Split into focused sub-modules:
 *   - ws-checkbox-handler.ts  (checkbox, selection, nav)
 *   - ws-context-menu.ts      (right-click menu, inline rename)
 *   - ws-list-renderer.ts     (list render, dropdown populator)
 *   - ui/bulk-rename.ts       (bulk rename dialog)
 *
 * This barrel preserves backward compatibility for all existing imports.
 */

export {
  handleWsCheckboxClick,
  updateWsSelectionUI,
  triggerLoopMoveFromSelection,
  setLoopWsNavIndex,
  getLoopWsNavIndex,
} from './ws-checkbox-handler';

export {
  showWsContextMenu,
  removeWsContextMenu,
  startInlineRename,
} from './ws-context-menu';

export {
  getLoopWsCompactMode,
  setLoopWsCompactMode,
  getLoopWsFreeOnly,
  setLoopWsFreeOnly,
  getLoopWsExpiredWithCredits,
  setLoopWsExpiredWithCredits,
  buildLoopTooltipText,
  renderLoopWorkspaceList,
  populateLoopWorkspaceDropdown,
  invalidateWsDropdownHash,
  wsRenderStats,
} from './ws-list-renderer';

export {
  renderBulkRenameDialog,
  removeBulkRenameDialog,
} from './ui/bulk-rename';
