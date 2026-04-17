/**
 * MacroLoop Controller — Workspace Dropdown Builder
 * Step 2g: Extracted from macro-looping.ts
 *
 * Builds the workspace dropdown section including:
 * - Header with Select All, Rename, Undo, Focus Current buttons
 * - Filter buttons: Free Only, Rollover, Billing, Compact mode
 * - Min credits filter input
 * - Legend row
 * - Search input with keyboard navigation
 * - Workspace list container
 * - Move button row
 */

import { log } from '../logging';
import { createWorkspaceListSkeleton } from './skeleton';
import { cPrimary, cPrimaryBorderA, cPrimaryHL, cPrimaryLighter, cInputBg, cInputBorder, cInputFg, loopCreditState, getLoopWsCheckedIds, setLoopWsCheckedIds, setLoopWsLastCheckedIdx, state } from '../shared-state';
import { resolveToken } from '../auth';
import type { RenameHistoryEntry, UndoRenameResults } from '../types';
import { logError } from '../error-utils';
import { buildWsFilterMenuButton } from './ws-filter-menu';

import { DomId } from '../types';
export interface WsDropdownDeps {
  populateLoopWorkspaceDropdown: () => void;
  updateWsSelectionUI: () => void;
  renderBulkRenameDialog: () => void;
  getRenameHistory: () => RenameHistoryEntry[];
  undoLastRename: (cb: (results: UndoRenameResults, done: boolean) => void) => void;
  updateUndoBtnVisibility: () => void;
  fetchLoopCreditsWithDetect: (silent: boolean) => void;
  autoDetectLoopCurrentWorkspace: (token: string) => Promise<void>;
  getLoopWsFreeOnly: () => boolean;
  setLoopWsFreeOnly: (v: boolean) => void;
  getLoopWsCompactMode: () => boolean;
  setLoopWsCompactMode: (v: boolean) => void;
  getLoopWsExpiredWithCredits: () => boolean;
  setLoopWsExpiredWithCredits: (v: boolean) => void;
  getLoopWsNavIndex: () => number;
  setLoopWsNavIndex: (v: number) => void;
  triggerLoopMoveFromSelection: () => void;
}

export interface WsDropdownResult {
  wsDropSection: HTMLElement;
}

/**
 * Build the entire workspace dropdown section.
 */

/** Scroll to and highlight the current workspace item in the list. */
function scrollToCurrentItem(setLoopWsNavIndex: (v: number) => void, label: string): void {
  const listEl = document.getElementById(DomId.LoopWsList);
  if (!listEl) return;
  const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
  if (currentItem) {
    currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const idx = parseInt(currentItem.getAttribute('data-ws-idx') || '', 10);
    if (!isNaN(idx)) setLoopWsNavIndex(idx);
    log('✅ Focused & selected: ' + label, 'success');
  } else {
    log('Focus Current: name "' + label + '" not found in rendered list', 'warn');
  }
}

/** Handle the Focus Current button click — always uses API-resolved workspace. */
function handleFocusCurrent(
  populateLoopWorkspaceDropdown: () => void,
  setLoopWsNavIndex: (v: number) => void,
  fetchLoopCreditsWithDetect: (silent: boolean) => void,
  autoDetectLoopCurrentWorkspace: (token: string) => Promise<void>,
): void {
  // Always re-detect from API to ensure current workspace is accurate
  const token = resolveToken();

  // If we have workspaces loaded but no current name, detect first
  if ((loopCreditState.perWorkspace || []).length === 0) {
    log('Focus Current: no workspaces loaded, fetching...', 'check');
    fetchLoopCreditsWithDetect(false);
    return;
  }

  log('Focus Current: re-detecting current workspace via API...', 'check');
  autoDetectLoopCurrentWorkspace(token).then(function() {
    const currentName = state.workspaceName
      || (loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '');

    if (!currentName) {
      logError('Focus Current', '❌ workspace still unknown after API detection');
      return;
    }

    log('Focus Current: resolved "' + currentName + '" from API', 'success');
    populateLoopWorkspaceDropdown();
    scrollToCurrentItem(setLoopWsNavIndex, currentName);
  });
}

export function buildWsDropdownSection(deps: WsDropdownDeps): WsDropdownResult {
  const { populateLoopWorkspaceDropdown, triggerLoopMoveFromSelection, setLoopWsNavIndex, getLoopWsNavIndex } = deps;

  const wsDropSection = document.createElement('div');
  wsDropSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border:1px solid ' + cPrimary + ';border-radius:4px;';

  const wsDropHeader = _buildWsDropdownHeader(deps);
  const wsSearchInput = _buildWsSearchInput(populateLoopWorkspaceDropdown, setLoopWsNavIndex, getLoopWsNavIndex, triggerLoopMoveFromSelection);

  const wsList = document.createElement('div');
  wsList.id = DomId.LoopWsList;
  wsList.style.cssText = 'max-height:160px;overflow-y:auto;border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;background:rgba(0,0,0,.3);';
  wsList.appendChild(createWorkspaceListSkeleton());

  const wsSelected = document.createElement('div');
  wsSelected.id = 'loop-ws-selected';
  wsSelected.style.cssText = 'font-size:9px;color:#9ca3af;margin-top:3px;min-height:12px;';
  wsSelected.textContent = 'No workspace selected';

  const wsMoveRow = _buildMoveRow(triggerLoopMoveFromSelection);

  wsDropSection.appendChild(wsDropHeader);
  wsDropSection.appendChild(wsSearchInput);
  wsDropSection.appendChild(wsList);
  wsDropSection.appendChild(wsSelected);
  wsDropSection.appendChild(wsMoveRow);

  return { wsDropSection };
}

// ── Ws Dropdown Header (action buttons + hamburger filter menu) ──
function _buildWsDropdownHeader(deps: WsDropdownDeps): HTMLElement {
  const wsDropHeader = document.createElement('div');
  wsDropHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;';
  wsDropHeader.innerHTML = '<span style="font-size:11px;">🏢</span><span id="loop-ws-count-label" style="font-size:10px;color:' + cPrimaryLighter + ';font-weight:bold;">Workspaces</span>'
    + '<span id="loop-ws-sel-count" style="font-size:8px;color:#facc15;display:none;"></span>';

  _appendActionButtons(wsDropHeader, deps);

  // v2.148.0: secondary filters live behind a hamburger menu pinned to the
  // top-right of the WS panel header. Only "Focus Current" stays inline.
  wsDropHeader.appendChild(buildWsFilterMenuButton({
    populateLoopWorkspaceDropdown: deps.populateLoopWorkspaceDropdown,
    getLoopWsFreeOnly: deps.getLoopWsFreeOnly,
    setLoopWsFreeOnly: deps.setLoopWsFreeOnly,
    getLoopWsCompactMode: deps.getLoopWsCompactMode,
    setLoopWsCompactMode: deps.setLoopWsCompactMode,
    getLoopWsExpiredWithCredits: deps.getLoopWsExpiredWithCredits,
    setLoopWsExpiredWithCredits: deps.setLoopWsExpiredWithCredits,
  }));

  return wsDropHeader;
}

// ── Action Buttons (Select All, Rename, Undo, Focus) ──
function _appendActionButtons(header: HTMLElement, deps: WsDropdownDeps): void {
  const { populateLoopWorkspaceDropdown, updateWsSelectionUI, renderBulkRenameDialog,
    getRenameHistory, undoLastRename, updateUndoBtnVisibility,
    fetchLoopCreditsWithDetect, autoDetectLoopCurrentWorkspace, setLoopWsNavIndex } = deps;

  const wsSelectAllBtn = document.createElement('button');
  wsSelectAllBtn.id = 'loop-ws-select-all-btn';
  wsSelectAllBtn.textContent = '☑ All';
  wsSelectAllBtn.title = 'Select all / deselect all workspaces';
  wsSelectAllBtn.style.cssText = 'padding:1px 5px;background:' + cPrimaryHL + ';color:' + cPrimaryLighter + ';border:1px solid rgba(139,92,246,0.4);border-radius:3px;font-size:8px;cursor:pointer;';
  wsSelectAllBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const perWs = loopCreditState.perWorkspace || [];
    const allChecked = Object.keys(getLoopWsCheckedIds()).length >= perWs.length && perWs.length > 0;
    if (allChecked) {
      setLoopWsCheckedIds({});
    } else {
      setLoopWsCheckedIds({});
      for (const ws of perWs) {
        if (ws.id) { getLoopWsCheckedIds()[ws.id] = true; }
      }
    }
    setLoopWsLastCheckedIdx(-1);
    updateWsSelectionUI();
  };
  header.appendChild(wsSelectAllBtn);

  const wsRenameBtn = document.createElement('button');
  wsRenameBtn.id = 'loop-ws-rename-btn';
  wsRenameBtn.textContent = '✏️ Rename';
  wsRenameBtn.title = 'Bulk rename selected workspaces';
  wsRenameBtn.style.cssText = 'display:none;padding:1px 6px;background:rgba(234,179,8,0.2);color:#facc15;border:1px solid rgba(234,179,8,0.4);border-radius:3px;font-size:8px;cursor:pointer;font-weight:700;';
  wsRenameBtn.onclick = function(e: Event) { e.preventDefault(); e.stopPropagation(); renderBulkRenameDialog(); };
  header.appendChild(wsRenameBtn);

  header.appendChild(_buildUndoBtn(getRenameHistory, undoLastRename, populateLoopWorkspaceDropdown));
  setTimeout(function() { updateUndoBtnVisibility(); }, 100);

  const wsFocusBtn = document.createElement('button');
  wsFocusBtn.textContent = '📍 Focus Current';
  wsFocusBtn.title = 'Scroll to and highlight the current workspace in the list';
  wsFocusBtn.style.cssText = 'margin-left:auto;padding:2px 7px;background:rgba(139,92,246,0.2);color:' + cPrimaryLighter + ';border:1px solid rgba(139,92,246,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
  wsFocusBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    handleFocusCurrent(populateLoopWorkspaceDropdown, setLoopWsNavIndex, fetchLoopCreditsWithDetect, autoDetectLoopCurrentWorkspace);
  };
  header.appendChild(wsFocusBtn);
}

// ── Undo Button ──
function _buildUndoBtn(
  getRenameHistory: () => RenameHistoryEntry[],
  undoLastRename: (cb: (results: UndoRenameResults, done: boolean) => void) => void,
  populateLoopWorkspaceDropdown: () => void,
): HTMLElement {
  const wsUndoBtn = document.createElement('button');
  wsUndoBtn.id = 'loop-ws-undo-btn';
  wsUndoBtn.textContent = '↩️ Undo';
  wsUndoBtn.title = 'Undo last bulk rename';
  wsUndoBtn.style.cssText = 'display:none;padding:1px 6px;background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:3px;font-size:8px;cursor:pointer;font-weight:700;';
  wsUndoBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    if (getRenameHistory().length === 0) { log('[Rename] Nothing to undo', 'warn'); return; }
    const last = getRenameHistory()[getRenameHistory().length - 1];
    const count = last.entries.length;
    wsUndoBtn.disabled = true;
    wsUndoBtn.textContent = '↩️ Undoing... 0/' + count;
    wsUndoBtn.style.background = 'rgba(100,116,139,0.3)';
    undoLastRename(function(results: UndoRenameResults, done: boolean) {
      if (done) {
        wsUndoBtn.disabled = false;
        wsUndoBtn.textContent = '↩️ Undo';
        wsUndoBtn.style.background = 'rgba(239,68,68,0.2)';
        populateLoopWorkspaceDropdown();
        log('[Rename] Undo complete: ' + results.success + '/' + results.total + ' reverted' + (results.failed > 0 ? ' (' + results.failed + ' failed)' : ''), results.failed > 0 ? 'warn' : 'success');
      } else {
        wsUndoBtn.textContent = '↩️ ' + (results.success + results.failed) + '/' + count;
      }
    });
  };
  return wsUndoBtn;
}

// (Filter button helpers removed in v2.148.0 — replaced by ws-filter-menu.ts hamburger.)

// ── Search Input ──
function _buildWsSearchInput(
  populateLoopWorkspaceDropdown: () => void,
  setLoopWsNavIndex: (v: number) => void,
  getLoopWsNavIndex: () => number,
  triggerLoopMoveFromSelection: () => void,
): HTMLElement {
  const wsSearchInput = document.createElement('input');
  wsSearchInput.type = 'text';
  wsSearchInput.id = 'loop-ws-search';
  wsSearchInput.placeholder = '🔍 Search...';
  wsSearchInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-size:9px;outline:none;box-sizing:border-box;margin-bottom:4px;';
  wsSearchInput.onfocus = function() { (this as HTMLElement).style.borderColor = '#a78bfa'; };
  wsSearchInput.onblur = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  wsSearchInput.oninput = function() { populateLoopWorkspaceDropdown(); };
  wsSearchInput.onkeydown = function(e: KeyboardEvent) {
    const listEl = document.getElementById(DomId.LoopWsList);
    if (!listEl) return;
    const items = listEl.querySelectorAll('.loop-ws-item');
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLoopWsNavIndex(getLoopWsNavIndex() < items.length - 1 ? getLoopWsNavIndex() + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLoopWsNavIndex(getLoopWsNavIndex() > 0 ? getLoopWsNavIndex() - 1 : items.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      triggerLoopMoveFromSelection();
    }
  };
  return wsSearchInput;
}

// ── Move Row ──
function _buildMoveRow(triggerLoopMoveFromSelection: () => void): HTMLElement {
  const wsMoveRow = document.createElement('div');
  wsMoveRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:3px;';

  const moveBtn = document.createElement('button');
  moveBtn.textContent = '🚀 Move';
  moveBtn.title = 'Move project to selected workspace';
  moveBtn.style.cssText = 'flex:1;padding:4px 8px;background:#059669;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.15s;';
  moveBtn.onmouseover = function() { (this as HTMLElement).style.background = '#047857'; };
  moveBtn.onmouseout = function() { (this as HTMLElement).style.background = '#059669'; };
  moveBtn.onclick = function(e: Event) { e.preventDefault(); e.stopPropagation(); triggerLoopMoveFromSelection(); };

  const moveStatus = document.createElement('div');
  moveStatus.id = 'loop-move-status';
  moveStatus.style.cssText = 'font-size:9px;min-height:12px;color:#9ca3af;';

  wsMoveRow.appendChild(moveBtn);
  wsMoveRow.appendChild(moveStatus);
  return wsMoveRow;
}
