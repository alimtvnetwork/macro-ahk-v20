/**
 * UI Status Renderer — Status bar, credit bars, progress display
 *
 * Phase 5 split from ui/ui-updaters.ts.
 * Contains: updateStatus (dirty-flag guard, credit bar cache, DOM sub-elements)
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { clearSkeletons } from './skeleton';
import { IDS, TIMING, state, loopCreditState, cWarning, tFontTiny } from '../shared-state';
import { calcTotalCredits, calcAvailableCredits, renderCreditBar } from '../credit-api';

// ============================================
// StatusRenderState — encapsulated render state (CQ11, CQ17)
// ============================================

class StatusRenderState {
  private _lastStatusKey = '';
  private _recordDot: HTMLSpanElement | null = null;
  private _recordLabel: Text | null = null;

  /** P1 performance counters — tracks dirty-flag effectiveness for status bar */
  readonly stats = { skipped: 0, executed: 0 };

  get lastStatusKey(): string { return this._lastStatusKey; }
  set lastStatusKey(value: string) { this._lastStatusKey = value; }

  get recordDot(): HTMLSpanElement | null { return this._recordDot; }
  set recordDot(value: HTMLSpanElement | null) { this._recordDot = value; }

  get recordLabel(): Text | null { return this._recordLabel; }
  set recordLabel(value: Text | null) { this._recordLabel = value; }
}

const statusRenderState = new StatusRenderState();

/** P1 performance counters — tracks dirty-flag effectiveness for status bar */
export const statusRenderStats = statusRenderState.stats;

/**
 * Update the status panel with current loop state, credit bars, and workspace info.
 * Uses a dirty-flag guard to skip innerHTML rebuilds when nothing changed.
 */
export function updateStatus(): void {
  const el = document.getElementById(IDS.STATUS);
  if (!el) return;

  // Clear skeleton placeholders on first real data hydration
  clearSkeletons(el);

  // Build a lightweight fingerprint of all values that affect the status HTML
  const statusKey = [
    state.running ? 1 : 0,
    state.workspaceName || '',
    state.workspaceJustChanged ? 1 : 0,
    state.direction,
    state.cycleCount,
    state.isIdle ? 1 : 0,
    state.isDelegating ? 1 : 0,
    state.forceDirection || '',
    state.hasFreeCredit ? 1 : 0,
    state.lastStatusCheck,
    loopCreditState.lastCheckedAt || 0,
    loopCreditState.currentWs ? loopCreditState.currentWs.name : '',
    (loopCreditState.perWorkspace || []).length
  ].join('|');

  // Skip innerHTML rebuild if nothing changed
  if (statusKey === statusRenderState.lastStatusKey) { statusRenderStats.skipped++; return; }
  statusRenderState.lastStatusKey = statusKey;
  statusRenderStats.executed++;

  const creditBarsHtml = buildCreditBarsHtml();

  // Ensure persistent sub-elements exist
  let statusLine = document.getElementById('marco-status-line');
  let progressContainer = document.getElementById('marco-progress-container');
  let creditContainer = document.getElementById('marco-credit-container');
  if (!statusLine || !progressContainer || !creditContainer) {
    el.innerHTML = '';
    statusLine = document.createElement('div');
    statusLine.id = 'marco-status-line';
    statusLine.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;';
    progressContainer = document.createElement('div');
    progressContainer.id = 'marco-progress-container';
    creditContainer = document.createElement('div');
    creditContainer.id = 'marco-credit-container';
    el.appendChild(statusLine);
    el.appendChild(progressContainer);
    el.appendChild(creditContainer);
  }

  // Credit bars (innerHTML OK — cached via MC-03, changes rarely)
  if (creditContainer.dataset.cacheKey !== (window._creditBarCache?.key || '')) {
    creditContainer.innerHTML = creditBarsHtml;
    creditContainer.dataset.cacheKey = window._creditBarCache?.key || '';
  }

  if (state.running) {
    renderRunningStatus(statusLine, progressContainer);
  } else {
    renderStoppedStatus(statusLine, progressContainer);
  }
}

function buildCreditBarsHtml(): string {
  if (!loopCreditState.lastCheckedAt) return '';

  const cacheKey = (loopCreditState.lastCheckedAt || 0) + '|' + (loopCreditState.currentWs ? loopCreditState.currentWs.name : '');
  if (window._creditBarCache && window._creditBarCache.key === cacheKey) {
    return window._creditBarCache.html;
  }

  const cws = loopCreditState.currentWs;
  if (!cws) return '';

  const df = Math.round(cws.dailyFree || 0);
  const ro = Math.round(cws.rollover || 0);
  const ba = Math.round(cws.billingAvailable || 0);
  const fr = Math.round(cws.freeRemaining || 0);
  const _totalCapacity = Math.round(cws.totalCredits || calcTotalCredits(cws.freeGranted, cws.dailyLimit, cws.limit, cws.topupLimit, cws.rolloverLimit));
  const _availTotal = Math.round(cws.available || calcAvailableCredits(_totalCapacity, cws.rolloverUsed, cws.dailyUsed, cws.used, (cws.freeGranted || 0) - (cws.freeRemaining || 0)));
  const _perWs = loopCreditState.perWorkspace || [];
  let _maxTc = 0;
  for (const _ws of _perWs) {
    const _mtc = Math.round(_ws.totalCredits || calcTotalCredits(_ws.freeGranted, _ws.dailyLimit, _ws.limit, _ws.topupLimit, _ws.rolloverLimit));
    if (_mtc > _maxTc) _maxTc = _mtc;
  }

  const html = renderCreditBar({
    totalCredits: _totalCapacity, available: _availTotal, totalUsed: cws.totalCreditsUsed || 0,
    freeRemaining: fr, billingAvail: ba, rollover: ro, dailyFree: df,
    compact: false, marginTop: '4px', maxTotalCredits: _maxTc
  });
  window._creditBarCache = { key: cacheKey, html };
  return html;
}

function renderRunningStatus(statusLine: HTMLElement, progressContainer: HTMLElement): void {
  const hasFreeCredit = !state.isIdle;
  const creditIcon = hasFreeCredit ? '[Y]' : '[N]';
  const creditLabel = hasFreeCredit ? 'Free Credit' : 'No Credit';
  const delegateText = buildDelegateText();

  statusLine.textContent = '';
  const parts = buildRunningStatusParts(creditIcon, creditLabel, delegateText);
  for (const p of parts) {
    const span = document.createElement('span');
    span.textContent = p.text;
    if (p.color) span.style.color = p.color;
    if (p.bold) span.style.fontWeight = '700';
    if (p.id) span.id = p.id;
    statusLine.appendChild(span);
  }

  renderProgressBar(progressContainer);
}

function buildDelegateText(): string {
  if (!state.isDelegating) return '';
  return state.forceDirection
    ? ' | FORCE ' + state.forceDirection.toUpperCase()
    : ' | SWITCHING...';
}

function buildRunningStatusParts(creditIcon: string, creditLabel: string, delegateText: string): Array<{ text: string; color?: string; bold?: boolean; id?: string }> {
  const parts: Array<{ text: string; color?: string; bold?: boolean; id?: string }> = [];
  if (state.workspaceName) {
    parts.push({ text: state.workspaceName, color: '#fbbf24', bold: true });
    if (state.workspaceJustChanged) parts.push({ text: ' ⚡ WS Changed', color: '#f97316', bold: true });
    parts.push({ text: ' | ' });
  }
  parts.push({ text: '● ', color: '#10b981' });
  parts.push({ text: state.direction.toUpperCase() + ' | #' + state.cycleCount + ' | ' });
  parts.push({ text: creditIcon + ' ' + creditLabel, color: '#fbbf24' });
  parts.push({ text: ' | ' });
  parts.push({ text: state.countdown + 's', color: '#fbbf24', bold: true, id: 'marco-countdown-text' });
  if (delegateText) {
    const dColor = state.forceDirection ? '#f97316' : '#3b82f6';
    parts.push({ text: delegateText, color: dColor, bold: !!state.forceDirection });
  }
  return parts;
}

function renderProgressBar(progressContainer: HTMLElement): void {
  // Progress bar
  const totalSec = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - state.countdown) / totalSec) * 100)) : 0;
  const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981';
  let barEl = document.getElementById('marco-progress-bar');
  if (!barEl) {
    progressContainer.innerHTML = '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">'
      + '<div id="marco-progress-bar" style="width:0%;height:100%;border-radius:3px;transition:width 0.8s linear;"></div></div>';
    barEl = document.getElementById('marco-progress-bar');
  }
  if (barEl) {
    barEl.style.width = pct + '%';
    barEl.style.background = barColor;
  }
}

function renderStoppedStatus(statusLine: HTMLElement, progressContainer: HTMLElement): void {
  statusLine.textContent = '';

  // Always show workspace name — resolved from API via state.workspaceName or loopCreditState.currentWs
  const wsName = state.workspaceName
    || (loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '');

  if (wsName) {
    const wsSpan = document.createElement('span');
    wsSpan.textContent = wsName;
    wsSpan.style.cssText = 'color:#fbbf24;font-weight:700;';
    statusLine.appendChild(wsSpan);
    statusLine.appendChild(document.createTextNode(' | '));
  }
  const stopIcon = document.createElement('span');
  stopIcon.textContent = '[=]';
  stopIcon.style.color = '#9ca3af';
  statusLine.appendChild(stopIcon);
  statusLine.appendChild(document.createTextNode(' Stopped | Cycles: ' + state.cycleCount));
  if (state.lastStatusCheck > 0) {
    const creditIconStop = state.hasFreeCredit ? '[Y]' : '[N]';
    const creditLabelStop = state.hasFreeCredit ? 'Free Credit' : 'No Credit';
    const creditSpan = document.createElement('span');
    creditSpan.textContent = ' | ' + creditIconStop + ' ' + creditLabelStop;
    creditSpan.style.color = '#fbbf24';
    statusLine.appendChild(creditSpan);
  }
  const hasWorkspaces = (loopCreditState.perWorkspace || []).length > 0;
  if (!wsName && !hasWorkspaces) {
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:4px;font-size:' + tFontTiny + ';color:' + cWarning + ';';
    hint.textContent = '⏳ Loading workspaces… Click ☑ Check or 💰 Credits to retry';
    statusLine.appendChild(hint);
  } else if (!wsName && hasWorkspaces) {
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:4px;font-size:' + tFontTiny + ';color:' + cWarning + ';';
    hint.textContent = '⚠️ Workspace not detected — click ☑ Check to identify current workspace';
    statusLine.appendChild(hint);
  }
  // Clear progress bar when stopped
  progressContainer.innerHTML = '';
}

/**
 * Update the recording indicator (red dot + LOOP / SWITCHING / FORCE badge).
 */
function ensureRecordChildren(el: HTMLElement): { dot: HTMLSpanElement; label: Text } {
  const currentDot = statusRenderState.recordDot;

  if (!currentDot || !el.contains(currentDot)) {
    el.textContent = '';
    const dot = document.createElement('span');
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;display:inline-block;';
    const label = document.createTextNode('');
    el.appendChild(dot);
    el.appendChild(label);
    statusRenderState.recordDot = dot;
    statusRenderState.recordLabel = label;
  }

  return { dot: statusRenderState.recordDot!, label: statusRenderState.recordLabel! };
}

export function updateRecordIndicator(): void {
  const el = document.getElementById(IDS.RECORD_INDICATOR);
  if (!el) return;

  if (state.running) {
    el.style.display = 'flex';
    const { dot, label } = ensureRecordChildren(el);
    if (state.isDelegating) {
      if (state.forceDirection) {
        dot.style.background = '#f97316';
        label.textContent = ' FORCE ' + state.forceDirection.toUpperCase();
        el.style.background = '#c2410c';
      } else {
        dot.style.background = '#3b82f6';
        label.textContent = ' SWITCHING';
        el.style.background = '#1d4ed8';
      }
    } else {
      dot.style.background = '#fff';
      label.textContent = ' LOOP';
      el.style.background = '#dc2626';
    }
  } else {
    el.style.display = 'none';
  }
}
