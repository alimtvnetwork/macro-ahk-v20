/**
 * Loop Controls — Start/stop, interval timers, status refresh
 *
 * Phase 5C split from loop-engine.ts.
 * Phase 5 continued: runCheck moved to loop-check.ts.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log, logSub } from './logging';
import { nsCall, nsRead } from './api-namespace';
import { showToast, setStopLoopCallback } from './toast';
import { LoopDirection } from './types';
import { getByXPath } from './xpath-utils';
import { fetchLoopCreditsAsync, syncCreditStateFromApi } from './credit-fetch';
import { MacroController } from './core/MacroController';
import { getBearerToken, getLastTokenSource } from './auth';
import { checkSystemBusy, closeProjectDialog, ensureProjectDialogOpen, isOnProjectPage, isUserTypingInPrompt, pollForDialogReady } from './dom-helpers';
import { CONFIG, IDS, TIMING, loopCreditState, state } from './shared-state';
import { runCycle } from './loop-cycle';
import { logError } from './error-utils';
import { ensureTokenReady, AUTH_READY_TIMEOUT_MS } from './startup-token-gate';

const NS_UPDATESTARTSTOPBTN = '_internal.updateStartStopBtn';

// Re-export runCheck from loop-check.ts (barrel pattern)
export { runCheck } from './loop-check';

/** Shorthand for MacroController singleton */
function mc() { return MacroController.getInstance(); }

// ============================================
// CQ4: Extracted helpers from startLoop
// ============================================

function validateLoopPreconditions(): boolean {
  if (state.running) {
    log('Cannot start - loop is already running', 'warn');
    return false;
  }

  if (!isOnProjectPage()) {
    logError('Cannot', 'start - must be on a supported project/preview page (not settings)');
    return false;
  }

  return true;
}

function initLoopState(direction: LoopDirection | string): void {
  state.direction = (direction as LoopDirection) || LoopDirection.Down;
  state.cycleCount = 0;
  state.isIdle = true;
  state.isDelegating = false;
  state.__cycleInFlight = false;
  state.running = true;
  state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  nsCall('__loopUpdateStartStopBtn', NS_UPDATESTARTSTOPBTN, true);
}

function logLoopStartInfo(): void {
  log('=== LOOP STARTING ===', 'success');
  log('Direction: ' + state.direction.toUpperCase(), 'success');
  log('Interval: ' + (TIMING.LOOP_INTERVAL / 1000) + 's');
  log('Project Button XPath: ' + CONFIG.PROJECT_BUTTON_XPATH);
  log('Progress XPath: ' + CONFIG.PROGRESS_XPATH);
}

function verifyControllerInjection(): boolean {
  log('Step 0: Confirming controller injection at CONTROLS_XPATH...', 'check');
  log('  CONTROLS_XPATH: ' + CONFIG.CONTROLS_XPATH, 'check');

  const marker = document.getElementById(IDS.SCRIPT_MARKER);
  const uiContainer = document.getElementById(IDS.CONTAINER);
  const xpathTarget = getByXPath(CONFIG.CONTROLS_XPATH);
  const loopStartFn = nsRead('__loopStart', 'api.loop.start');

  if (!marker || typeof loopStartFn !== 'function') {
    logError('unknown', '❌ Controller script NOT injected (marker=\' + !!marker + \', __loopStart=\' + (typeof loopStartFn) + \') — aborting');
    state.running = false;
    nsCall('__loopUpdateStartStopBtn', NS_UPDATESTARTSTOPBTN, false);
    return false;
  }

  if (!uiContainer) {
    logError('unknown', '❌ Controller UI container NOT found in DOM (id=\' + IDS.CONTAINER + \') — aborting');
    state.running = false;
    nsCall('__loopUpdateStartStopBtn', NS_UPDATESTARTSTOPBTN, false);
    return false;
  }

  logInjectionPosition(xpathTarget, uiContainer);
  return true;
}

function logInjectionPosition(xpathTarget: Node | null, uiContainer: HTMLElement): void {
  if (xpathTarget && xpathTarget.contains(uiContainer)) {
    log('Step 0: ✅ Controller confirmed at CONTROLS_XPATH', 'success');
  } else if (xpathTarget) {
    log('Step 0: ⚠️ Controller exists but NOT inside CONTROLS_XPATH (body fallback?) — proceeding with warning', 'warn');
  } else {
    log('Step 0: ⚠️ CONTROLS_XPATH element not found — controller may be in fallback position', 'warn');
  }
}

function startLoopTimers(): void {
  if (!state.running) {
    log('Loop was stopped during initial check — not starting timers', 'warn');
    return;
  }

  const cws = loopCreditState.currentWs;
  if (cws) {
    log('Credit state at loop start: workspace="' + cws.fullName + '" dailyFree=' + (cws.dailyFree || 0) + ' available=' + (cws.available || 0), 'check');
  } else {
    log('Credit state at loop start: no workspace detected yet (will detect on first cycle)', 'warn');
  }

  log('=== LOOP STARTED (post-check) ===', 'success');
  state.countdownIntervalId = setInterval(function() { if (state.countdown > 0) state.countdown--; }, TIMING.COUNTDOWN_INTERVAL);
  state.loopIntervalId = setInterval(runCycle, TIMING.LOOP_INTERVAL);
  setTimeout(runCycle, TIMING.FIRST_CYCLE_DELAY);
  mc().updateUI();
}

async function handleAuthAndStartCheck(): Promise<void> {
  log('Step 1: Resolving auth token before workspace check...', 'check');
  const { runCheck: runCheckFn } = await import('./loop-check');
  const tokenResult = await ensureTokenReady(AUTH_READY_TIMEOUT_MS);

  logAuthResult(tokenResult.token, tokenResult.token ? getLastTokenSource() : tokenResult.reason);
  if (!state.running) { log('Loop was stopped during auth resolution — aborting', 'warn'); return; }

  log('Step 2: Running initial workspace check...', 'check');
  let checkPromise;
  try { checkPromise = runCheckFn(); } catch(e) {
    log('Initial check threw error: ' + (e as Error).message + ' — starting loop anyway', 'warn');
  }

  log('Step 3: Fetching initial credit data...', 'check');
  mc().credits.fetch(false);

  scheduleTimersAfterCheck(checkPromise);
}

function logAuthResult(authToken: string, authSource: string): void {
  if (authToken) {
    log('Step 1: ✅ Auth token resolved from ' + authSource, 'success');
  } else {
    log('Step 1: ⚠️ No auth token available — credit checks may fail with 401', 'warn');
    showToast('⚠️ No auth token — credit API may fail. Please ensure you are logged in.', 'warn');
  }
}

function scheduleTimersAfterCheck(checkPromise: Promise<void> | undefined): void {
  if (checkPromise && typeof checkPromise.then === 'function') {
    checkPromise.then(function() {
      log('Initial check completed — starting loop timers', 'success');
      startLoopTimers();
    }).catch(function(err: Error) {
      log('Initial check failed: ' + (err && err.message ? err.message : String(err)) + ' — starting loop anyway', 'warn');
      startLoopTimers();
    });
  } else {
    setTimeout(startLoopTimers, 3000);
  }
}

// ============================================
// startLoop
// ============================================
export function startLoop(direction: LoopDirection | string): boolean {
  if (!validateLoopPreconditions()) {
    return false;
  }

  initLoopState(direction);
  logLoopStartInfo();

  if (!verifyControllerInjection()) {
    return false;
  }

  mc().updateUI();
  handleAuthAndStartCheck();

  return true;
}

// ============================================
// stopLoop
// ============================================
export function stopLoop(): boolean {
  if (!state.running) {
    return false;
  }

  state.running = false;
  state.isDelegating = false;
  state.forceDirection = null;
  state.__cycleInFlight = false;

  if (state.loopIntervalId) { clearInterval(state.loopIntervalId); state.loopIntervalId = null; }
  if (state.countdownIntervalId) { clearInterval(state.countdownIntervalId); state.countdownIntervalId = null; }

  log('=== LOOP STOPPED ===', 'success');
  log('Total cycles completed: ' + state.cycleCount);
  nsCall('__loopUpdateStartStopBtn', NS_UPDATESTARTSTOPBTN, false);
  mc().updateUI();

  return true;
}

// ============================================
// CQ4: Extracted helpers from refreshStatus
// ============================================

function refreshStatusStopped(): void {
  const gotNavName = mc().workspaces.fetchNameFromNav();
  if (gotNavName) {
    logSub('Workspace name updated from nav (passive, loop stopped)', 1);
  }

  const hasNoCreditData = !state.workspaceName && (!loopCreditState.perWorkspace || loopCreditState.perWorkspace.length === 0);

  if (hasNoCreditData) {
    triggerBackgroundCreditFetch();
  }

  mc().updateUI();
}

function triggerBackgroundCreditFetch(): void {
  logSub('No workspace + no credits — triggering background credit fetch via getBearerToken', 1);
  fetchLoopCreditsAsync(false).then(function() {
    syncCreditStateFromApi();
    mc().updateUI();
  }).catch(function(err) {
    log('Background credit fetch failed: ' + (err instanceof Error ? err.message : String(err)), 'warn');
  });
}

function refreshStatusRunning(): void {
  if (isUserTypingInPrompt()) {
    log('Workspace auto-check: user is typing in prompt — skipping', 'skip');
    return;
  }

  const gotNavName = mc().workspaces.fetchNameFromNav();
  if (gotNavName) {
    logSub('Workspace name updated from nav — skipping dialog open for name', 1);
  }

  logSub('Workspace auto-check: opening dialog for credit check...', 1);
  const opened = ensureProjectDialogOpen();
  if (!opened) {
    logSub('Workspace auto-check: could not open project dialog', 1);
    mc().updateUILight();
    return;
  }

  pollForDialogReady().then(function() {
    readDialogCreditStatus(gotNavName);
  });
}

function readDialogCreditStatus(gotNavName: boolean): void {
  if (!gotNavName) {
    const oldName = state.workspaceName;
    mc().workspaces.fetchName();
    const nameChanged = oldName && state.workspaceName && oldName !== state.workspaceName;
    if (nameChanged) {
      log('Workspace changed during auto-check: "' + oldName + '" -> "' + state.workspaceName + '"', 'success');
    }
  }

  logSub('Checking credit status (dialog already open)', 1);
  const hasCredit = checkSystemBusy();
  state.hasFreeCredit = hasCredit;
  state.isIdle = !hasCredit;
  state.lastStatusCheck = Date.now();
  closeProjectDialog();
  mc().updateUI();
}

// ============================================
// refreshStatus — Workspace auto-check
// ============================================
export function refreshStatus(): void {
  if (!state.running) {
    refreshStatusStopped();
    return;
  }
  refreshStatusRunning();
}

export function startStatusRefresh(): void {
  if (state.statusRefreshId) {
    return;
  }
  const intervalMs = state.running ? (TIMING.WS_CHECK_INTERVAL || 5000) : 30000;
  log('Starting workspace auto-check (every ' + (intervalMs / 1000) + 's)', 'success');
  state.statusRefreshId = setInterval(refreshStatus, intervalMs);
  setTimeout(refreshStatus, 1000);
}

export function stopStatusRefresh(): void {
  if (state.statusRefreshId) {
    clearInterval(state.statusRefreshId);
    state.statusRefreshId = null;
    log('Workspace auto-check stopped', 'warn');
  }
}

// Wire toast stop callback
setStopLoopCallback(stopLoop);
