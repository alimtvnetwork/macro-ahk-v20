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

import { log, logSub } from '../logging';
import { createWorkspaceListSkeleton } from './skeleton';
import { cPanelBg, cPrimary, cPrimaryBorderA, cPrimaryBgAS, cPrimaryHL, cPrimaryLighter, cInputBg, cInputBorder, cInputFg, loopCreditState, getLoopWsCheckedIds, setLoopWsCheckedIds, setLoopWsLastCheckedIdx, state } from '../shared-state';
import { getBearerToken } from '../auth';
import type { RenameHistoryEntry, UndoRenameResults } from '../types';
import { logError } from '../error-utils';

const ID_LOOP_WS_LIST = 'loop-ws-list';
const ATTR_DATA_ACTIVE = 'data-active';

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
  const listEl = document.getElementById(ID_LOOP_WS_LIST);
  if (!listEl) {
    return;
  }
  const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
  if (currentItem) {
    currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const idx = parseInt(currentItem.getAttribute('data-ws-idx') || '', 10);
    if (!isNaN(idx)) {
      setLoopWsNavIndex(idx);
    }
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
  // If we have workspaces loaded but no current name, detect first
  if ((loopCreditState.perWorkspace || []).length === 0) {
    log('Focus Current: no workspaces loaded, fetching...', 'check');
    fetchLoopCreditsWithDetect(false);
    return;
  }

  log('Focus Current: re-detecting current workspace via API...', 'check');
  getBearerToken().then(function(token) {
    return autoDetectLoopCurrentWorkspace(token);
  }).then(function() {
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
  wsList.id = ID_LOOP_WS_LIST;
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

// ── Ws Dropdown Header (buttons + filters + legend) ──
function _buildWsDropdownHeader(deps: WsDropdownDeps): HTMLElement {
  void deps;

  const wsDropHeader = document.createElement('div');
  wsDropHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;';
  wsDropHeader.innerHTML = '<span style="font-size:11px;">🏢</span><span id="loop-ws-count-label" style="font-size:10px;color:' + cPrimaryLighter + ';font-weight:bold;">Workspaces</span>'
    + '<span id="loop-ws-sel-count" style="font-size:8px;color:#facc15;display:none;"></span>';

  _appendActionButtons(wsDropHeader, deps);
  _appendFilterButtons(wsDropHeader, deps);
  _appendMinCreditsAndLegend(wsDropHeader, deps.populateLoopWorkspaceDropdown);

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

// ── Filter Buttons (Free, Rollover, Billing, Compact) ──
function _appendFilterButtons(header: HTMLElement, deps: WsDropdownDeps): void {
  const { populateLoopWorkspaceDropdown, getLoopWsFreeOnly, setLoopWsFreeOnly, getLoopWsCompactMode, setLoopWsCompactMode } = deps;

  header.appendChild(_buildFilterBtn('🆓', 'Toggle free-only filter', 'rgba(250,204,21,0.15)', '#facc15', 'rgba(250,204,21,0.4)', function() {
    setLoopWsFreeOnly(!getLoopWsFreeOnly());
    return getLoopWsFreeOnly();
  }, populateLoopWorkspaceDropdown));

  header.appendChild(_buildToggleFilterBtn('loop-ws-rollover-filter', '🔄', 'Show only workspaces with rollover credits',
    cPrimaryBgAS, '#c4b5fd', 'rgba(167,139,250,0.4)', 'rgba(167,139,250,0.15)', populateLoopWorkspaceDropdown));

  header.appendChild(_buildToggleFilterBtn('loop-ws-billing-filter', '💰', 'Show only workspaces with billing credits',
    'rgba(34,197,94,0.15)', '#4ade80', 'rgba(34,197,94,0.4)', 'rgba(34,197,94,0.15)', populateLoopWorkspaceDropdown));

  const wsCompactBtn = document.createElement('button');
  wsCompactBtn.id = 'loop-ws-compact-toggle';
  wsCompactBtn.textContent = '⚡';
  wsCompactBtn.title = 'Compact view: show only ⚡available/total';
  wsCompactBtn.style.cssText = 'padding:1px 5px;background:rgba(34,211,238,0.4);color:#22d3ee;border:1px solid rgba(34,211,238,0.4);border-radius:3px;font-size:9px;cursor:pointer;font-weight:700;';
  wsCompactBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    setLoopWsCompactMode(!getLoopWsCompactMode());
    try { localStorage.setItem('ml_compact_mode', getLoopWsCompactMode() ? 'true' : 'false'); } catch (ex) { logSub('Failed to persist compact mode: ' + (ex instanceof Error ? ex.message : String(ex)), 1); }
    (this as HTMLElement).style.background = getLoopWsCompactMode() ? 'rgba(34,211,238,0.4)' : 'rgba(34,211,238,0.15)';
    (this as HTMLElement).style.fontWeight = getLoopWsCompactMode() ? '700' : 'normal';
    populateLoopWorkspaceDropdown();
  };
  header.appendChild(wsCompactBtn);
}

// ── Min Credits + Legend ──
function _appendMinCreditsAndLegend(header: HTMLElement, populateLoopWorkspaceDropdown: () => void): void {
  const wsMinRow = document.createElement('div');
  wsMinRow.style.cssText = 'display:flex;align-items:center;gap:3px;';
  const wsMinLabel = document.createElement('span');
  wsMinLabel.style.cssText = 'font-size:8px;color:#94a3b8;';
  wsMinLabel.textContent = 'Min⚡';
  const wsMinInput = document.createElement('input');
  wsMinInput.type = 'number';
  wsMinInput.id = 'loop-ws-min-credits';
  wsMinInput.placeholder = '0';
  wsMinInput.min = '0';
  wsMinInput.style.cssText = 'width:35px;padding:1px 3px;border:1px solid ' + cPrimary + ';border-radius:2px;background:' + cPanelBg + ';color:#22d3ee;font-size:8px;outline:none;font-family:monospace;';
  wsMinInput.oninput = function() { populateLoopWorkspaceDropdown(); };
  wsMinRow.appendChild(wsMinLabel);
  wsMinRow.appendChild(wsMinInput);
  header.appendChild(wsMinRow);

  const wsLegend = document.createElement('div');
  wsLegend.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:2px 0;border-top:1px solid rgba(255,255,255,.1);margin-top:2px;';
  wsLegend.innerHTML = '<span style="font-size:7px;color:#4ade80;" title="Billing credits from subscription">💰Billing</span>'
    + '<span style="font-size:7px;color:#c4b5fd;" title="Rollover from previous period">🔄Rollover</span>'
    + '<span style="font-size:7px;color:#facc15;" title="Daily free credits">📅Daily</span>'
    + '<span style="font-size:7px;color:#22d3ee;" title="Total available credits">⚡Total</span>'
    + '<span style="font-size:7px;color:#4ade80;" title="Trial credits">🎁Trial</span>'
    + '<span style="font-size:7px;color:#94a3b8;" title="📍=Current 🟢=OK 🟡=Low 🔴=Empty">📍🟢🟡🔴</span>';
  header.appendChild(wsLegend);

  // legend appended to header
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

// ── Filter Button (with getter/setter) ──
function _buildFilterBtn(
  icon: string, title: string, bgOff: string, color: string, bgOn: string,
  toggle: () => boolean, populate: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.textContent = icon;
  btn.title = title;
  btn.style.cssText = 'padding:1px 5px;background:' + bgOff + ';color:' + color + ';border:1px solid ' + bgOn + ';border-radius:3px;font-size:9px;cursor:pointer;';
  btn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const isActive = toggle();
    (this as HTMLElement).style.background = isActive ? bgOn : bgOff;
    (this as HTMLElement).style.fontWeight = isActive ? '700' : 'normal';
    populate();
  };
  return btn;
}

// ── Toggle Filter Button (with data-active attribute) ──
function _buildToggleFilterBtn(
  id: string, icon: string, title: string,
  bgOff: string, color: string, bgOn: string, bgInactive: string,
  populate: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = icon;
  btn.title = title;
  btn.style.cssText = 'padding:1px 5px;background:' + bgOff + ';color:' + color + ';border:1px solid ' + bgOn + ';border-radius:3px;font-size:9px;cursor:pointer;';
  btn.setAttribute(ATTR_DATA_ACTIVE, 'false');
  btn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const isActive = (this as HTMLElement).getAttribute(ATTR_DATA_ACTIVE) === 'true';
    (this as HTMLElement).setAttribute(ATTR_DATA_ACTIVE, isActive ? 'false' : 'true');
    (this as HTMLElement).style.background = !isActive ? bgOn : bgInactive;
    (this as HTMLElement).style.fontWeight = !isActive ? '700' : 'normal';
    populate();
  };
  return btn;
}

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
    const listEl = document.getElementById(ID_LOOP_WS_LIST);
    if (!listEl) {
      return;
    }
    const items = listEl.querySelectorAll('.loop-ws-item');
    if (items.length === 0) {
      return;
    }
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
