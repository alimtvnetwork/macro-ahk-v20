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
import {
  cPanelBg, cPanelFgDim,
  cPrimary, cPrimaryBorderA, cPrimaryBgAS, cPrimaryHL,
  cPrimaryLight, cPrimaryLighter,
  cInputBg, cInputBorder, cInputFg,
  loopCreditState, loopWsCheckedIds,
  setLoopWsCheckedIds, setLoopWsLastCheckedIdx,
  state,
} from '../shared-state';
import { resolveToken } from '../auth';
import { showToast } from '../toast';

export interface WsDropdownDeps {
  populateLoopWorkspaceDropdown: () => void;
  updateWsSelectionUI: () => void;
  renderBulkRenameDialog: () => void;
  getRenameHistory: () => any[];
  undoLastRename: (cb: (results: any, done: boolean) => void) => void;
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
export function buildWsDropdownSection(deps: WsDropdownDeps): WsDropdownResult {
  const {
    populateLoopWorkspaceDropdown, updateWsSelectionUI, renderBulkRenameDialog,
    getRenameHistory, undoLastRename, updateUndoBtnVisibility,
    fetchLoopCreditsWithDetect, autoDetectLoopCurrentWorkspace,
    getLoopWsFreeOnly, setLoopWsFreeOnly,
    getLoopWsCompactMode, setLoopWsCompactMode,
    getLoopWsNavIndex, setLoopWsNavIndex,
    triggerLoopMoveFromSelection,
  } = deps;

  const wsDropSection = document.createElement('div');
  wsDropSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border:1px solid ' + cPrimary + ';border-radius:4px;';

  const wsDropHeader = document.createElement('div');
  wsDropHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;';
  wsDropHeader.innerHTML = '<span style="font-size:11px;">🏢</span><span id="loop-ws-count-label" style="font-size:10px;color:' + cPrimaryLighter + ';font-weight:bold;">Workspaces</span>'
    + '<span id="loop-ws-sel-count" style="font-size:8px;color:#facc15;display:none;"></span>';

  // Select All / Deselect All button
  const wsSelectAllBtn = document.createElement('button');
  wsSelectAllBtn.id = 'loop-ws-select-all-btn';
  wsSelectAllBtn.textContent = '☑ All';
  wsSelectAllBtn.title = 'Select all / deselect all workspaces';
  wsSelectAllBtn.style.cssText = 'padding:1px 5px;background:' + cPrimaryHL + ';color:' + cPrimaryLighter + ';border:1px solid rgba(139,92,246,0.4);border-radius:3px;font-size:8px;cursor:pointer;';
  wsSelectAllBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    let perWs = loopCreditState.perWorkspace || [];
    const allChecked = Object.keys(loopWsCheckedIds).length >= perWs.length && perWs.length > 0;
    if (allChecked) {
      setLoopWsCheckedIds({});
    } else {
      setLoopWsCheckedIds({});
      for (let i = 0; i < perWs.length; i++) {
        if (perWs[i].id) loopWsCheckedIds[perWs[i].id] = true;
      }
    }
    setLoopWsLastCheckedIdx(-1);
    updateWsSelectionUI();
  };
  wsDropHeader.appendChild(wsSelectAllBtn);

  // Rename button (visible when selection > 0)
  const wsRenameBtn = document.createElement('button');
  wsRenameBtn.id = 'loop-ws-rename-btn';
  wsRenameBtn.textContent = '✏️ Rename';
  wsRenameBtn.title = 'Bulk rename selected workspaces';
  wsRenameBtn.style.cssText = 'display:none;padding:1px 6px;background:rgba(234,179,8,0.2);color:#facc15;border:1px solid rgba(234,179,8,0.4);border-radius:3px;font-size:8px;cursor:pointer;font-weight:700;';
  wsRenameBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    renderBulkRenameDialog();
  };
  wsDropHeader.appendChild(wsRenameBtn);

  // Undo last rename button
  const wsUndoBtn = document.createElement('button');
  wsUndoBtn.id = 'loop-ws-undo-btn';
  wsUndoBtn.textContent = '↩️ Undo';
  wsUndoBtn.title = 'Undo last bulk rename';
  wsUndoBtn.style.cssText = 'display:none;padding:1px 6px;background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:3px;font-size:8px;cursor:pointer;font-weight:700;';
  wsUndoBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    if (getRenameHistory().length === 0) { log('[Rename] Nothing to undo', 'warn'); return; }
    const last = getRenameHistory()[getRenameHistory().length - 1];
    let count = last.entries.length;
    wsUndoBtn.disabled = true;
    wsUndoBtn.textContent = '↩️ Undoing... 0/' + count;
    wsUndoBtn.style.background = 'rgba(100,116,139,0.3)';
    undoLastRename(function(results: any, done: boolean) {
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
  wsDropHeader.appendChild(wsUndoBtn);

  // Show undo button if history exists on load
  setTimeout(function() { updateUndoBtnVisibility(); }, 100);

  const wsFocusBtn = document.createElement('button');
  wsFocusBtn.textContent = '📍 Focus Current';
  wsFocusBtn.title = 'Scroll to and highlight the current workspace in the list';
  wsFocusBtn.style.cssText = 'margin-left:auto;padding:2px 7px;background:rgba(139,92,246,0.2);color:' + cPrimaryLighter + ';border:1px solid rgba(139,92,246,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
  wsFocusBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    let currentName = state.workspaceName || '';

    // If no name yet, try reading from Transfer dialog DOM
    if (!currentName) {
      try {
        const selectors = [
          'div[role="dialog"] p.min-w-0.truncate',
          'div[role="dialog"] p.truncate'
        ];
        for (let s = 0; s < selectors.length; s++) {
          const domEl = document.querySelector(selectors[s]);
          if (domEl) {
            const domText = (domEl.textContent || '').trim();
            if (domText) {
              currentName = domText;
              state.workspaceName = domText;
              log('Focus Current: read workspace from Transfer dialog DOM: "' + domText + '"', 'success');
              break;
            }
          }
        }
      } catch(ex) { /* ignore */ }
    }

    log('Focus Current: looking for "' + currentName + '"', 'check');

    // If we already know the current workspace, just find & scroll — no API needed
    if (currentName && (loopCreditState.perWorkspace || []).length > 0) {
      populateLoopWorkspaceDropdown();
      const listEl = document.getElementById('loop-ws-list');
      if (listEl) {
        const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
        if (currentItem) {
          currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
          let idx = parseInt(currentItem.getAttribute('data-ws-idx') || '', 10);
          if (!isNaN(idx)) setLoopWsNavIndex(idx);
          log('✅ Focused & selected: ' + currentName, 'success');
        } else {
          log('Focus Current: name "' + currentName + '" not found in rendered list', 'warn');
        }
      }
      return;
    }

    // Fallback: no name known — fetch credits (which auto-detects workspace)
    if ((loopCreditState.perWorkspace || []).length === 0) {
      log('Focus Current: no workspaces loaded, fetching...', 'check');
      fetchLoopCreditsWithDetect(false);
      return;
    }

    // Have workspaces but no name — detect via API
    const token = (window as any).__loopResolvedToken || resolveToken();
    autoDetectLoopCurrentWorkspace(token).then(function() {
      populateLoopWorkspaceDropdown();
      const listEl = document.getElementById('loop-ws-list');
      if (!listEl) return;
      const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
      if (currentItem) {
        currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        let idx = parseInt(currentItem.getAttribute('data-ws-idx') || '', 10);
        if (!isNaN(idx)) setLoopWsNavIndex(idx);
        log('✅ Focused & selected: ' + state.workspaceName, 'success');
      } else {
        log('Focus Current: no item marked as current after detection', 'warn');
      }
    });
  };
  wsDropHeader.appendChild(wsFocusBtn);

  // Free Only filter
  const wsFreeBtn = document.createElement('button');
  wsFreeBtn.textContent = '🆓';
  wsFreeBtn.title = 'Toggle free-only filter';
  wsFreeBtn.style.cssText = 'padding:1px 5px;background:rgba(250,204,21,0.15);color:#facc15;border:1px solid rgba(250,204,21,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
  wsFreeBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    setLoopWsFreeOnly(!getLoopWsFreeOnly());
    (this as HTMLElement).style.background = getLoopWsFreeOnly() ? 'rgba(250,204,21,0.4)' : 'rgba(250,204,21,0.15)';
    (this as HTMLElement).style.fontWeight = getLoopWsFreeOnly() ? '700' : 'normal';
    populateLoopWorkspaceDropdown();
  };
  wsDropHeader.appendChild(wsFreeBtn);

  // Rollover filter
  const wsRolloverBtn = document.createElement('button');
  wsRolloverBtn.id = 'loop-ws-rollover-filter';
  wsRolloverBtn.textContent = '🔄';
  wsRolloverBtn.title = 'Show only workspaces with rollover credits';
  wsRolloverBtn.style.cssText = 'padding:1px 5px;background:' + cPrimaryBgAS + ';color:#c4b5fd;border:1px solid rgba(167,139,250,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
  wsRolloverBtn.setAttribute('data-active', 'false');
  wsRolloverBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const isActive = (this as HTMLElement).getAttribute('data-active') === 'true';
    (this as HTMLElement).setAttribute('data-active', isActive ? 'false' : 'true');
    (this as HTMLElement).style.background = !isActive ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.15)';
    (this as HTMLElement).style.fontWeight = !isActive ? '700' : 'normal';
    populateLoopWorkspaceDropdown();
  };
  wsDropHeader.appendChild(wsRolloverBtn);

  // Billing filter
  const wsBillingBtn = document.createElement('button');
  wsBillingBtn.id = 'loop-ws-billing-filter';
  wsBillingBtn.textContent = '💰';
  wsBillingBtn.title = 'Show only workspaces with billing credits';
  wsBillingBtn.style.cssText = 'padding:1px 5px;background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
  wsBillingBtn.setAttribute('data-active', 'false');
  wsBillingBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const isActive = (this as HTMLElement).getAttribute('data-active') === 'true';
    (this as HTMLElement).setAttribute('data-active', isActive ? 'false' : 'true');
    (this as HTMLElement).style.background = !isActive ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.15)';
    (this as HTMLElement).style.fontWeight = !isActive ? '700' : 'normal';
    populateLoopWorkspaceDropdown();
  };
  wsDropHeader.appendChild(wsBillingBtn);

  // Compact mode toggle
  const wsCompactBtn = document.createElement('button');
  wsCompactBtn.id = 'loop-ws-compact-toggle';
  wsCompactBtn.textContent = '⚡';
  wsCompactBtn.title = 'Compact view: show only ⚡available/total';
  wsCompactBtn.style.cssText = 'padding:1px 5px;background:rgba(34,211,238,0.4);color:#22d3ee;border:1px solid rgba(34,211,238,0.4);border-radius:3px;font-size:9px;cursor:pointer;font-weight:700;';
  wsCompactBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    setLoopWsCompactMode(!getLoopWsCompactMode());
    try { localStorage.setItem('ml_compact_mode', getLoopWsCompactMode() ? 'true' : 'false'); } catch(e) {}
    (this as HTMLElement).style.background = getLoopWsCompactMode() ? 'rgba(34,211,238,0.4)' : 'rgba(34,211,238,0.15)';
    (this as HTMLElement).style.fontWeight = getLoopWsCompactMode() ? '700' : 'normal';
    populateLoopWorkspaceDropdown();
  };
  wsDropHeader.appendChild(wsCompactBtn);

  // Min credits filter
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
  wsDropHeader.appendChild(wsMinRow);

  // Icon legend
  const wsLegend = document.createElement('div');
  wsLegend.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:2px 0;border-top:1px solid rgba(255,255,255,.1);margin-top:2px;';
  wsLegend.innerHTML = '<span style="font-size:7px;color:#4ade80;" title="Billing credits from subscription">💰Billing</span>'
    + '<span style="font-size:7px;color:#c4b5fd;" title="Rollover from previous period">🔄Rollover</span>'
    + '<span style="font-size:7px;color:#facc15;" title="Daily free credits">📅Daily</span>'
    + '<span style="font-size:7px;color:#22d3ee;" title="Total available credits">⚡Total</span>'
    + '<span style="font-size:7px;color:#4ade80;" title="Trial credits">🎁Trial</span>'
    + '<span style="font-size:7px;color:#94a3b8;" title="📍=Current 🟢=OK 🟡=Low 🔴=Empty">📍🟢🟡🔴</span>';
  wsDropHeader.appendChild(wsLegend);

  // Search input
  const wsSearchInput = document.createElement('input');
  wsSearchInput.type = 'text';
  wsSearchInput.id = 'loop-ws-search';
  wsSearchInput.placeholder = '🔍 Search...';
  wsSearchInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-size:9px;outline:none;box-sizing:border-box;margin-bottom:4px;';
  wsSearchInput.onfocus = function() { (this as HTMLElement).style.borderColor = '#a78bfa'; };
  wsSearchInput.onblur = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  wsSearchInput.oninput = function() { populateLoopWorkspaceDropdown(); };
  wsSearchInput.onkeydown = function(e: KeyboardEvent) {
    const listEl = document.getElementById('loop-ws-list');
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

  // Workspace list
  const wsList = document.createElement('div');
  wsList.id = 'loop-ws-list';
  wsList.style.cssText = 'max-height:160px;overflow-y:auto;border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;background:rgba(0,0,0,.3);';
  wsList.innerHTML = '<div style="padding:8px 6px;color:' + cPrimaryLight + ';font-size:10px;display:flex;align-items:center;gap:6px;">'
    + '<span class="loop-ws-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid rgba(139,92,246,0.3);border-top-color:' + cPrimary + ';border-radius:50%;animation:loopWsSpin .8s linear infinite;"></span>'
    + ' Loading workspaces...</div>';
  // Inject spinner keyframes if not already present
  if (!document.getElementById('loop-ws-spinner-style')) {
    const spinStyle = document.createElement('style');
    spinStyle.id = 'loop-ws-spinner-style';
    spinStyle.textContent = '@keyframes loopWsSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(spinStyle);
  }

  // Selected indicator
  const wsSelected = document.createElement('div');
  wsSelected.id = 'loop-ws-selected';
  wsSelected.style.cssText = 'font-size:9px;color:#9ca3af;margin-top:3px;min-height:12px;';
  wsSelected.textContent = 'No workspace selected';

  // Move button row
  const wsMoveRow = document.createElement('div');
  wsMoveRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:3px;';

  const moveBtn = document.createElement('button');
  moveBtn.textContent = '🚀 Move';
  moveBtn.title = 'Move project to selected workspace';
  moveBtn.style.cssText = 'flex:1;padding:4px 8px;background:#059669;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.15s;';
  moveBtn.onmouseover = function() { (this as HTMLElement).style.background = '#047857'; };
  moveBtn.onmouseout = function() { (this as HTMLElement).style.background = '#059669'; };
  moveBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    triggerLoopMoveFromSelection();
  };

  const moveStatus = document.createElement('div');
  moveStatus.id = 'loop-move-status';
  moveStatus.style.cssText = 'font-size:9px;min-height:12px;color:#9ca3af;';

  wsMoveRow.appendChild(moveBtn);
  wsMoveRow.appendChild(moveStatus);

  wsDropSection.appendChild(wsDropHeader);
  wsDropSection.appendChild(wsSearchInput);
  wsDropSection.appendChild(wsList);
  wsDropSection.appendChild(wsSelected);
  wsDropSection.appendChild(wsMoveRow);

  return { wsDropSection };
}
