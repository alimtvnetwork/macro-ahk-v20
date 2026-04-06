/**
 * MacroLoop Controller — Workspace Selection UI
 * Step 2c: Extracted from macro-looping.ts
 *
 * Contains: handleWsCheckboxClick, updateWsSelectionUI, showWsContextMenu,
 * removeWsContextMenu, startInlineRename, triggerLoopMoveFromSelection,
 * setLoopWsNavIndex, buildLoopTooltipText, renderLoopWorkspaceList,
 * populateLoopWorkspaceDropdown
 */

import { MacroController } from './core/MacroController';

function mc() { return MacroController.getInstance(); }
import {
  loopCreditState, state,
  loopWsCheckedIds, setLoopWsLastCheckedIdx, loopWsLastCheckedIdx,
  cPanelBg, cPanelFg, cPanelFgMuted,
  cPrimary, cPrimaryLight, cPrimaryLighter, cPrimaryBgA, cPrimaryBgAL, cPrimaryHL,
  cPrimaryBorderA, cPrimaryBgAS,
  cInputBg, cInputBorder, cInputFg,
  lDropdownRadius, tFontTiny,
} from './shared-state';
import { log } from './logging';
import { calcTotalCredits, renderCreditBar } from './credit-api';
import { fetchLoopCredits, WS_TIER_LABELS } from './credit-fetch';
import { moveToWorkspace, updateLoopMoveStatus } from './workspace-management';
import {
  renameWorkspace, applyRenameTemplate, bulkRenameWorkspaces,
  cancelRename, getRenameDelayMs, setRenameDelayMs, getRenameAvgOpMs,
} from './workspace-rename';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import { resolveToken, refreshBearerTokenFromBestSource, LAST_TOKEN_SOURCE } from './auth';
import { showToast } from './toast';

// ============================================
// Local state
// ============================================
let loopWsNavIndex = -1;
let loopWsFreeOnly = false;
let loopWsCompactMode = (function() {
  try {
    const v: string | null = localStorage.getItem('ml_compact_mode');
    return v === null ? true : v === 'true';
  } catch(e) { return true; }
})();

/** Expose compact mode state for external consumers */
export function getLoopWsCompactMode(): boolean { return loopWsCompactMode; }
export function setLoopWsCompactMode(val: boolean): void { loopWsCompactMode = val; }
export function getLoopWsFreeOnly(): boolean { return loopWsFreeOnly; }
export function setLoopWsFreeOnly(val: boolean): void { loopWsFreeOnly = val; }
export function getLoopWsNavIndex(): number { return loopWsNavIndex; }

// ============================================
// Helper: fetch credits with auto-detect
// ============================================
function fetchLoopCreditsWithDetect(isRetry?: boolean) {
  fetchLoopCredits(isRetry, autoDetectLoopCurrentWorkspace);
}

// ============================================
// Checkbox click handler (with Shift range select)
// ============================================
export function handleWsCheckboxClick(wsId: string, idx: number, isShift: boolean): void {
  if (isShift && loopWsLastCheckedIdx >= 0) {
    const perWs = loopCreditState.perWorkspace || [];
    const lo = Math.min(loopWsLastCheckedIdx, idx);
    const hi = Math.max(loopWsLastCheckedIdx, idx);
    for (let s = lo; s <= hi; s++) {
      if (perWs[s] && perWs[s].id) {
        loopWsCheckedIds[perWs[s].id] = true;
      }
    }
  } else {
    if (loopWsCheckedIds[wsId]) {
      delete loopWsCheckedIds[wsId];
    } else {
      loopWsCheckedIds[wsId] = true;
    }
  }
  setLoopWsLastCheckedIdx(idx);
  updateWsSelectionUI();
}

/**
 * Update all workspace selection UI elements (checkboxes, count badge, rename button, select-all).
 */
export function updateWsSelectionUI(): void {
  const count = Object.keys(loopWsCheckedIds).length;
  // Update checkboxes in rendered list
  const listEl = document.getElementById('loop-ws-list');
  if (listEl) {
    const items = listEl.querySelectorAll('.loop-ws-item');
    for (let i = 0; i < items.length; i++) {
      const cb = items[i].querySelector('.loop-ws-checkbox');
      if (cb) {
        const wsId = items[i].getAttribute('data-ws-id');
        cb.textContent = loopWsCheckedIds[wsId!] ? '☑' : '☐';
        (cb as HTMLElement).style.color = loopWsCheckedIds[wsId!] ? '#a78bfa' : '#64748b';
      }
    }
  }
  // Update selection count badge
  const badge = document.getElementById('loop-ws-sel-count');
  if (badge) {
    badge.textContent = count > 0 ? count + ' selected' : '';
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
  // Show/hide rename button
  const renameBtn = document.getElementById('loop-ws-rename-btn');
  if (renameBtn) {
    renameBtn.style.display = count > 0 ? 'inline-block' : 'none';
  }
  // Select All toggle
  const allBtn = document.getElementById('loop-ws-select-all-btn');
  if (allBtn) {
    const total = (loopCreditState.perWorkspace || []).length;
    allBtn.textContent = count >= total && total > 0 ? '☐ None' : '☑ All';
  }
}

/**
 * Right-click context menu for single workspace rename.
 */
export function showWsContextMenu(wsId: string, wsName: string, x: number, y: number): void {
  removeWsContextMenu();
  const menu = document.createElement('div');
  menu.id = 'loop-ws-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:100001;background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:' + lDropdownRadius + ';padding:2px 0;box-shadow:0 4px 12px rgba(0,0,0,.5);min-width:100px;';

  const renameItem = document.createElement('div');
  renameItem.textContent = '✏️ Rename';
  renameItem.style.cssText = 'padding:5px 12px;font-size:' + tFontTiny + ';color:' + cPanelFg + ';cursor:pointer;';
  renameItem.onmouseover = function() { (this as HTMLElement).style.background = 'rgba(139,92,246,0.3)'; };
  renameItem.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
  renameItem.onclick = function() {
    removeWsContextMenu();
    startInlineRename(wsId, wsName);
  };

  menu.appendChild(renameItem);
  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(function() {
    document.addEventListener('click', removeWsContextMenu, { once: true });
  }, 10);
}

/**
 * Remove workspace context menu from DOM.
 */
export function removeWsContextMenu(): void {
  const existing = document.getElementById('loop-ws-ctx-menu');
  if (existing) existing.remove();
}

/**
 * Start inline rename of a workspace in the list.
 */
export function startInlineRename(wsId: string, currentName: string): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const items = listEl.querySelectorAll('.loop-ws-item');
  for (let i = 0; i < items.length; i++) {
    if (items[i].getAttribute('data-ws-id') === wsId) {
      const nameDiv = items[i].querySelector('.loop-ws-name');
      if (!nameDiv) break;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentName;
      input.style.cssText = 'width:100%;padding:1px 3px;border:1px solid ' + cPrimaryLight + ';border-radius:2px;background:' + cPanelBg + ';color:' + cPanelFg + ';font-size:11px;outline:none;box-sizing:border-box;';
      input.onkeydown = function(e: KeyboardEvent) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const newName = input.value.trim();
          if (!newName) { log('[Rename] Empty name — cancelled', 'warn'); populateLoopWorkspaceDropdown(); return; }
          if (newName === currentName) { populateLoopWorkspaceDropdown(); return; }
          renameWorkspace(wsId, newName).then(function() {
            // Update local state
            const perWs = loopCreditState.perWorkspace || [];
            for (let k = 0; k < perWs.length; k++) {
              if (perWs[k].id === wsId) { perWs[k].fullName = newName; perWs[k].name = newName; break; }
            }
            populateLoopWorkspaceDropdown();
            fetchLoopCreditsWithDetect(false);
          }).catch(function() { populateLoopWorkspaceDropdown(); });
        } else if (e.key === 'Escape') {
          populateLoopWorkspaceDropdown();
        }
      };
      nameDiv.textContent = '';
      nameDiv.appendChild(input);
      input.focus();
      input.select();
      break;
    }
  }
}

/**
 * Move project to the currently selected workspace in the list.
 */
export function triggerLoopMoveFromSelection(): void {
  const selectedEl = document.getElementById('loop-ws-selected');
  const wsId = selectedEl ? selectedEl.getAttribute('data-selected-id') : '';
  const wsName = selectedEl ? selectedEl.getAttribute('data-selected-name') : '';
  if (!wsId) {
    log('No workspace selected for move', 'warn');
    updateLoopMoveStatus('error', 'Select a workspace first');
    return;
  }
  log('Moving project to workspace=' + wsId + ' (' + wsName + ')', 'delegate');
  moveToWorkspace(wsId, wsName || '');
}

/**
 * Set keyboard navigation index in workspace list.
 */
export function setLoopWsNavIndex(idx: number): void {
  loopWsNavIndex = idx;
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const items = listEl.querySelectorAll('.loop-ws-item');
  for (let i = 0; i < items.length; i++) {
    const isCurrent = items[i].getAttribute('data-ws-current') === 'true';
    if (i === idx) {
      (items[i] as HTMLElement).style.background = 'rgba(139,92,246,0.25)';
      (items[i] as HTMLElement).style.outline = '1px solid #a78bfa';
      items[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const wsId = items[i].getAttribute('data-ws-id');
      const wsName = items[i].getAttribute('data-ws-name');
      const selectedEl = document.getElementById('loop-ws-selected');
      if (selectedEl) {
        selectedEl.setAttribute('data-selected-id', wsId || '');
        selectedEl.setAttribute('data-selected-name', wsName || '');
        selectedEl.textContent = '✅ ' + wsName;
        selectedEl.style.color = '#4ade80';
      }
    } else {
      (items[i] as HTMLElement).style.outline = 'none';
      (items[i] as HTMLElement).style.background = isCurrent ? 'rgba(139,92,246,0.15)' : 'transparent';
    }
  }
}

/**
 * Build detailed tooltip text for a workspace row.
 */
export function buildLoopTooltipText(ws: any): string {
  const lines: string[] = [];
  lines.push('━━━ ' + (ws.fullName || ws.name) + ' ━━━');
  lines.push('');
  lines.push('📊 CALCULATED:');
  lines.push('  🆓 Daily Free: ' + (ws.dailyFree || 0) + ' (' + ws.dailyLimit + ' - ' + ws.dailyUsed + ')');
  lines.push('  🔄 Rollover: ' + (ws.rollover || 0) + ' (' + ws.rolloverLimit + ' - ' + ws.rolloverUsed + ')');
  lines.push('  💰 Available: ' + (ws.available || 0) + ' (total:' + (ws.totalCredits || 0) + ' - rUsed:' + (ws.rolloverUsed || 0) + ' - dUsed:' + (ws.dailyUsed || 0) + ' - bUsed:' + (ws.used || 0) + ')');
  lines.push('  📦 Billing Only: ' + (ws.billingAvailable || 0) + ' (' + ws.limit + ' - ' + ws.used + ')');
  const _tc = ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit);
  lines.push('  ⚡ Total Credits: ' + _tc + ' (granted:' + (ws.freeGranted||0) + ' + daily:' + (ws.dailyLimit||0) + ' + billing:' + (ws.limit||0) + ' + topup:' + (ws.topupLimit||0) + ' + rollover:' + (ws.rolloverLimit||0) + ')');
  lines.push('');
  lines.push('📋 RAW DATA:');
  lines.push('  ID: ' + ws.id);
  lines.push('  Billing: ' + ws.used + '/' + ws.limit + ' used');
  lines.push('  Rollover: ' + ws.rolloverUsed + '/' + ws.rolloverLimit + ' used');
  lines.push('  Daily: ' + ws.dailyUsed + '/' + ws.dailyLimit + ' used');
  if (ws.freeGranted > 0) {
    lines.push('  Trial: ' + ws.freeRemaining + '/' + ws.freeGranted + ' remaining');
  }
  lines.push('  Status: ' + (ws.subscriptionStatus || 'N/A'));
  lines.push('  Role: ' + (ws.role || 'N/A'));
  if (ws.raw) {
    const r = ws.raw;
    if (r.last_trial_credit_period) lines.push('  Trial Period: ' + r.last_trial_credit_period);
    if (r.subscription_status) lines.push('  Subscription: ' + r.subscription_status);
  }
  return lines.join('\n');
}

/**
 * Render the workspace list with filtering, credit bars, and event delegation.
 */
export function renderLoopWorkspaceList(workspaces: any, currentName: string, filter: string): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  var count = 0;
  var currentIdx = -1;
  // v7.23: Pre-compute max totalCredits across all visible workspaces for relative bar scaling
  var maxTotalCredits = 0;
  for (var mi = 0; mi < workspaces.length; mi++) {
    var mtc = Math.round(workspaces[mi].totalCredits || calcTotalCredits(workspaces[mi].freeGranted, workspaces[mi].dailyLimit, workspaces[mi].limit, workspaces[mi].topupLimit, workspaces[mi].rolloverLimit));
    if (mtc > maxTotalCredits) maxTotalCredits = mtc;
  }

  // MC-06: Build DOM via DocumentFragment for batch insertion
  var frag = document.createDocumentFragment();

  // Advanced filter elements — query once outside loop
  var rolloverFilterEl = document.getElementById('loop-ws-rollover-filter');
  var rolloverOnly = rolloverFilterEl && rolloverFilterEl.getAttribute('data-active') === 'true';
  var billingFilterEl = document.getElementById('loop-ws-billing-filter');
  var billingOnlyF = billingFilterEl && billingFilterEl.getAttribute('data-active') === 'true';
  var minCreditsEl = document.getElementById('loop-ws-min-credits');
  var minCreditsVal = minCreditsEl ? parseInt((minCreditsEl as HTMLInputElement).value, 10) || 0 : 0;

  for (var i = 0; i < workspaces.length; i++) {
    var ws = workspaces[i];
    var isCurrent = ws.fullName === currentName || ws.name === currentName;
    if (!isCurrent && currentName) {
      var lcn = currentName.toLowerCase();
      isCurrent = (ws.fullName || '').toLowerCase().indexOf(lcn) !== -1 ||
                  lcn.indexOf((ws.fullName || '').toLowerCase()) !== -1;
    }
    var matchesFilter = !filter || ws.fullName.toLowerCase().indexOf(filter.toLowerCase()) !== -1 || ws.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
    if (!matchesFilter) continue;
    if (loopWsFreeOnly && (ws.dailyFree || 0) <= 0) continue;
    if (rolloverOnly && (ws.rollover || 0) <= 0) continue;
    if (billingOnlyF && (ws.billingAvailable || 0) <= 0) continue;
    if (minCreditsVal > 0 && (ws.available || 0) < minCreditsVal) continue;
    if (isCurrent) currentIdx = count;
    count++;
    var dailyFree = Math.round(ws.dailyFree || 0);
    var rollover = Math.round(ws.rollover || 0);
    var available = Math.round(ws.available || 0);
    var billingAvail = Math.round(ws.billingAvailable || 0);
    var limitInt = Math.round(ws.limit || 0);
    var emoji = isCurrent ? '📍' : (available <= 0 ? '🔴' : available <= limitInt * 0.2 ? '🟡' : '🟢');
    var nameColor = isCurrent ? '#67e8f9' : '#e2e8f0';
    var nameBold = isCurrent ? 'font-weight:800;' : 'font-weight:500;';
    var bgStyle = isCurrent ? 'background:' + cPrimaryHL + ';border-left:3px solid #a78bfa;' : 'border-left:3px solid transparent;';
    var wsId = ws.id || (ws.raw && ws.raw.id) || '';
    var isChecked = !!loopWsCheckedIds[wsId];
    var tooltip = buildLoopTooltipText(ws).replace(/"/g, '&quot;');

    var row = document.createElement('div');
    row.className = 'loop-ws-item';
    row.setAttribute('data-ws-id', wsId);
    row.setAttribute('data-ws-name', (ws.fullName || ws.name));
    row.setAttribute('data-ws-current', isCurrent ? 'true' : 'false');
    row.setAttribute('data-ws-idx', String(count - 1));
    row.setAttribute('data-ws-raw-idx', String(i));
    row.title = tooltip;
    row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 6px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);transition:background 0.15s;font-size:11px;' + bgStyle;

    var _totalCapacity = Math.round(ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit));
    var _fr = Math.round(ws.freeRemaining || 0);
    var _availTotal = Math.round(ws.available || 0);
    var creditBarHtml = renderCreditBar({
      totalCredits: _totalCapacity, available: _availTotal, totalUsed: ws.totalCreditsUsed || 0,
      freeRemaining: _fr, billingAvail: billingAvail, rollover: rollover, dailyFree: dailyFree,
      compact: loopWsCompactMode, maxTotalCredits: maxTotalCredits
    });

    var wsTier = ws.tier || 'FREE';
    var tierMeta = WS_TIER_LABELS[wsTier] || WS_TIER_LABELS['FREE'];
    var tierBadge = '<span style="font-size:7px;color:' + tierMeta.fg + ';background:' + tierMeta.bg + ';padding:0 3px;border-radius:2px;font-weight:700;margin-left:4px;vertical-align:middle;">' + tierMeta.label + '</span>';

    row.innerHTML =
      '<span class="loop-ws-checkbox" style="font-size:11px;cursor:pointer;color:' + (isChecked ? '#a78bfa' : '#64748b') + ';user-select:none;flex-shrink:0;">' + (isChecked ? '☑' : '☐') + '</span>'
      + '<span style="font-size:12px;">' + emoji + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="loop-ws-name" style="color:' + nameColor + ';font-size:11px;' + nameBold + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (ws.fullName || ws.name) + tierBadge + '</div>'
      + '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">' + creditBarHtml + '</div>'
      + '</div>'
      + (isCurrent ? '<span style="font-size:8px;color:' + cPrimaryLight + ';background:' + cPrimaryBgAL + ';padding:1px 4px;border-radius:3px;font-weight:700;">NOW</span>' : '');

    frag.appendChild(row);
  }

  if (count === 0) {
    var emptyEl = document.createElement('div');
    emptyEl.style.cssText = 'padding:8px;color:' + cPrimaryLight + ';font-size:10px;text-align:center;';
    emptyEl.textContent = '🔍 No matches';
    frag.appendChild(emptyEl);
  }

  // MC-06: Single DOM operation — clear and append fragment
  listEl.innerHTML = '';
  listEl.appendChild(frag);
  loopWsNavIndex = -1;

  var countLabel = document.getElementById('loop-ws-count-label');
  if (countLabel) {
    var total = workspaces.length;
    if (filter || loopWsFreeOnly || count !== total) {
      countLabel.textContent = 'Workspaces (' + count + '/' + total + ')';
    } else {
      countLabel.textContent = 'Workspaces (' + total + ')';
    }
  }

  // MC-06: Event delegation — single set of listeners on container
  if ((listEl as any)._wsDelegateHandler) {
    listEl.removeEventListener('click', (listEl as any)._wsDelegateHandler);
    listEl.removeEventListener('dblclick', (listEl as any)._wsDblHandler);
    listEl.removeEventListener('contextmenu', (listEl as any)._wsCtxHandler);
    listEl.removeEventListener('mouseover', (listEl as any)._wsHoverHandler);
    listEl.removeEventListener('mouseout', (listEl as any)._wsOutHandler);
  }

  (listEl as any)._wsDelegateHandler = function(e: any) {
    var item = e.target.closest('.loop-ws-item');
    if (!item) return;
    if (e.target.classList && e.target.classList.contains('loop-ws-checkbox')) {
      e.preventDefault();
      e.stopPropagation();
      handleWsCheckboxClick(item.getAttribute('data-ws-id'), parseInt(item.getAttribute('data-ws-raw-idx'), 10), e.shiftKey);
      return;
    }
    setLoopWsNavIndex(parseInt(item.getAttribute('data-ws-idx'), 10));
    log('Selected workspace: ' + item.getAttribute('data-ws-name'), 'success');
  };

  (listEl as any)._wsDblHandler = function(e: any) {
    var item = e.target.closest('.loop-ws-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    if (item.getAttribute('data-ws-current') === 'true') {
      log('Double-click on current workspace "' + item.getAttribute('data-ws-name') + '" — no move needed', 'warn');
      return;
    }
    log('Double-click move -> ' + item.getAttribute('data-ws-name') + ' (id=' + item.getAttribute('data-ws-id') + ')', 'delegate');
    moveToWorkspace(item.getAttribute('data-ws-id'), item.getAttribute('data-ws-name'));
  };

  (listEl as any)._wsCtxHandler = function(e: any) {
    var item = e.target.closest('.loop-ws-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    showWsContextMenu(item.getAttribute('data-ws-id'), item.getAttribute('data-ws-name'), e.clientX, e.clientY);
  };

  (listEl as any)._wsHoverHandler = function(e: any) {
    var item = e.target.closest('.loop-ws-item');
    if (item && item.getAttribute('data-ws-current') !== 'true') item.style.background = 'rgba(59,130,246,0.15)';
  };

  (listEl as any)._wsOutHandler = function(e: any) {
    var item = e.target.closest('.loop-ws-item');
    if (item && item.getAttribute('data-ws-current') !== 'true') item.style.background = 'transparent';
  };

  listEl.addEventListener('click', (listEl as any)._wsDelegateHandler);
  listEl.addEventListener('dblclick', (listEl as any)._wsDblHandler);
  listEl.addEventListener('contextmenu', (listEl as any)._wsCtxHandler);
  listEl.addEventListener('mouseover', (listEl as any)._wsHoverHandler);
  listEl.addEventListener('mouseout', (listEl as any)._wsOutHandler);

  // Auto-scroll to current workspace
  if (currentIdx >= 0 && !filter) {
    setTimeout(function() {
      var currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
      if (currentItem) currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var selectedEl = document.getElementById('loop-ws-selected');
      if (selectedEl && !selectedEl.getAttribute('data-selected-id')) {
        setLoopWsNavIndex(currentIdx);
      }
    }, 50);
  }
}

/**
 * Populate workspace dropdown — dirty-flag guard to skip re-render when unchanged.
 */
let _wsDropdownHash = '';
export function populateLoopWorkspaceDropdown(): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const workspaces = loopCreditState.perWorkspace || [];
  if (workspaces.length === 0) {
    if (_wsDropdownHash === '_empty') return;
    _wsDropdownHash = '_empty';
    listEl.innerHTML = '<div style="padding:6px;color:' + cPrimaryLight + ';font-size:10px;">📭 No workspaces loaded — click 💰 Credits to retry</div>';
    return;
  }
  const currentName = state.workspaceName || '';
  const searchEl = document.getElementById('loop-ws-search');
  const filter = searchEl ? (searchEl as HTMLInputElement).value.trim() : '';
  // P1 fix: skip re-render if workspace data + current name + filter unchanged
  const hash = workspaces.length + '|' + currentName + '|' + filter + '|' + (loopCreditState.lastCheckedAt || 0);
  if (hash === _wsDropdownHash) return;
  _wsDropdownHash = hash;
  renderLoopWorkspaceList(workspaces, currentName, filter);
  log('Workspace dropdown populated: ' + workspaces.length + ' workspaces', 'success');
}

// ============================================
// Bulk Rename Dialog (Segment B — included here due to tight coupling)
// ============================================

/**
 * Render the floating bulk rename dialog for selected workspaces.
 */
export function renderBulkRenameDialog(): void {
  removeBulkRenameDialog();
  const checkedIds = Object.keys(loopWsCheckedIds);
  if (checkedIds.length === 0) { log('[Rename] No workspaces selected', 'warn'); return; }

  const perWs = loopCreditState.perWorkspace || [];
  const selected: Array<{wsId?: string, wsName?: string, fullName?: string, name?: string, id?: string}> = [];
  for (let i = 0; i < perWs.length; i++) {
    if (loopWsCheckedIds[perWs[i].id]) {
      selected.push(perWs[i]);
    }
  }

  // --- Floating draggable panel ---
  const panel = document.createElement('div');
  panel.id = 'ahk-loop-rename-dialog';
  panel.style.cssText = 'position:fixed;top:80px;right:40px;z-index:100002;background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:8px;padding:0;min-width:420px;max-width:520px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:monospace;resize:both;overflow:hidden;';

  // --- Title bar (draggable) ---
  const titleBar = document.createElement('div');
  titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:' + cPrimaryBgA + ';cursor:grab;user-select:none;border-bottom:1px solid rgba(124,58,237,0.3);';
  const titleText = document.createElement('span');
  titleText.style.cssText = 'font-size:11px;color:' + cPrimaryLighter + ';font-weight:700;';
  titleText.textContent = '✏️ Bulk Rename — ' + selected.length + ' workspace' + (selected.length > 1 ? 's' : '');
  const closeBtnTitle = document.createElement('span');
  closeBtnTitle.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:14px;padding:0 4px;';
  closeBtnTitle.textContent = '✕';
  closeBtnTitle.onclick = function() { removeBulkRenameDialog(); };
  titleBar.appendChild(titleText);
  titleBar.appendChild(closeBtnTitle);
  panel.appendChild(titleBar);

  // Drag logic
  let isDragging = false, dragOffX = 0, dragOffY = 0;
  function onDragMouseDown(e: MouseEvent) {
    if (e.target === closeBtnTitle) return;
    isDragging = true;
    dragOffX = e.clientX - panel.getBoundingClientRect().left;
    dragOffY = e.clientY - panel.getBoundingClientRect().top;
    titleBar.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function onDragMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffX) + 'px';
    panel.style.top = (e.clientY - dragOffY) + 'px';
    panel.style.right = 'auto';
  }
  function onDragMouseUp() {
    isDragging = false;
    titleBar.style.cursor = 'grab';
  }
  titleBar.addEventListener('mousedown', onDragMouseDown);
  document.addEventListener('mousemove', onDragMouseMove);
  document.addEventListener('mouseup', onDragMouseUp);
  (panel as any).__cleanupDrag = function() {
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
  };

  const body = document.createElement('div');
  body.style.cssText = 'padding:10px;';

  // Prefix row
  const prefixRow = document.createElement('div');
  prefixRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const prefixCb = document.createElement('input');
  prefixCb.type = 'checkbox'; prefixCb.id = 'rename-prefix-cb';
  prefixCb.style.cssText = 'width:12px;height:12px;accent-color:' + cPrimaryLight + ';';
  const prefixLabel = document.createElement('span');
  prefixLabel.style.cssText = 'font-size:9px;color:#94a3b8;min-width:40px;';
  prefixLabel.textContent = 'Prefix';
  const prefixInput = document.createElement('input');
  prefixInput.type = 'text'; prefixInput.id = 'rename-prefix'; prefixInput.placeholder = 'e.g. Team-';
  prefixInput.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;';
  prefixRow.appendChild(prefixCb); prefixRow.appendChild(prefixLabel); prefixRow.appendChild(prefixInput);
  body.appendChild(prefixRow);

  // Template row
  const tmplRow = document.createElement('div');
  tmplRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const tmplLabel = document.createElement('span');
  tmplLabel.style.cssText = 'font-size:9px;color:#94a3b8;min-width:52px;';
  tmplLabel.textContent = 'Template';
  const tmplInput = document.createElement('input');
  tmplInput.type = 'text'; tmplInput.id = 'rename-template'; tmplInput.placeholder = 'e.g. Exp $$$$$ D3  or  P## or  Item***';
  tmplInput.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;';
  tmplRow.appendChild(tmplLabel); tmplRow.appendChild(tmplInput);
  body.appendChild(tmplRow);

  // Suffix row
  const suffixRow = document.createElement('div');
  suffixRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const suffixCb = document.createElement('input');
  suffixCb.type = 'checkbox'; suffixCb.id = 'rename-suffix-cb';
  suffixCb.style.cssText = 'width:12px;height:12px;accent-color:' + cPrimaryLight + ';';
  const suffixLabel = document.createElement('span');
  suffixLabel.style.cssText = 'font-size:9px;color:#94a3b8;min-width:40px;';
  suffixLabel.textContent = 'Suffix';
  const suffixInput = document.createElement('input');
  suffixInput.type = 'text'; suffixInput.id = 'rename-suffix'; suffixInput.placeholder = 'e.g.  Dev';
  suffixInput.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;';
  suffixRow.appendChild(suffixCb); suffixRow.appendChild(suffixLabel); suffixRow.appendChild(suffixInput);
  body.appendChild(suffixRow);

  // Variable hint
  const varHint = document.createElement('div');
  varHint.style.cssText = 'font-size:8px;color:#64748b;margin-bottom:6px;padding:2px 4px;background:rgba(0,0,0,.2);border-radius:2px;';
  varHint.innerHTML = 'Variables: <span style="color:#facc15">$$$</span> <span style="color:' + cPrimaryLight + '">###</span> <span style="color:#34d399">***</span> — zero-padded by count ($$$ → 001). Works in prefix, template, suffix.';
  body.appendChild(varHint);

  // Start numbers container
  const startNumsContainer = document.createElement('div');
  startNumsContainer.id = 'rename-start-nums';
  startNumsContainer.style.cssText = 'margin-bottom:6px;';
  body.appendChild(startNumsContainer);

  let startDollar = 1, startHash = 1, startStar = 1;

  function detectVarsAndRenderStarts() {
    const allText = tmplInput.value + (prefixCb.checked ? prefixInput.value : '') + (suffixCb.checked ? suffixInput.value : '');
    const hasDollar = /\$+/.test(allText);
    const hasHash = /#+/.test(allText);
    const hasStar = /\*{2,}/.test(allText);
    let html = '';
    if (hasDollar || hasHash || hasStar) {
      html += '<div style="font-size:8px;color:#94a3b8;margin-bottom:3px;">Start Numbers:</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      if (hasDollar) {
        html += '<label style="display:flex;align-items:center;gap:3px;font-size:9px;color:#facc15;">$ <input type="number" id="rename-start-dollar" value="' + startDollar + '" min="0" style="width:50px;padding:2px 4px;border:1px solid ' + cPrimary + ';border-radius:3px;background:' + cPanelBg + ';color:#facc15;font-size:9px;font-family:monospace;"></label>';
      }
      if (hasHash) {
        html += '<label style="display:flex;align-items:center;gap:3px;font-size:9px;color:' + cPrimaryLight + ';"># <input type="number" id="rename-start-hash" value="' + startHash + '" min="0" style="width:50px;padding:2px 4px;border:1px solid ' + cPrimary + ';border-radius:3px;background:' + cPanelBg + ';color:' + cPrimaryLight + ';font-size:9px;font-family:monospace;"></label>';
      }
      if (hasStar) {
        html += '<label style="display:flex;align-items:center;gap:3px;font-size:9px;color:#34d399;">** <input type="number" id="rename-start-star" value="' + startStar + '" min="0" style="width:50px;padding:2px 4px;border:1px solid ' + cPrimary + ';border-radius:3px;background:' + cPanelBg + ';color:#34d399;font-size:9px;font-family:monospace;"></label>';
      }
      html += '</div>';
    }
    startNumsContainer.innerHTML = html;
    const dEl = document.getElementById('rename-start-dollar') as HTMLInputElement | null;
    const hEl = document.getElementById('rename-start-hash') as HTMLInputElement | null;
    const sEl = document.getElementById('rename-start-star') as HTMLInputElement | null;
    if (dEl) dEl.oninput = function() { startDollar = parseInt(dEl.value, 10) || 1; updatePreview(); };
    if (hEl) hEl.oninput = function() { startHash = parseInt(hEl.value, 10) || 1; updatePreview(); };
    if (sEl) sEl.oninput = function() { startStar = parseInt(sEl.value, 10) || 1; updatePreview(); };
  }

  // Delay row
  const delayRow = document.createElement('div');
  delayRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const delayLabel = document.createElement('span');
  delayLabel.style.cssText = 'font-size:9px;color:#94a3b8;min-width:52px;';
  delayLabel.textContent = 'Delay (ms)';
  const delaySlider = document.createElement('input');
  delaySlider.type = 'range'; delaySlider.min = '100'; delaySlider.max = '10000'; delaySlider.step = '100';
  delaySlider.value = String(getRenameDelayMs());
  delaySlider.style.cssText = 'flex:1;accent-color:' + cPrimaryLight + ';height:4px;';
  const delayVal = document.createElement('span');
  delayVal.style.cssText = 'font-size:9px;color:#22d3ee;min-width:42px;text-align:right;';
  delayVal.textContent = getRenameDelayMs() + 'ms';
  delayRow.appendChild(delayLabel); delayRow.appendChild(delaySlider); delayRow.appendChild(delayVal);
  body.appendChild(delayRow);

  // Token row
  const tokenRow = document.createElement('div');
  tokenRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
  const tokenLabel = document.createElement('span');
  tokenLabel.style.cssText = 'font-size:8px;color:#64748b;';
  tokenLabel.textContent = 'Auth: ' + (LAST_TOKEN_SOURCE || 'none');
  tokenLabel.id = 'rename-auth-label';
  const tokenRefreshBtn = document.createElement('button');
  tokenRefreshBtn.textContent = '🔄 Refresh Token';
  tokenRefreshBtn.style.cssText = 'padding:2px 6px;background:' + cPrimaryBgA + ';color:' + cPrimaryLighter + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;font-size:8px;cursor:pointer;';
  tokenRefreshBtn.onclick = function() {
    (tokenRefreshBtn as HTMLButtonElement).disabled = true;
    tokenRefreshBtn.style.opacity = '0.7';
    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      if (token) {
        log('[Rename] Token refreshed via ' + source + ': ' + token.substring(0, 12) + '...', 'success');
        showToast('Token refreshed via ' + source, 'success');
      } else {
        log('[Rename] Token refresh failed (bridge + cookie fallback)', 'warn');
        showToast('No session token found — login may be required', 'warn');
      }
      resolveToken();
      const lbl = document.getElementById('rename-auth-label');
      if (lbl) lbl.textContent = 'Auth: ' + LAST_TOKEN_SOURCE;
      (tokenRefreshBtn as HTMLButtonElement).disabled = false;
      tokenRefreshBtn.style.opacity = '1';
    });
  };
  tokenRow.appendChild(tokenLabel); tokenRow.appendChild(tokenRefreshBtn);
  body.appendChild(tokenRow);

  // Preview
  const previewLabel = document.createElement('div');
  previewLabel.style.cssText = 'font-size:9px;color:#94a3b8;margin-bottom:3px;';
  previewLabel.textContent = 'Preview:';
  body.appendChild(previewLabel);
  const previewList = document.createElement('div');
  previewList.id = 'rename-preview-list';
  previewList.style.cssText = 'max-height:150px;overflow-y:auto;border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;background:rgba(0,0,0,.3);padding:4px;margin-bottom:8px;font-size:9px;';
  body.appendChild(previewList);

  function getStartNums() {
    return { dollar: startDollar, hash: startHash, star: startStar };
  }

  function updatePreview() {
    detectVarsAndRenderStarts();
    const template = tmplInput.value;
    const prefix = prefixCb.checked ? prefixInput.value : '';
    const suffix = suffixCb.checked ? suffixInput.value : '';
    const starts = getStartNums();
    let html = '';
    for (let j = 0; j < selected.length; j++) {
      const origName = (selected[j] as any).fullName || (selected[j] as any).name || '';
      const newName = applyRenameTemplate(template, prefix, suffix, starts, j, origName);
      html += '<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05);"><span style="color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + origName.replace(/"/g, '&quot;') + '">' + origName + '</span><span style="color:#64748b;">→</span><span style="color:#67e8f9;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;" title="' + newName.replace(/"/g, '&quot;') + '">' + newName + '</span></div>';
    }
    previewList.innerHTML = html || '<div style="color:#64748b;">No changes</div>';
  }

  tmplInput.oninput = updatePreview;
  prefixInput.oninput = updatePreview;
  suffixInput.oninput = updatePreview;
  prefixCb.onchange = updatePreview;
  suffixCb.onchange = updatePreview;
  updatePreview();

  // ETA row
  const etaRow = document.createElement('div');
  etaRow.id = 'rename-eta-row';
  etaRow.style.cssText = 'font-size:8px;color:#64748b;margin-bottom:6px;display:none;';
  body.appendChild(etaRow);

  function formatEta(ms: number): string {
    if (ms < 1000) return ms + 'ms';
    const secs = Math.ceil(ms / 1000);
    if (secs < 60) return secs + 's';
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return mins + 'm ' + (remSecs > 0 ? remSecs + 's' : '');
  }

  function updateEta(completed: number, total: number) {
    const remaining = total - completed;
    if (remaining <= 0) { etaRow.style.display = 'none'; return; }
    const perOpMs = getRenameAvgOpMs() > 0 ? getRenameAvgOpMs() : getRenameDelayMs();
    const etaMs = remaining * perOpMs;
    const avgLabel = getRenameAvgOpMs() > 0 ? ' (avg ' + getRenameAvgOpMs() + 'ms/op)' : ' (est. ' + getRenameDelayMs() + 'ms/op)';
    etaRow.style.display = 'block';
    etaRow.innerHTML = '⏱ ETA: <span style="color:#22d3ee;">' + formatEta(etaMs) + '</span> remaining — ' + remaining + ' items' + avgLabel;
  }

  function updateStaticEta() {
    const count = selected.length;
    if (count > 0) {
      const etaMs = count * getRenameDelayMs();
      etaRow.style.display = 'block';
      etaRow.innerHTML = '⏱ Est. total: <span style="color:#94a3b8;">' + formatEta(etaMs) + '</span> for ' + count + ' items @ ' + getRenameDelayMs() + 'ms delay';
    }
  }

  delaySlider.oninput = function() {
    setRenameDelayMs(parseInt(delaySlider.value, 10));
    delayVal.textContent = getRenameDelayMs() + 'ms';
    updateStaticEta();
  };
  updateStaticEta();

  // Button row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;padding:8px 10px;border-top:1px solid rgba(124,58,237,0.2);';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:4px 12px;background:rgba(100,116,139,0.3);color:#94a3b8;border:1px solid #475569;border-radius:4px;font-size:10px;cursor:pointer;';
  cancelBtn.onclick = function() { removeBulkRenameDialog(); };

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '⏹ Stop';
  stopBtn.id = 'rename-stop-btn';
  stopBtn.style.cssText = 'display:none;padding:4px 12px;background:rgba(239,68,68,0.3);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;';
  stopBtn.onclick = function() { cancelRename(); log('[Rename] Stop requested by user', 'warn'); };

  const applyBtn = document.createElement('button');
  applyBtn.id = 'ahk-loop-rename-apply';
  applyBtn.textContent = '✅ Apply';
  applyBtn.style.cssText = 'padding:4px 12px;background:#059669;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;';
  applyBtn.onclick = function() {
    const template = tmplInput.value;
    const prefix = prefixCb.checked ? prefixInput.value : '';
    const suffix = suffixCb.checked ? suffixInput.value : '';
    const starts = getStartNums();
    if (!template && !prefix && !suffix) { log('[Rename] Nothing to rename — provide template, prefix, or suffix', 'warn'); return; }
    const entries: Array<{wsId: string, oldName: string, newName: string}> = [];
    for (let j = 0; j < selected.length; j++) {
      const origName = (selected[j] as any).fullName || (selected[j] as any).name || '';
      const newName = applyRenameTemplate(template, prefix, suffix, starts, j, origName);
      if (!newName.trim()) continue;
      entries.push({ wsId: (selected[j] as any).id, oldName: origName, newName });
    }
    if (entries.length === 0) { log('[Rename] All names empty — cancelled', 'warn'); return; }
    (applyBtn as HTMLButtonElement).disabled = true;
    applyBtn.textContent = 'Renaming... 0/' + entries.length;
    applyBtn.style.background = '#64748b';
    stopBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'none';
    bulkRenameWorkspaces(entries, function(results: any, done: boolean) {
      const completed = results.success + results.failed;
      if (done) {
        const statusText = results.cancelled
          ? '⏹ Stopped: ' + results.success + '/' + results.total
          : '✅ ' + results.success + '/' + results.total + (results.failed > 0 ? ' (' + results.failed + ' failed)' : ' done');
        applyBtn.textContent = statusText;
        applyBtn.style.background = results.cancelled ? '#d97706' : results.failed > 0 ? '#d97706' : '#059669';
        stopBtn.style.display = 'none';
        etaRow.style.display = 'none';
        setTimeout(function() {
          (applyBtn as HTMLButtonElement).disabled = false;
          applyBtn.textContent = '✅ Apply';
          applyBtn.style.background = '#059669';
          cancelBtn.style.display = 'inline-block';
          updateStaticEta();
          populateLoopWorkspaceDropdown();
        }, 2000);
      } else {
        applyBtn.textContent = 'Renaming... ' + completed + '/' + results.total + (results.success > 0 ? ' ✅' + results.success : '') + (results.failed > 0 ? ' ❌' + results.failed : '');
        updateEta(completed, results.total);
      }
    });
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(stopBtn);
  btnRow.appendChild(applyBtn);
  panel.appendChild(body);
  panel.appendChild(btnRow);
  document.body.appendChild(panel);
}

/**
 * Remove bulk rename dialog and cancel any in-progress rename.
 */
export function removeBulkRenameDialog(): void {
  cancelRename();
  const d = document.getElementById('ahk-loop-rename-dialog');
  if (d) {
    if (typeof (d as any).__cleanupDrag === 'function') (d as any).__cleanupDrag();
    d.remove();
  }
}
