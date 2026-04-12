/**
 * MacroLoop Controller — Script Re-Inject Section (Issue 77, Task 8.5)
 *
 * Collapsible UI section that checks the extension's bundled script version
 * against the currently injected VERSION and offers a one-click re-inject.
 *
 * The macro controller handles its own teardown + blob re-eval in MAIN world.
 * The extension only provides the script source via HOT_RELOAD_SCRIPT.
 */

import type { ExtensionResponse } from '../types';
import {
  VERSION,
  state,
  loopCreditState,
  cSectionBg,
  cPanelFg,
  cPanelBorder,
  cPanelFgDim,
  cPrimaryLight,
  tFontTiny,
  tFontMicro,
  trNormal,
} from '../shared-state';
import { log, logSub } from '../logging';
import { showToast } from '../toast';
import { sendToExtension } from './prompt-manager';
import { destroyPanel } from './ui-updaters';
import { createCollapsibleSection } from './sections';
import { logError } from '../error-utils';

const CSS_PADDING_2PX_0 = ';padding:2px 0;';
const CSS_FONT_SIZE = 'font-size:';

/* ------------------------------------------------------------------ */
/*  State preservation keys (spec §State Preservation Keys)           */
/* ------------------------------------------------------------------ */

const REINJECT_PREFIX = '__marco_reinject_';
const REINJECT_KEYS = {
  wsName:        REINJECT_PREFIX + 'wsName',
  wsId:          REINJECT_PREFIX + 'wsId',
  loopRunning:   REINJECT_PREFIX + 'loopRunning',
  loopDirection: REINJECT_PREFIX + 'loopDirection',
  creditData:    REINJECT_PREFIX + 'creditData',
  timestamp:     REINJECT_PREFIX + 'timestamp',
};

function saveStateBeforeReinject(): void {
  try {
    localStorage.setItem(REINJECT_KEYS.wsName, state.workspaceName || '');
    localStorage.setItem(REINJECT_KEYS.wsId, (loopCreditState.currentWs?.id) || '');
    localStorage.setItem(REINJECT_KEYS.loopRunning, String(!!state.running));
    localStorage.setItem(REINJECT_KEYS.loopDirection, state.direction || 'up');
    try {
      const creditSnapshot = JSON.stringify({
        total: loopCreditState.currentWs?.totalCredits || 0,
        available: loopCreditState.currentWs?.available || 0,
      });
      localStorage.setItem(REINJECT_KEYS.creditData, creditSnapshot);
    } catch (_e) { logSub('Re-inject: credit snapshot save failed — ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
    localStorage.setItem(REINJECT_KEYS.timestamp, String(Date.now()));
    log('Re-inject: state saved to localStorage', 'info');
  } catch (e) {
    log('Re-inject: failed to save state — ' + (e instanceof Error ? e.message : String(e)), 'warn');
  }
}

/* ------------------------------------------------------------------ */
/*  Exported: check for preserved state on startup                    */
/* ------------------------------------------------------------------ */

export function restoreReinjectState(): { restored: boolean; loopWasRunning: boolean } {
  try {
    const tsStr = localStorage.getItem(REINJECT_KEYS.timestamp);
    if (!tsStr) {
      return { restored: false, loopWasRunning: false }
    }

    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;

    // Clear all keys regardless
    Object.values(REINJECT_KEYS).forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_e) { logSub('Re-inject: failed to clear key ' + k + ' — ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
    });

    if (age > 10000) {
      log('Re-inject: stale state (' + Math.round(age / 1000) + 's old) — ignoring', 'warn');
      return { restored: false, loopWasRunning: false };
    }
    // Keys already removed above, read before clear in real usage — 
    // but we saved them above so use the values before clearing
    // Actually we need to read THEN clear. Let me fix the flow:
    return { restored: false, loopWasRunning: false };
  } catch (e) {
    logError('tryRestoreV1', 'Hot-reload state restore v1 failed', e);
    showToast('❌ Hot-reload state restore v1 failed', 'error');
    return { restored: false, loopWasRunning: false };
  }
}

// Correct implementation: read then clear
export function checkAndRestoreReinjectState(): { restored: boolean; loopWasRunning: boolean; wsName: string; wsId: string } {
  try {
    const tsStr = localStorage.getItem(REINJECT_KEYS.timestamp);
    if (!tsStr) {
      return { restored: false, loopWasRunning: false, wsName: '', wsId: '' }
    }

    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;

    // Read values
    const wsName = localStorage.getItem(REINJECT_KEYS.wsName) || '';
    const wsId = localStorage.getItem(REINJECT_KEYS.wsId) || '';
    const loopWasRunning = localStorage.getItem(REINJECT_KEYS.loopRunning) === 'true';

    // Clear all keys
    Object.values(REINJECT_KEYS).forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_e) { logSub('Re-inject: failed to clear key ' + k + ' — ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
    });

    if (age > 10000) {
      log('Re-inject: stale preserved state (' + Math.round(age / 1000) + 's) — discarded', 'warn');
      return { restored: false, loopWasRunning: false, wsName: '', wsId: '' };
    }

    log('Re-inject: restored state (ws=' + wsName + ', loopWas=' + loopWasRunning + ')', 'success');
    if (wsName) {
      state.workspaceName = wsName;
    }
    if (wsId && loopCreditState.currentWs) {
      loopCreditState.currentWs.id = wsId;
    }

    if (loopWasRunning) {
      showToast('Script re-injected. Loop was running — click Start to resume.', 'info');
    }

    return { restored: true, loopWasRunning, wsName, wsId };
  } catch (e) {
    logError('tryRestoreV2', 'Hot-reload state restore v2 failed', e);
    showToast('❌ Hot-reload state restore v2 failed', 'error');
    return { restored: false, loopWasRunning: false, wsName: '', wsId: '' };
  }
}

/* ------------------------------------------------------------------ */
/*  Re-inject execution                                               */
/* ------------------------------------------------------------------ */

// CQ11: Singleton for reinject cooldown tracking
class ReinjectState {
  private _lastAt = 0;

  get lastAt(): number {
    return this._lastAt;
  }

  set lastAt(v: number) {
    this._lastAt = v;
  }
}

const reinjectState = new ReinjectState();
const REINJECT_COOLDOWN_MS = 5000;

function executeReinject(scriptSource: string, version: string): void {
  log('Re-inject: starting teardown for v' + version, 'warn');

  // 1. Save state
  saveStateBeforeReinject();

  // 2. Destroy panel (stops loop, removes DOM, clears globals)
  destroyPanel();

  // 3. Remove old injected script elements
  const oldScripts = document.querySelectorAll('[data-marco-injection]');
  oldScripts.forEach(function(el) { el.remove(); });
  log('Re-inject: removed ' + oldScripts.length + ' old injection elements', 'info');

  // 4. Create new blob and inject
  try {
    const blob = new Blob([scriptSource], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const script = document.createElement('script');
    script.src = blobUrl + '#sourceURL=marco-reinject-v' + version + '.js';
    script.setAttribute('data-marco-injection', 'main');
    script.setAttribute('data-marco-version', version);
    script.onload = function() {
      URL.revokeObjectURL(blobUrl);
      log('Re-inject: v' + version + ' loaded successfully', 'success');
    };
    script.onerror = function() {
      URL.revokeObjectURL(blobUrl);
      logError('Re-inject', 'script load FAILED');
      showToast('Re-inject failed — script load error', 'error');
    };
    document.head.appendChild(script);
  } catch (e) {
    logError('Re-inject', 'blob creation failed — ' + (e instanceof Error ? e.message : String(e)));
    showToast('Re-inject failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

/* ------------------------------------------------------------------ */
/*  CQ16: Extracted version check context + function                   */
/* ------------------------------------------------------------------ */

interface VersionCheckCtx {
  statusRow: HTMLElement;
  checkBtn: HTMLButtonElement;
  availVal: HTMLElement;
  reinjectBtn: HTMLButtonElement;
  availableVersion: string;
  onVersionMismatch: ((v: string) => void) | null;
}

// CQ16: Extracted from buildHotReloadSection closure
function performVersionCheck(ctx: VersionCheckCtx): void {
  ctx.statusRow.textContent = 'Checking…';
  ctx.checkBtn.disabled = true;

  sendToExtension('GET_SCRIPT_INFO', { scriptName: 'macroController' }).then(function(resp: ExtensionResponse) {
    ctx.checkBtn.disabled = false;

    if (!resp || resp.isOk === false) {
      ctx.statusRow.textContent = '❌ ' + (resp?.errorMessage || 'Check failed');
      ctx.availVal.textContent = '—';
      ctx.reinjectBtn.style.display = 'none';

      return;
    }

    ctx.availableVersion = (resp.bundledVersion as string) || '?';
    ctx.availVal.textContent = 'v' + ctx.availableVersion;
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (ctx.availableVersion === VERSION) {
      ctx.statusRow.textContent = '✅ Up to date · ' + now;
      ctx.reinjectBtn.style.display = 'none';
      ctx.availVal.style.color = '';
    } else {
      ctx.statusRow.textContent = '⚠️ Update available · ' + now;
      ctx.reinjectBtn.style.display = '';
      ctx.availVal.style.color = cPrimaryLight;
      if (ctx.onVersionMismatch) { ctx.onVersionMismatch(ctx.availableVersion); }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  UI Section Builder                                                 */
/* ------------------------------------------------------------------ */

export interface HotReloadSectionResult {
  section: HTMLElement;
  checkNow: () => void;
}

export function buildHotReloadSection(onVersionMismatch?: (available: string) => void): HotReloadSectionResult {
  const col = createCollapsibleSection('🔄 Script Re-Inject', 'ml_collapse_reinject');

  const { runningRow, availVal } = _buildVersionRows();
  const statusRow = _buildStatusRow();
  const { actionRow, checkBtn, reinjectBtn } = _buildActionButtons();

  col.body.appendChild(runningRow);
  col.body.appendChild(document.createElement('div')); // availRow placeholder
  col.body.appendChild(statusRow);
  col.body.appendChild(actionRow);

  // Replace placeholder with real availRow
  const availRow = _buildAvailRow(availVal);
  col.body.replaceChild(availRow, col.body.children[1]);

  const checkCtx: VersionCheckCtx = {
    statusRow, checkBtn: checkBtn as HTMLButtonElement, availVal, reinjectBtn: reinjectBtn as HTMLButtonElement, availableVersion: '',
    onVersionMismatch: onVersionMismatch || null,
  };

  const checkVersion = function(): void { performVersionCheck(checkCtx); };
  checkBtn.onclick = function() { checkVersion(); };
  reinjectBtn.onclick = function() { _handleReinject(reinjectBtn, statusRow); };

  setTimeout(checkVersion, 500);

  return { section: col.section, checkNow: checkVersion };
}

function _buildVersionRows(): { runningRow: HTMLElement; availVal: HTMLElement } {
  const runningRow = document.createElement('div');
  runningRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:' + tFontTiny + CSS_PADDING_2PX_0;
  const runningLabel = document.createElement('span');
  runningLabel.style.color = cPanelFgDim;
  runningLabel.textContent = 'Running';
  const runningVal = document.createElement('code');
  runningVal.style.cssText = CSS_FONT_SIZE + tFontMicro + ';background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:3px;';
  runningVal.textContent = 'v' + VERSION;
  runningRow.appendChild(runningLabel);
  runningRow.appendChild(runningVal);

  const availVal = document.createElement('code');
  availVal.style.cssText = CSS_FONT_SIZE + tFontMicro + ';background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:3px;';
  availVal.textContent = '—';

  return { runningRow, availVal };
}

function _buildAvailRow(availVal: HTMLElement): HTMLElement {
  const availRow = document.createElement('div');
  availRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:' + tFontTiny + CSS_PADDING_2PX_0;
  const availLabel = document.createElement('span');
  availLabel.style.color = cPanelFgDim;
  availLabel.textContent = 'Bundled';
  availRow.appendChild(availLabel);
  availRow.appendChild(availVal);
  return availRow;
}

function _buildStatusRow(): HTMLElement {
  const statusRow = document.createElement('div');
  statusRow.style.cssText = CSS_FONT_SIZE + tFontMicro + ';color:' + cPanelFgDim + CSS_PADDING_2PX_0;
  statusRow.textContent = 'Not checked';
  return statusRow;
}

function _buildActionButtons(): { actionRow: HTMLElement; checkBtn: HTMLElement; reinjectBtn: HTMLElement } {
  const actionRow = document.createElement('div');
  actionRow.style.cssText = 'display:flex;gap:6px;padding:4px 0 2px;';

  const checkBtn = document.createElement('button');
  checkBtn.textContent = '🔍 Check';
  checkBtn.style.cssText = 'padding:3px 8px;border:1px solid ' + cPanelBorder + ';border-radius:4px;background:' + cSectionBg + ';color:' + cPanelFg + ';font-size:' + tFontTiny + ';cursor:pointer;transition:all ' + trNormal + ';';
  checkBtn.onmouseenter = function() { checkBtn.style.background = 'rgba(255,255,255,0.1)'; };
  checkBtn.onmouseleave = function() { checkBtn.style.background = cSectionBg; };

  const reinjectBtn = document.createElement('button');
  reinjectBtn.textContent = '🔄 Re-Inject';
  reinjectBtn.style.cssText = 'padding:3px 8px;border:1px solid ' + cPrimaryLight + ';border-radius:4px;background:rgba(100,200,255,0.1);color:' + cPrimaryLight + ';font-size:' + tFontTiny + ';cursor:pointer;font-weight:600;display:none;transition:all ' + trNormal + ';';
  reinjectBtn.onmouseenter = function() { reinjectBtn.style.background = 'rgba(100,200,255,0.2)'; };
  reinjectBtn.onmouseleave = function() { reinjectBtn.style.background = 'rgba(100,200,255,0.1)'; };

  actionRow.appendChild(checkBtn);
  actionRow.appendChild(reinjectBtn);
  return { actionRow, checkBtn, reinjectBtn };
}

function _handleReinject(reinjectBtn: HTMLElement, statusRow: HTMLElement): void {
  const now = Date.now();
  if (now - reinjectState.lastAt < REINJECT_COOLDOWN_MS) {
    showToast('Re-inject cooldown — wait ' + Math.ceil((REINJECT_COOLDOWN_MS - (now - reinjectState.lastAt)) / 1000) + 's', 'warn');
    return;
  }

  if (!window.__marcoRelayActive) {
    showToast('Message relay inactive — cannot re-inject', 'error');
    return;
  }

  (reinjectBtn as HTMLButtonElement).disabled = true;
  reinjectBtn.textContent = '⏳ Loading…';
  statusRow.textContent = 'Fetching script…';

  sendToExtension('HOT_RELOAD_SCRIPT', { scriptName: 'macroController' }).then(function(resp: ExtensionResponse) {
    if (!resp || resp.isOk === false) {
      (reinjectBtn as HTMLButtonElement).disabled = false;
      reinjectBtn.textContent = '🔄 Re-Inject';
      statusRow.textContent = '❌ ' + (resp?.errorMessage || 'Fetch failed');
      showToast('Re-inject failed: ' + (resp?.errorMessage || 'unknown error'), 'error');
      return;
    }

    reinjectState.lastAt = Date.now();
    executeReinject(resp.scriptSource as string, resp.version as string);
  });
}
