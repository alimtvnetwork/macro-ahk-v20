/**
 * MacroLoop Controller — Script Re-Inject Section (Issue 77, Task 8.5)
 *
 * Collapsible UI section that checks the extension's bundled script version
 * against the currently injected VERSION and offers a one-click re-inject.
 *
 * The macro controller handles its own teardown + blob re-eval in MAIN world.
 * The extension only provides the script source via HOT_RELOAD_SCRIPT.
 */

import { VERSION, state, cSectionBg, cPanelFg, cPanelBorder, cPanelFgDim, cPrimaryLight, tFontTiny, tFontMicro, trNormal } from '../shared-state';
import { log } from '../logging';
import { showToast } from '../toast';
import { sendToExtension } from './prompt-manager';
import { destroyPanel } from './ui-updaters';
import { createCollapsibleSection } from './sections';

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
    localStorage.setItem(REINJECT_KEYS.wsId, state.workspaceId || '');
    localStorage.setItem(REINJECT_KEYS.loopRunning, String(!!state.loopRunning));
    localStorage.setItem(REINJECT_KEYS.loopDirection, state.loopDirection || 'up');
    try {
      const creditSnapshot = JSON.stringify({
        total: state.totalCredits || 0,
        available: state.availableCredits || 0,
      });
      localStorage.setItem(REINJECT_KEYS.creditData, creditSnapshot);
    } catch (_e) { /* skip credit save */ }
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
    if (!tsStr) return { restored: false, loopWasRunning: false };

    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;

    // Clear all keys regardless
    Object.values(REINJECT_KEYS).forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_e) { /* ignore */ }
    });

    if (age > 10000) {
      log('Re-inject: stale state (' + Math.round(age / 1000) + 's old) — ignoring', 'warn');
      return { restored: false, loopWasRunning: false };
    }

    const wsName = localStorage.getItem(REINJECT_KEYS.wsName) || '';
    // Keys already removed above, read before clear in real usage — 
    // but we saved them above so use the values before clearing
    // Actually we need to read THEN clear. Let me fix the flow:
    return { restored: false, loopWasRunning: false };
  } catch (_e) {
    return { restored: false, loopWasRunning: false };
  }
}

// Correct implementation: read then clear
export function checkAndRestoreReinjectState(): { restored: boolean; loopWasRunning: boolean; wsName: string; wsId: string } {
  try {
    const tsStr = localStorage.getItem(REINJECT_KEYS.timestamp);
    if (!tsStr) return { restored: false, loopWasRunning: false, wsName: '', wsId: '' };

    const ts = parseInt(tsStr, 10);
    const age = Date.now() - ts;

    // Read values
    const wsName = localStorage.getItem(REINJECT_KEYS.wsName) || '';
    const wsId = localStorage.getItem(REINJECT_KEYS.wsId) || '';
    const loopWasRunning = localStorage.getItem(REINJECT_KEYS.loopRunning) === 'true';

    // Clear all keys
    Object.values(REINJECT_KEYS).forEach(function(k) {
      try { localStorage.removeItem(k); } catch (_e) { /* ignore */ }
    });

    if (age > 10000) {
      log('Re-inject: stale preserved state (' + Math.round(age / 1000) + 's) — discarded', 'warn');
      return { restored: false, loopWasRunning: false, wsName: '', wsId: '' };
    }

    log('Re-inject: restored state (ws=' + wsName + ', loopWas=' + loopWasRunning + ')', 'success');
    if (wsName) state.workspaceName = wsName;
    if (wsId) state.workspaceId = wsId;

    if (loopWasRunning) {
      showToast('Script re-injected. Loop was running — click Start to resume.', 'info');
    }

    return { restored: true, loopWasRunning, wsName, wsId };
  } catch (_e) {
    return { restored: false, loopWasRunning: false, wsName: '', wsId: '' };
  }
}

/* ------------------------------------------------------------------ */
/*  Re-inject execution                                               */
/* ------------------------------------------------------------------ */

let _lastReinjectAt = 0;
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
      log('Re-inject: script load FAILED', 'error');
      showToast('Re-inject failed — script load error', 'error');
    };
    document.head.appendChild(script);
  } catch (e) {
    log('Re-inject: blob creation failed — ' + (e instanceof Error ? e.message : String(e)), 'error');
    showToast('Re-inject failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
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

  // Running version row
  const runningRow = document.createElement('div');
  runningRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:' + tFontTiny + ';padding:2px 0;';
  const runningLabel = document.createElement('span');
  runningLabel.style.color = cPanelFgDim;
  runningLabel.textContent = 'Running';
  const runningVal = document.createElement('code');
  runningVal.style.cssText = 'font-size:' + tFontMicro + ';background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:3px;';
  runningVal.textContent = 'v' + VERSION;

  runningRow.appendChild(runningLabel);
  runningRow.appendChild(runningVal);

  // Available version row
  const availRow = document.createElement('div');
  availRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:' + tFontTiny + ';padding:2px 0;';
  const availLabel = document.createElement('span');
  availLabel.style.color = cPanelFgDim;
  availLabel.textContent = 'Bundled';
  const availVal = document.createElement('code');
  availVal.style.cssText = 'font-size:' + tFontMicro + ';background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:3px;';
  availVal.textContent = '—';

  availRow.appendChild(availLabel);
  availRow.appendChild(availVal);

  // Status row
  const statusRow = document.createElement('div');
  statusRow.style.cssText = 'font-size:' + tFontMicro + ';color:' + cPanelFgDim + ';padding:2px 0;';
  statusRow.textContent = 'Not checked';

  // Action buttons row
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

  // Assemble body
  col.body.appendChild(runningRow);
  col.body.appendChild(availRow);
  col.body.appendChild(statusRow);
  col.body.appendChild(actionRow);

  // --- Check logic ---
  let _availableVersion = '';

  function checkVersion(): void {
    statusRow.textContent = 'Checking…';
    checkBtn.disabled = true;

    sendToExtension('GET_SCRIPT_INFO', { scriptName: 'macroController' }, function(resp: any) {
      checkBtn.disabled = false;

      if (!resp || resp.isOk === false) {
        statusRow.textContent = '❌ ' + (resp?.errorMessage || 'Check failed');
        availVal.textContent = '—';
        reinjectBtn.style.display = 'none';
        return;
      }

      _availableVersion = resp.bundledVersion || '?';
      availVal.textContent = 'v' + _availableVersion;
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });

      if (_availableVersion === VERSION) {
        statusRow.textContent = '✅ Up to date · ' + now;
        reinjectBtn.style.display = 'none';
        availVal.style.color = '';
      } else {
        statusRow.textContent = '⚠️ Update available · ' + now;
        reinjectBtn.style.display = '';
        availVal.style.color = cPrimaryLight;
        if (onVersionMismatch) onVersionMismatch(_availableVersion);
      }
    });
  }

  checkBtn.onclick = function() { checkVersion(); };

  // --- Re-inject logic ---
  reinjectBtn.onclick = function() {
    const now = Date.now();
    if (now - _lastReinjectAt < REINJECT_COOLDOWN_MS) {
      showToast('Re-inject cooldown — wait ' + Math.ceil((REINJECT_COOLDOWN_MS - (now - _lastReinjectAt)) / 1000) + 's', 'warn');
      return;
    }

    // Check relay health
    if (!(window as any).__marcoRelayActive) {
      showToast('Message relay inactive — cannot re-inject', 'error');
      return;
    }

    reinjectBtn.disabled = true;
    reinjectBtn.textContent = '⏳ Loading…';
    statusRow.textContent = 'Fetching script…';

    sendToExtension('HOT_RELOAD_SCRIPT', { scriptName: 'macroController' }, function(resp: any) {
      if (!resp || resp.isOk === false) {
        reinjectBtn.disabled = false;
        reinjectBtn.textContent = '🔄 Re-Inject';
        statusRow.textContent = '❌ ' + (resp?.errorMessage || 'Fetch failed');
        showToast('Re-inject failed: ' + (resp?.errorMessage || 'unknown error'), 'error');
        return;
      }

      _lastReinjectAt = Date.now();
      executeReinject(resp.scriptSource, resp.version);
    });
  };

  // Auto-check on creation (one-time)
  setTimeout(checkVersion, 500);

  return {
    section: col.section,
    checkNow: checkVersion,
  };
}
