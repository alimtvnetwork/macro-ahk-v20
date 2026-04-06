/**
 * MacroLoop Controller — UI Update Functions
 * Step 2b: Extracted from macro-looping.ts
 *
 * Contains: updateUI, updateProjectNameDisplay, updateStatus, updateButtons,
 * updateRecordIndicator, animateBtn, attachButtonHoverFx, setLoopInterval, destroyPanel
 */

import { MacroController } from '../core/MacroController';
import { dualWrite, nsCall } from '../api-namespace';

function mc() { return MacroController.getInstance(); }
import {
  IDS, TIMING, state, loopCreditState,
  cWarning, cWarningLight, cNeutral400, tFontTiny,
} from '../shared-state';
import { log, getDisplayProjectName } from '../logging';
import { calcTotalCredits, calcAvailableCredits, renderCreditBar } from '../credit-api';
import { runCycle } from '../loop-engine';

// MC-02 fix: dirty-flag guard — only rebuild innerHTML when status content actually changes
let _lastStatusKey = '';

/**
 * Master UI refresh — calls all sub-updaters and repopulates workspace dropdown.
 */
export function updateUI(): void {
  updateStatus();
  updateButtons();
  updateRecordIndicator();
  mc().ui.populateDropdown();
  updateProjectNameDisplay();
  updateTitleBarWorkspaceName();
}

/**
 * Update project name display in title bar (v7.9.39).
 */
export function updateProjectNameDisplay(): void {
  const el = document.getElementById('loop-project-name');
  if (el) {
    el.textContent = getDisplayProjectName();
  }
}

/**
 * Update workspace name badge in title bar — auto-syncs with state.workspaceName.
 */
export function updateTitleBarWorkspaceName(): void {
  const el = document.getElementById('loop-title-ws-name');
  if (!el) return;
  const name = state.workspaceName;
  if (name) {
    el.textContent = name;
    el.style.color = '#fbbf24';
    el.title = 'Workspace: ' + name + ' — click to re-detect';
  } else {
    el.textContent = '⟳ detecting…';
    el.style.color = '#9ca3af';
    el.title = 'No workspace detected — click to retry';
  }
}

/**
 * Update the status panel with current loop state, credit bars, and workspace info.
 * Uses a dirty-flag guard to skip innerHTML rebuilds when nothing changed.
 */
export function updateStatus(): void {
  const el = document.getElementById(IDS.STATUS);
  if (!el) return;

  // Build a lightweight fingerprint of all values that affect the status HTML
  const statusKey = [
    state.running ? 1 : 0,
    state.workspaceName || '',
    state.workspaceJustChanged ? 1 : 0,
    state.direction,
    state.cycleCount,
    state.countdown,
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
  if (statusKey === _lastStatusKey) return;
  _lastStatusKey = statusKey;

  // Workspace name fragment (inline, yellow, bold)
  let wsFragment = '';
  if (state.workspaceName) {
    wsFragment = '<span style="color:#fbbf24;font-weight:700;">' + state.workspaceName + '</span>';
    // v6.56: Show temporary "WS Changed" indicator
    if (state.workspaceJustChanged) {
      wsFragment += ' <span style="color:#f97316;font-size:10px;font-weight:bold;">⚡ WS Changed</span>';
    }
    wsFragment += ' | ';
  }

  // Build credit bar section — MC-03 fix: cache and only regenerate when credit data changes
  let creditBarsHtml = '';
  if (loopCreditState.lastCheckedAt) {
    const cacheKey = (loopCreditState.lastCheckedAt || 0) + '|' + (loopCreditState.currentWs ? loopCreditState.currentWs.name : '');
    if (window._creditBarCache && window._creditBarCache.key === cacheKey) {
      creditBarsHtml = window._creditBarCache.html;
    } else {
      const cws = loopCreditState.currentWs;
      if (cws) {
        const df = Math.round(cws.dailyFree || 0);
        const ro = Math.round(cws.rollover || 0);
        const ba = Math.round(cws.billingAvailable || 0);
        const fr = Math.round(cws.freeRemaining || 0);
        const _totalCapacity = Math.round(cws.totalCredits || calcTotalCredits(cws.freeGranted, cws.dailyLimit, cws.limit, cws.topupLimit, cws.rolloverLimit));
        const _availTotal = Math.round(cws.available || calcAvailableCredits(_totalCapacity, cws.rolloverUsed, cws.dailyUsed, cws.used, (cws.freeGranted || 0) - (cws.freeRemaining || 0)));
        const _perWs = loopCreditState.perWorkspace || [];
        let _maxTc = 0;
        for (let _mi = 0; _mi < _perWs.length; _mi++) {
          const _mtc = Math.round(_perWs[_mi].totalCredits || calcTotalCredits(_perWs[_mi].freeGranted, _perWs[_mi].dailyLimit, _perWs[_mi].limit, _perWs[_mi].topupLimit, _perWs[_mi].rolloverLimit));
          if (_mtc > _maxTc) _maxTc = _mtc;
        }
        creditBarsHtml = renderCreditBar({
          totalCredits: _totalCapacity, available: _availTotal, totalUsed: cws.totalCreditsUsed || 0,
          freeRemaining: fr, billingAvail: ba, rollover: ro, dailyFree: df,
          compact: false, marginTop: '4px', maxTotalCredits: _maxTc
        });
        window._creditBarCache = { key: cacheKey, html: creditBarsHtml };
      }
    }
  }

  if (state.running) {
    const hasFreeCredit = !state.isIdle;
    const creditIcon = hasFreeCredit ? '[Y]' : '[N]';
    const creditLabel = hasFreeCredit ? 'Free Credit' : 'No Credit';
    const creditText = '<span style="color:#fbbf24;">' + creditIcon + ' ' + creditLabel + '</span>';
    let delegateText = '';
    if (state.isDelegating) {
      if (state.forceDirection) {
        delegateText = ' | <span style="color:#f97316;font-weight:bold;">FORCE ' + state.forceDirection.toUpperCase() + '</span>';
      } else {
        delegateText = ' | <span style="color:#3b82f6;">SWITCHING...</span>';
      }
    }
    const totalSec = Math.floor(TIMING.LOOP_INTERVAL / 1000);
    const pct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - state.countdown) / totalSec) * 100)) : 0;
    const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981';

    const statusLine = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">'
      + wsFragment
      + '<span style="color:#10b981;">*</span> '
      + state.direction.toUpperCase()
      + ' | #' + state.cycleCount
      + ' | ' + creditText
      + ' | <span style="color:#fbbf24;font-weight:bold;">' + state.countdown + 's</span>'
      + delegateText
      + '</div>';

    const progressBar = '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">'
      + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:3px;transition:width 0.8s linear;"></div>'
      + '</div>';

    el.innerHTML = statusLine + progressBar + creditBarsHtml;
  } else {
    let creditInfoStop = '';
    if (state.lastStatusCheck > 0) {
      const creditIconStop = state.hasFreeCredit ? '[Y]' : '[N]';
      const creditLabelStop = state.hasFreeCredit ? 'Free Credit' : 'No Credit';
      creditInfoStop = ' | <span style="color:#fbbf24;">' + creditIconStop + ' ' + creditLabelStop + '</span>';
    }
    // v7.35: Show helpful hint when no workspace or credits are loaded
    let readyHint = '';
    const hasWorkspaces = (loopCreditState.perWorkspace || []).length > 0;
    if (!wsFragment && !hasWorkspaces) {
      readyHint = '<div style="margin-top:4px;font-size:' + tFontTiny + ';color:' + cWarning + ';">💡 Click ☑ Check or 💰 Credits to load workspaces</div>';
    }
    el.innerHTML = wsFragment + '<span style="color:#9ca3af;">[=]</span> Stopped | Cycles: ' + state.cycleCount + creditInfoStop + creditBarsHtml + readyHint;
  }
}

/**
 * Sync the start/stop button visual state.
 */
export function updateButtons(): void {
  // v7.28: The start/stop button is now a TOGGLE (single button, id=START_BTN).
  // Do NOT disable it when running — that prevents clicking Stop.
  // Instead, sync its visual state via __loopUpdateStartStopBtn.
  nsCall('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', !!state.running);

  // Legacy: if separate stop button exists (old layout), update it
  const stopBtn = document.getElementById(IDS.STOP_BTN);
  if (stopBtn) {
    (stopBtn as HTMLButtonElement).disabled = !state.running;
    stopBtn.style.opacity = state.running ? '1' : '0.5';
    stopBtn.style.cursor = state.running ? 'pointer' : 'not-allowed';
  }
}

/**
 * Update the recording indicator (red dot + LOOP / SWITCHING / FORCE badge).
 */
export function updateRecordIndicator(): void {
  const el = document.getElementById(IDS.RECORD_INDICATOR);
  if (!el) return;

  if (state.running) {
    el.style.display = 'flex';
    if (state.isDelegating) {
      if (state.forceDirection) {
        // v6.55: Distinct Force indicator (orange)
        el.innerHTML = '<span style="width:10px;height:10px;background:#f97316;border-radius:50%;display:inline-block;"></span> FORCE ' + state.forceDirection.toUpperCase();
        el.style.background = '#c2410c';
      } else {
        el.innerHTML = '<span style="width:10px;height:10px;background:#3b82f6;border-radius:50%;display:inline-block;"></span> SWITCHING';
        el.style.background = '#1d4ed8';
      }
    } else {
      el.innerHTML = '<span style="width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;"></span> LOOP';
      el.style.background = '#dc2626';
    }
  } else {
    el.style.display = 'none';
  }
}

/**
/**
 * Button click animation — color flash only, no scale (v1.56).
 */
export function animateBtn(btn: HTMLElement): void {
  if (!btn) return;
  const origBg = btn.style.background || '';
  btn.style.transition = 'filter 100ms ease, background 150ms ease, opacity 100ms ease';
  btn.style.filter = 'brightness(0.75)';
  btn.style.opacity = '0.7';
  setTimeout(function() {
    btn.style.filter = 'brightness(1.2)';
    btn.style.opacity = '1';
    setTimeout(function() {
      btn.style.filter = '';
      btn.style.background = origBg;
    }, 180);
  }, 100);
}

/**
 * Consistent hover feedback — color transition only, no scale/translate (v1.56).
 */
export function attachButtonHoverFx(btn: HTMLElement): void {
  if (!btn) return;
  btn.style.transition = 'filter 150ms ease, background-color 150ms ease, box-shadow 150ms ease';
  btn.onmouseenter = function() {
    if ((btn as HTMLButtonElement).disabled) return;
    btn.style.filter = 'brightness(1.12)';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.3)';
  };
  btn.onmouseleave = function() {
    btn.style.filter = '';
    btn.style.boxShadow = '';
  };
}

/**
 * Set loop interval dynamically (called from AHK).
 */
export function setLoopInterval(newIntervalMs: number): boolean {
  const oldInterval = TIMING.LOOP_INTERVAL;
  TIMING.LOOP_INTERVAL = newIntervalMs;
  log('Interval changed: ' + oldInterval + 'ms -> ' + newIntervalMs + 'ms', 'success');

  state.countdown = Math.floor(newIntervalMs / 1000);

  if (state.running && state.loopIntervalId) {
    clearInterval(state.loopIntervalId);
    state.loopIntervalId = setInterval(runCycle, newIntervalMs);
    log('Loop timer restarted with new interval');
  }

  updateUI();
  return true;
}

/**
 * Fully destroy the controller panel and clean up globals for re-injection.
 */
export function destroyPanel(): void {
  log('MacroLoop panel DESTROYED by user — remove marker + globals for clean re-inject', 'warn');
  dualWrite('__loopDestroyed', '_internal.destroyed', true);

  // Stop any active loop
  try { nsCall('__loopStop', 'api.loop.stop'); } catch(e) { /* ignore */ }

  // Remove DOM elements
  const marker = document.getElementById(IDS.SCRIPT_MARKER);
  if (marker) marker.remove();
  const container = document.getElementById(IDS.CONTAINER);
  if (container) container.remove();

  // Phase 9D: No window.__* globals to clear — namespace is the single source of truth

  log('Teardown complete — re-inject script to restore controller', 'success');
}

