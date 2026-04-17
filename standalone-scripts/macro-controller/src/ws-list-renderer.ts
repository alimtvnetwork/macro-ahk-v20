/**
 * MacroLoop Controller — Workspace List Renderer & Dropdown Populator
 * Phase 5A: Extracted from ws-selection-ui.ts
 *
 * Contains: renderLoopWorkspaceList, populateLoopWorkspaceDropdown,
 * invalidateWsDropdownHash, wsRenderStats, buildLoopTooltipText,
 * local state (compact mode, free-only filter)
 */

import type {
  WorkspaceCredit,
  HTMLElementWithHandlers,
} from './types';
import {
  loopCreditState,
  state,
  getLoopWsCheckedIds,
  cPrimaryLight,
  cPrimaryHL,
  cPrimaryBgAL,
} from './shared-state';
import { log } from './logging';
import { calcTotalCredits, renderCreditBar } from './credit-api';
import { fetchLoopCredits, WS_TIER_LABELS, isExpiredWs, expiredDays } from './credit-fetch';
import { moveToWorkspace } from './workspace-management';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import {
  handleWsCheckboxClick,
  setLoopWsNavIndex,
} from './ws-checkbox-handler';
import { showWsContextMenu } from './ws-context-menu';
import { logError } from './error-utils';

// ── Centralized constants ──
import { SEL_LOOP_WS_ITEM } from './constants';
import { DataAttr, DomId } from './types';

// ============================================
// CQ11/CQ17: Encapsulated view-filter state
// ============================================

/** Manages workspace list view state (compact mode, free-only filter, expired-with-credits filter). */
class WsListViewState {
  private static instance: WsListViewState | null = null;
  private isFreeOnly = false;
  private isExpiredWithCredits = false;
  private isCompactMode: boolean;

  private constructor() {
    this.isCompactMode = this.loadCompactMode();
  }

  static getInstance(): WsListViewState {
    if (!WsListViewState.instance) {
      WsListViewState.instance = new WsListViewState();
    }

    return WsListViewState.instance;
  }

  private loadCompactMode(): boolean {
    try {
      const stored: string | null = localStorage.getItem('ml_compact_mode');

      return stored === null ? true : stored === 'true';
    } catch (e: unknown) {

      logError('getExpanded', 'Failed to read expanded state from localStorage', e);

      return true;
    }
  }

  getCompactMode(): boolean {

    return this.isCompactMode;
  }

  setCompactMode(val: boolean): void {
    this.isCompactMode = val;
  }

  getFreeOnly(): boolean {

    return this.isFreeOnly;
  }

  setFreeOnly(val: boolean): void {
    this.isFreeOnly = val;
  }

  getExpiredWithCredits(): boolean {

    return this.isExpiredWithCredits;
  }

  setExpiredWithCredits(val: boolean): void {
    this.isExpiredWithCredits = val;
  }
}

/** Shorthand for singleton access. */
function viewState(): WsListViewState {

  return WsListViewState.getInstance();
}

/** Get compact mode state. */
export function getLoopWsCompactMode(): boolean { return viewState().getCompactMode(); }

/** Set compact mode state. */
export function setLoopWsCompactMode(val: boolean): void { viewState().setCompactMode(val); }

/** Get free-only filter state. */
export function getLoopWsFreeOnly(): boolean { return viewState().getFreeOnly(); }

/** Set free-only filter state. */
export function setLoopWsFreeOnly(val: boolean): void { viewState().setFreeOnly(val); }

/**
 * Minimum `available` credit threshold for a workspace to surface in the
 * "Expired with credits" filter. Workspaces marked EXPIRED but holding
 * more than this many credits are recovery candidates worth reviewing.
 */
export const EXPIRED_WITH_CREDITS_MIN = 5;

/** Get expired-with-credits filter state. */
export function getLoopWsExpiredWithCredits(): boolean {
  return viewState().getExpiredWithCredits();
}

/** Set expired-with-credits filter state. */
export function setLoopWsExpiredWithCredits(val: boolean): void {
  viewState().setExpiredWithCredits(val);
}

// ============================================
// Helper: fetch credits with auto-detect (used by ws-context-menu)
// ============================================
export function fetchLoopCreditsWithDetect(isRetry?: boolean): void {
  fetchLoopCredits(isRetry, autoDetectLoopCurrentWorkspace);
}

/**
 * Build detailed tooltip text for a workspace row.
 */
export function buildLoopTooltipText(ws: WorkspaceCredit): string {
  const lines: string[] = [];
  lines.push('━━━ ' + (ws.fullName || ws.name) + ' ━━━');
  lines.push('');
  lines.push('📊 CALCULATED:');
  lines.push('  🆓 Daily Free: ' + (ws.dailyFree || 0) + ' (' + ws.dailyLimit + ' - ' + ws.dailyUsed + ')');
  lines.push('  🔄 Rollover: ' + (ws.rollover || 0) + ' (' + ws.rolloverLimit + ' - ' + ws.rolloverUsed + ')');
  lines.push('  💰 Available: ' + (ws.available || 0) + ' (total:' + (ws.totalCredits || 0) + ' - rUsed:' + (ws.rolloverUsed || 0) + ' - dUsed:' + (ws.dailyUsed || 0) + ' - bUsed:' + (ws.used || 0) + ')');
  lines.push('  📦 Billing Only: ' + (ws.billingAvailable || 0) + ' (' + ws.limit + ' - ' + ws.used + ')');
  const _tc = ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit);
  lines.push('  ⚡ Total Credits: ' + _tc + ' (granted:' + (ws.freeGranted || 0) + ' + daily:' + (ws.dailyLimit || 0) + ' + billing:' + (ws.limit || 0) + ' + topup:' + (ws.topupLimit || 0) + ' + rollover:' + (ws.rolloverLimit || 0) + ')');
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

/** Active filter state used during rendering. */
interface WsFilterState {
  filter: string;
  freeOnly: boolean;
  rolloverOnly: boolean;
  billingOnly: boolean;
  minCredits: number;
  expiredWithCredits: boolean;
}

/** Read filter state from DOM elements once, outside the loop. */
function readFilterState(filter: string): WsFilterState {
  const rolloverEl = document.getElementById('loop-ws-rollover-filter');
  const billingEl = document.getElementById('loop-ws-billing-filter');
  const minEl = document.getElementById('loop-ws-min-credits');
  return {
    filter,
    freeOnly: viewState().getFreeOnly(),
    rolloverOnly: rolloverEl?.getAttribute(DataAttr.Active) === 'true',
    billingOnly: billingEl?.getAttribute(DataAttr.Active) === 'true',
    minCredits: minEl ? parseInt((minEl as HTMLInputElement).value, 10) || 0 : 0,
    expiredWithCredits: viewState().getExpiredWithCredits(),
  };
}

/** Check if a workspace matches the current name (fuzzy). */
function isCurrentWorkspace(ws: WorkspaceCredit, currentName: string): boolean {
  if (!currentName) return false;
  if (ws.fullName === currentName || ws.name === currentName) return true;
  const lcn = currentName.toLowerCase();
  return (ws.fullName || '').toLowerCase().indexOf(lcn) !== -1 ||
         lcn.indexOf((ws.fullName || '').toLowerCase()) !== -1;
}

/** Check if a workspace passes all active filters. */
function passesFilters(ws: WorkspaceCredit, fs: WsFilterState): boolean {
  const matchesText = !fs.filter ||
    ws.fullName.toLowerCase().indexOf(fs.filter.toLowerCase()) !== -1 ||
    ws.name.toLowerCase().indexOf(fs.filter.toLowerCase()) !== -1;
  if (!matchesText) return false;
  if (fs.freeOnly && (ws.dailyFree || 0) <= 0) return false;
  if (fs.rolloverOnly && (ws.rollover || 0) <= 0) return false;
  if (fs.billingOnly && (ws.billingAvailable || 0) <= 0) return false;
  if (fs.minCredits > 0 && (ws.available || 0) < fs.minCredits) return false;
  if (fs.expiredWithCredits) {
    if (!isExpiredWs(ws)) return false;
    if ((ws.available || 0) <= EXPIRED_WITH_CREDITS_MIN) return false;
  }
  return true;
}

/** Resolve the status emoji for a workspace row. */
function wsStatusEmoji(isCurrent: boolean, available: number, limitInt: number): string {
  if (isCurrent) return '📍';
  if (available <= 0) return '🔴';
  if (available <= limitInt * 0.2) return '🟡';
  return '🟢';
}

/** Compute row background style. */
function wsRowBgStyle(isCurrent: boolean, isSel: boolean): string {
  if (isCurrent) return 'background:' + cPrimaryHL + ';border-left:3px solid #a78bfa;';
  return isSel ? 'border-left:3px solid #facc15;' : 'border-left:3px solid transparent;';
}

/** Build the inner HTML for a workspace row. */
function buildWsRowInnerHtml(
  ws: WorkspaceCredit, isCurrent: boolean, isChecked: boolean,
  emoji: string, creditBarHtml: string,
): string {
  const wsTier = ws.tier || 'FREE';
  const tierMeta = WS_TIER_LABELS[wsTier] || WS_TIER_LABELS['FREE'];
  let tierBadge = '<span style="font-size:7px;color:' + tierMeta.fg + ';background:' + tierMeta.bg + ';padding:0 3px;border-radius:2px;font-weight:700;margin-left:4px;vertical-align:middle;">' + tierMeta.label + '</span>';
  // For EXPIRED workspaces, append a subtle "·Nd" day-count chip so the user
  // can see how long the workspace has been in the expired state.
  if (wsTier === 'EXPIRED') {
    const days = expiredDays(ws);
    if (days !== null) {
      tierBadge += '<span style="font-size:7px;color:#fca5a5;background:rgba(127,29,29,0.45);padding:0 3px;border-radius:2px;font-weight:600;margin-left:2px;vertical-align:middle;" title="Days since subscription_status_changed_at">·' + days + 'd</span>';
    }
  }
  const nameColor = isCurrent ? '#67e8f9' : '#e2e8f0';
  const nameBold = isCurrent ? 'font-weight:800;' : 'font-weight:500;';

  let html = '<span class="loop-ws-checkbox" style="font-size:11px;cursor:pointer;color:' + (isChecked ? '#a78bfa' : '#64748b') + ';user-select:none;flex-shrink:0;">' + (isChecked ? '☑' : '☐') + '</span>'
    + '<span style="font-size:12px;">' + emoji + '</span>'
    + '<div style="flex:1;min-width:0;">'
    + '<div class="loop-ws-name" style="color:' + nameColor + ';font-size:11px;' + nameBold + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (ws.fullName || ws.name) + tierBadge + '</div>'
    + '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">' + creditBarHtml + '</div>'
    + '</div>';
  if (isCurrent) {
    html += '<span style="font-size:8px;color:' + cPrimaryLight + ';background:' + cPrimaryBgAL + ';padding:1px 4px;border-radius:3px;font-weight:700;">NOW</span>';
  }
  return html;
}

/** Build a single workspace row DOM element. */
function buildWsRow(
  ws: WorkspaceCredit, wsIndex: number, isCurrent: boolean,
  count: number, maxTotalCredits: number,
): HTMLDivElement {
  const available = Math.round(ws.available || 0);
  const limitInt = Math.round(ws.limit || 0);
  const emoji = wsStatusEmoji(isCurrent, available, limitInt);
  const wsId = String(ws.id || (ws.raw && ws.raw.id) || '');
  const selEl = document.getElementById(DomId.LoopWsSelected);
  const isSel = selEl ? selEl.getAttribute(DataAttr.SelectedId) === wsId : false;
  const isChecked = !!getLoopWsCheckedIds()[wsId];
  const tooltip = buildLoopTooltipText(ws).replace(/"/g, '&quot;');

  const row = document.createElement('div');
  row.className = 'loop-ws-item';
  row.setAttribute(DataAttr.WsId, wsId);
  row.setAttribute(DataAttr.WsName, ws.fullName || ws.name);
  row.setAttribute(DataAttr.WsCurrent, isCurrent ? 'true' : 'false');
  row.setAttribute('data-ws-idx', String(count));
  row.setAttribute('data-ws-raw-idx', String(wsIndex));
  row.title = tooltip;
  row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 6px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);transition:background 0.15s;font-size:11px;' + wsRowBgStyle(isCurrent, isSel);

  const dailyFree = Math.round(ws.dailyFree || 0);
  const rollover = Math.round(ws.rollover || 0);
  const billingAvail = Math.round(ws.billingAvailable || 0);
  const totalCap = Math.round(ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit));
  const creditBarHtml = renderCreditBar({
    totalCredits: totalCap, available: Math.round(ws.available || 0), totalUsed: ws.totalCreditsUsed || 0,
    freeRemaining: Math.round(ws.freeRemaining || 0), billingAvail, rollover, dailyFree,
    compact: viewState().getCompactMode(), maxTotalCredits,
  });

  row.innerHTML = buildWsRowInnerHtml(ws, isCurrent, isChecked, emoji, creditBarHtml);
  return row;
}

/**
 * Render the workspace list with filtering, credit bars, and event delegation.
 */
export function renderLoopWorkspaceList(
  workspaces: WorkspaceCredit[],
  currentName: string,
  filter: string,
): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;

  let count = 0;
  let currentIdx = -1;
  let maxTotalCredits = 0;

  for (const ws of workspaces) {
    const mtc = Math.round(ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit));
    if (mtc > maxTotalCredits) maxTotalCredits = mtc;
  }

  const frag = document.createDocumentFragment();
  const fs = readFilterState(filter);

  // Collect surviving rows first so we can optionally re-order them.
  // (We keep the original wsIndex so checkbox state / nav indices stay stable.)
  const survivors: Array<{ ws: WorkspaceCredit; wsIndex: number }> = [];
  for (const [wsIndex, ws] of workspaces.entries()) {
    if (!passesFilters(ws, fs)) continue;
    survivors.push({ ws, wsIndex });
  }

  // When the "expired with credits" filter is the active intent, surface the
  // highest-credit recovery candidates first so users can prioritise them.
  if (fs.expiredWithCredits) {
    survivors.sort(function (a, b) {
      return (b.ws.available || 0) - (a.ws.available || 0);
    });
  }

  for (const { ws, wsIndex } of survivors) {
    const isCurrent = isCurrentWorkspace(ws, currentName);
    if (isCurrent) currentIdx = count;
    frag.appendChild(buildWsRow(ws, wsIndex, isCurrent, count, maxTotalCredits));
    count++;
  }

  if (count === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.style.cssText = 'padding:8px;color:' + cPrimaryLight + ';font-size:10px;text-align:center;';
    emptyEl.textContent = '🔍 No matches';
    frag.appendChild(emptyEl);
  }

  listEl.innerHTML = '';
  listEl.appendChild(frag);

  const countLabel = document.getElementById('loop-ws-count-label');
  if (countLabel) {
    const total = workspaces.length;
    countLabel.textContent = (filter || getLoopWsFreeOnly() || getLoopWsExpiredWithCredits() || count !== total)
      ? 'Workspaces (' + count + '/' + total + ')'
      : 'Workspaces (' + total + ')';
  }

  attachWsListEventDelegation(listEl, currentIdx, filter);
}

/**
 * Attach event delegation handlers on the workspace list container.
 */
function attachWsListEventDelegation(
  listEl: HTMLElement,
  currentIdx: number,
  filter: string,
): void {
  const elWithHandlers = listEl as HTMLElementWithHandlers;

  if (elWithHandlers._wsDelegateHandler) {
    listEl.removeEventListener('click', elWithHandlers._wsDelegateHandler);
    listEl.removeEventListener('dblclick', elWithHandlers._wsDblHandler!);
    listEl.removeEventListener('contextmenu', elWithHandlers._wsCtxHandler!);
    listEl.removeEventListener('mouseover', elWithHandlers._wsHoverHandler!);
    listEl.removeEventListener('mouseout', elWithHandlers._wsOutHandler!);
  }

  elWithHandlers._wsDelegateHandler = _createClickHandler();
  elWithHandlers._wsDblHandler = _createDblClickHandler();
  elWithHandlers._wsCtxHandler = _createCtxHandler();
  elWithHandlers._wsHoverHandler = _createHoverHandler();
  elWithHandlers._wsOutHandler = _createOutHandler();

  listEl.addEventListener('click', elWithHandlers._wsDelegateHandler);
  listEl.addEventListener('dblclick', elWithHandlers._wsDblHandler);
  listEl.addEventListener('contextmenu', elWithHandlers._wsCtxHandler);
  listEl.addEventListener('mouseover', elWithHandlers._wsHoverHandler);
  listEl.addEventListener('mouseout', elWithHandlers._wsOutHandler);

  // Auto-scroll to current workspace, but do NOT auto-select it as a move target.
  // This avoids a misleading no-op where the Move button targets the current workspace.
  if (currentIdx >= 0 && !filter) {
    setTimeout(function () {
      const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
      if (currentItem) {
        currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }
}

function _createClickHandler(): (e: MouseEvent) => void {
  return function (e: MouseEvent) {
    const item = (e.target as HTMLElement).closest(SEL_LOOP_WS_ITEM) as HTMLElement | null;
    if (!item) return;
    if ((e.target as HTMLElement).classList && (e.target as HTMLElement).classList.contains('loop-ws-checkbox')) {
      e.preventDefault();
      e.stopPropagation();
      // v2.148.0: pass DOM-visible index so shift-click range respects active filters
      handleWsCheckboxClick(
        item.getAttribute(DataAttr.WsId) || '',
        parseInt(item.getAttribute('data-ws-idx') || '0', 10),
        e.shiftKey,
      );
      return;
    }
    setLoopWsNavIndex(parseInt(item.getAttribute('data-ws-idx') || '0', 10));
    log('Selected workspace: ' + item.getAttribute(DataAttr.WsName), 'success');
  };
}

function _createDblClickHandler(): (e: MouseEvent) => void {
  return function (e: MouseEvent) {
    const item = (e.target as HTMLElement).closest(SEL_LOOP_WS_ITEM) as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    if (item.getAttribute(DataAttr.WsCurrent) === 'true') {
      log('Double-click on current workspace "' + item.getAttribute(DataAttr.WsName) + '" — no move needed', 'warn');
      return;
    }
    log('Double-click move -> ' + item.getAttribute(DataAttr.WsName) + ' (id=' + item.getAttribute(DataAttr.WsId) + ')', 'delegate');
    moveToWorkspace(item.getAttribute(DataAttr.WsId) || '', item.getAttribute(DataAttr.WsName) || '');
  };
}

function _createCtxHandler(): (e: MouseEvent) => void {
  return function (e: MouseEvent) {
    const item = (e.target as HTMLElement).closest(SEL_LOOP_WS_ITEM) as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    showWsContextMenu(
      item.getAttribute(DataAttr.WsId) || '',
      item.getAttribute(DataAttr.WsName) || '',
      e.clientX, e.clientY,
    );
  };
}

function _createHoverHandler(): (e: MouseEvent) => void {
  return function (e: MouseEvent) {
    const item = (e.target as HTMLElement).closest(SEL_LOOP_WS_ITEM) as HTMLElement | null;
    if (!item || item.getAttribute(DataAttr.WsCurrent) === 'true') return;
    const selEl = document.getElementById(DomId.LoopWsSelected);
    const selId = selEl ? selEl.getAttribute(DataAttr.SelectedId) : '';
    const itemId = item.getAttribute(DataAttr.WsId);
    if (selId && selId === itemId) return;
    item.style.background = 'rgba(59,130,246,0.15)';
  };
}

function _createOutHandler(): (e: MouseEvent) => void {
  return function (e: MouseEvent) {
    const item = (e.target as HTMLElement).closest(SEL_LOOP_WS_ITEM) as HTMLElement | null;
    if (!item || item.getAttribute(DataAttr.WsCurrent) === 'true') return;
    const selEl = document.getElementById(DomId.LoopWsSelected);
    const selId = selEl ? selEl.getAttribute(DataAttr.SelectedId) : '';
    const itemId = item.getAttribute(DataAttr.WsId);
    if (selId && selId === itemId) return;
    item.style.background = 'transparent';
  };
}
// ============================================

/** Manages dropdown hash and render stats for dirty-flag optimization. */
class WsDropdownState {
  private static instance: WsDropdownState | null = null;
  private hash = '';
  private renderSkipped = 0;
  private renderExecuted = 0;

  static getInstance(): WsDropdownState {
    if (!WsDropdownState.instance) {
      WsDropdownState.instance = new WsDropdownState();
    }

    return WsDropdownState.instance;
  }

  getHash(): string {

    return this.hash;
  }

  setHash(val: string): void {
    this.hash = val;
  }

  invalidate(): void {
    this.hash = '';
  }

  recordSkip(): void {
    this.renderSkipped++;
  }

  recordExecution(): void {
    this.renderExecuted++;
  }

  get stats(): { skipped: number; executed: number } {

    return { skipped: this.renderSkipped, executed: this.renderExecuted };
  }
}

/** Shorthand for singleton access. */
function dropdownState(): WsDropdownState {

  return WsDropdownState.getInstance();
}

/** P1 performance counters — facade object with live getters */
export const wsRenderStats = {
  get skipped() { return dropdownState().stats.skipped; },
  get executed() { return dropdownState().stats.executed; },
};

/**
 * Populate workspace dropdown — dirty-flag guard to skip re-render when unchanged.
 */
export function populateLoopWorkspaceDropdown(): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const workspaces = loopCreditState.perWorkspace || [];
  if (workspaces.length === 0) {
    if (dropdownState().getHash() === '_empty') { dropdownState().recordSkip(); return; }
    dropdownState().setHash('_empty');
    dropdownState().recordExecution();
    listEl.innerHTML = '<div style="padding:6px;color:' + cPrimaryLight + ';font-size:10px;">📭 No workspaces loaded — click 💰 Credits to retry</div>';

    return;
  }
  const currentName = state.workspaceName || '';
  const searchEl = document.getElementById('loop-ws-search');
  const filter = searchEl ? (searchEl as HTMLInputElement).value.trim() : '';

  // P1 fix: comprehensive hash including all view/filter/credit state
  const rolloverEl = document.getElementById('loop-ws-rollover-filter');
  const billingEl = document.getElementById('loop-ws-billing-filter');
  const minCreditsEl = document.getElementById('loop-ws-min-credits');
  const checkedCount = Object.keys(getLoopWsCheckedIds()).length;

  const hash = [
    workspaces.length,
    currentName,
    filter,
    loopCreditState.lastCheckedAt || 0,
    viewState().getFreeOnly() ? 1 : 0,
    viewState().getCompactMode() ? 1 : 0,
    rolloverEl ? rolloverEl.getAttribute(DataAttr.Active) : '',
    billingEl ? billingEl.getAttribute(DataAttr.Active) : '',
    minCreditsEl ? (minCreditsEl as HTMLInputElement).value : '',
    checkedCount,
  ].join('|');

  if (hash === dropdownState().getHash()) { dropdownState().recordSkip(); return; }
  dropdownState().setHash(hash);
  dropdownState().recordExecution();
  renderLoopWorkspaceList(workspaces, currentName, filter);
  log(
    'Workspace dropdown populated: ' + workspaces.length +
    ' workspaces (rendered:' + wsRenderStats.executed +
    ' skipped:' + wsRenderStats.skipped + ')',
    'success',
  );
}

/** Force-invalidate the dropdown hash so the next populate call re-renders. */
export function invalidateWsDropdownHash(): void {
  dropdownState().invalidate();
}
