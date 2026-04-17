/**
 * MacroLoop Controller — Workspace Checkbox & Selection Handlers
 * Phase 5A: Extracted from ws-selection-ui.ts
 *
 * Contains: handleWsCheckboxClick, updateWsSelectionUI,
 * triggerLoopMoveFromSelection, setLoopWsNavIndex
 */

import {
  loopCreditState,
  getLoopWsCheckedIds,
  setLoopWsLastCheckedIdx,
  getLoopWsLastCheckedIdx,
  state,
} from './shared-state';
import { log } from './logging';
import { moveToWorkspace, updateLoopMoveStatus } from './workspace-management';
import { showToast } from './toast';

import { SEL_LOOP_WS_ITEM } from './constants';
import { DataAttr, DomId } from './types';

// ============================================
// CQ11/CQ17: Encapsulated keyboard navigation state
// ============================================

/** Manages keyboard navigation index for workspace list. */
class WsNavState {
  private static instance: WsNavState | null = null;
  private navIndex = -1;

  static getInstance(): WsNavState {
    if (!WsNavState.instance) {
      WsNavState.instance = new WsNavState();
    }

    return WsNavState.instance;
  }

  getIndex(): number {

    return this.navIndex;
  }

  setIndex(idx: number): void {
    this.navIndex = idx;
  }
}

/** Shorthand for singleton access. */
function navState(): WsNavState {

  return WsNavState.getInstance();
}

/** Get current keyboard navigation index in workspace list. */
export function getLoopWsNavIndex(): number { return navState().getIndex(); }

// ============================================
// Checkbox click handler (with Shift range select)
// ============================================

/** v2.148.0: check every visible row whose data-ws-idx falls within [lo,hi]. */
function checkVisibleRange(lo: number, hi: number): void {
  const listEl = document.getElementById(DomId.LoopWsList);
  if (!listEl) return;
  const visibleItems = listEl.querySelectorAll(SEL_LOOP_WS_ITEM);
  for (const item of Array.from(visibleItems)) {
    const visIdx = parseInt(item.getAttribute('data-ws-idx') || '-1', 10);
    if (visIdx < lo || visIdx > hi) continue;
    const id = item.getAttribute(DataAttr.WsId);
    if (id) getLoopWsCheckedIds()[id] = true;
  }
}

/** Toggle a single workspace's checked state. */
function toggleSingle(wsId: string): void {
  if (getLoopWsCheckedIds()[wsId]) {
    delete getLoopWsCheckedIds()[wsId];
  } else {
    getLoopWsCheckedIds()[wsId] = true;
  }
}

/**
 * Handle workspace checkbox click with Shift range-select support.
 *
 * v2.148.0: `idx` is the DOM-visible index (data-ws-idx), not the raw
 * perWorkspace index. Shift-range therefore walks only currently-rendered
 * rows, so hidden/filtered workspaces are never auto-checked.
 */
export function handleWsCheckboxClick(
  wsId: string,
  idx: number,
  isShift: boolean,
): void {
  const lastIdx = getLoopWsLastCheckedIdx();
  if (isShift && lastIdx >= 0) {
    checkVisibleRange(Math.min(lastIdx, idx), Math.max(lastIdx, idx));
  } else {
    toggleSingle(wsId);
  }
  setLoopWsLastCheckedIdx(idx);
  updateWsSelectionUI();
}

/** Sync checkbox visuals in the workspace list to match checked state. */
function syncCheckboxVisuals(): void {
  const listEl = document.getElementById(DomId.LoopWsList);
  if (!listEl) return;

  const items = listEl.querySelectorAll(SEL_LOOP_WS_ITEM);
  for (const item of items) {
    const cb = item.querySelector('.loop-ws-checkbox');
    if (!cb) continue;

    const wsId = item.getAttribute(DataAttr.WsId);
    const isChecked = !!getLoopWsCheckedIds()[wsId!];
    cb.textContent = isChecked ? '☑' : '☐';
    (cb as HTMLElement).style.color = isChecked ? '#a78bfa' : '#64748b';
  }
}

/** Update the selection count badge and rename/select-all buttons. */
function syncSelectionControls(count: number): void {
  const badge = document.getElementById('loop-ws-sel-count');
  if (badge) {
    badge.textContent = count > 0 ? count + ' selected' : '';
    badge.style.display = count > 0 ? 'inline' : 'none';
  }

  const renameBtn = document.getElementById('loop-ws-rename-btn');
  if (renameBtn) {
    renameBtn.style.display = count > 0 ? 'inline-block' : 'none';
  }

  const allBtn = document.getElementById('loop-ws-select-all-btn');
  if (allBtn) {
    const total = (loopCreditState.perWorkspace || []).length;
    allBtn.textContent = count >= total && total > 0 ? '☐ None' : '☑ All';
  }
}

/**
 * Update all workspace selection UI elements
 * (checkboxes, count badge, rename button, select-all).
 */
export function updateWsSelectionUI(): void {
  const count = Object.keys(getLoopWsCheckedIds()).length;
  syncCheckboxVisuals();
  syncSelectionControls(count);
}

/**
 * Move project to the currently selected workspace in the list.
 */
export function triggerLoopMoveFromSelection(): void {
  const selectedEl = document.getElementById('loop-ws-selected');
  let wsId = selectedEl
    ? selectedEl.getAttribute('data-selected-id')
    : '';
  let wsName = selectedEl
    ? selectedEl.getAttribute('data-selected-name')
    : '';

  // Fallback: if nothing explicitly selected, use the keyboard-navigated item
  if (!wsId) {
    const listEl = document.getElementById(DomId.LoopWsList);
    const currentNavIndex = navState().getIndex();
    if (listEl && currentNavIndex >= 0) {
      const items = listEl.querySelectorAll(SEL_LOOP_WS_ITEM);
      const navItem = items[currentNavIndex] as HTMLElement | undefined;
      if (navItem) {
        wsId = navItem.getAttribute(DataAttr.WsId) || '';
        wsName = navItem.getAttribute('data-ws-name') || '';
        log('Move fallback: using keyboard-navigated item idx=' + currentNavIndex + ' (' + wsName + ')', 'info');
      }
    }
  }

  if (!wsId) {
    log('No workspace selected for move', 'warn');
    updateLoopMoveStatus('error', 'Select a workspace first');
    showToast('Select a different workspace first, then press Move', 'warn', { noStop: true });
    return;
  }

  const currentWorkspaceName = (state.workspaceName || '').trim().toLowerCase();
  const targetWorkspaceName = (wsName || '').trim().toLowerCase();
  if (currentWorkspaceName && targetWorkspaceName && currentWorkspaceName === targetWorkspaceName) {
    log('Move blocked: target workspace is already current -> ' + wsName, 'warn');
    updateLoopMoveStatus('error', 'Already on this workspace');
    showToast('You are already in this workspace — select a different one', 'info', { noStop: true });
    return;
  }

  log(
    'Moving project to workspace=' + wsId + ' (' + wsName + ')',
    'delegate',
  );
  moveToWorkspace(wsId, wsName || '');
}

/** Apply active highlight styles to a navigated workspace row. */
function highlightActiveItem(item: Element): void {
  const el = item as HTMLElement;
  el.style.background = 'linear-gradient(90deg, rgba(139,92,246,0.35) 0%, rgba(59,130,246,0.18) 100%)';
  el.style.outline = '2px solid #a78bfa';
  el.style.outlineOffset = '-2px';
  el.style.borderRadius = '6px';
  el.style.boxShadow = '0 0 8px rgba(139,92,246,0.3)';
  item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Update the selected-workspace indicator element from the active item. */
function updateSelectedIndicator(item: Element): void {
  const selectedEl = document.getElementById('loop-ws-selected');
  if (!selectedEl) return;

  const wsId = item.getAttribute(DataAttr.WsId) || '';
  const wsName = item.getAttribute('data-ws-name') || '';
  selectedEl.setAttribute('data-selected-id', wsId);
  selectedEl.setAttribute('data-selected-name', wsName);
  selectedEl.textContent = '➜ ' + wsName;
  selectedEl.style.color = '#facc15';
  selectedEl.style.fontWeight = '700';
  selectedEl.style.fontSize = '12px';
  selectedEl.style.textShadow = '0 0 6px rgba(250,204,21,0.4)';
}

/** Reset a non-active workspace row to its default styles. */
function resetItemStyles(item: Element): void {
  const el = item as HTMLElement;
  const isCurrent = item.getAttribute('data-ws-current') === 'true';
  el.style.outline = 'none';
  el.style.outlineOffset = '';
  el.style.borderRadius = '';
  el.style.boxShadow = 'none';
  el.style.background = isCurrent ? 'rgba(139,92,246,0.15)' : 'transparent';
}

/**
 * Set keyboard navigation index in workspace list and highlight the row.
 */
export function setLoopWsNavIndex(idx: number): void {
  navState().setIndex(idx);
  const listEl = document.getElementById(DomId.LoopWsList);
  if (!listEl) return;

  const items = listEl.querySelectorAll(SEL_LOOP_WS_ITEM);
  for (const [itemIndex, item] of Array.from(items).entries()) {
    if (itemIndex !== idx) {
      resetItemStyles(item);
      continue;
    }
    highlightActiveItem(item);
    updateSelectedIndicator(item);
  }
}
