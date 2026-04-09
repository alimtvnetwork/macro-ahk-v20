/**
 * Loop Cycle — Core API-based loop iteration logic
 *
 * Phase 5C split from loop-engine.ts.
 * v1.74: Integrated credit-balance API as primary free-credit detection.
 *        Falls back to full /user/workspaces when credit-balance API fails.
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 *
 * @see spec/17-app-issues/free-credits-detect/overview.md
 * @see memory/architecture/networking/centralized-api-registry
 */

import { log, logSub } from './logging';
import { showToast } from './toast';
import { resolveToken } from './auth';
import { getLastTokenSource, invalidateSessionBridgeKey, markBearerTokenExpired, recoverAuthOnce } from './auth';
import { parseLoopApiResponse, syncCreditStateFromApi } from './credit-fetch';
import { MacroController } from './core/MacroController';
import { isUserTypingInPrompt } from './dom-helpers';
import { CREDIT_API_BASE, TIMING, loopCreditState, state } from './shared-state';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import { performDirectMove } from './loop-dom-fallback';
import { stopLoop } from './loop-controls';
import { runCycleDomFallback } from './loop-dom-fallback';
import { checkAndActOnCreditBalance, BALANCE_CONFIG } from './credit-balance';
import { delay } from './async-utils';
import { logError } from './error-utils';

/** Shorthand for MacroController singleton */
function mc() { return MacroController.getInstance(); }

// ============================================
// Helper — auth failure check
// ============================================

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// ============================================
// Guard helpers
// ============================================

function isLoopStale(): boolean {
  return !state.running || state.isDelegating;
}

// ============================================
// releaseCycleLock — shared lock management
// ============================================

function releaseCycleLock(): void {
  if (state.__cycleRetryPending) {
    return;
  }

  state.__cycleInFlight = false;
}

// ============================================
// Double-confirm fetch — verifies low credits before moving
// ============================================

async function doubleConfirmAndMove(threshold: number): Promise<void> {
  await delay(2000);

  if (isLoopStale()) {
    log('SKIP: State changed during double-confirm wait', 'skip');

    return;
  }

  const resp = await window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });

  if (!resp.ok) {
    logError('Double-confirm API fetch failed', 'HTTP ' + resp.status);

    return;
  }

  if (isLoopStale()) {
    log('SKIP: State changed during double-confirm fetch', 'skip');

    return;
  }

  const data = resp.data as Record<string, unknown>;
  parseLoopApiResponse(data);
  state.workspaceFromApi = false;

  const confirmToken = resolveToken();
  await autoDetectLoopCurrentWorkspace(confirmToken);
  syncCreditStateFromApi();
  mc().updateUI();

  const cws = loopCreditState.currentWs;
  const dailyFree = cws ? (cws.dailyFree || 0) : 0;

  if (dailyFree >= threshold) {
    log('DOUBLE-CONFIRM: Daily free credits found on re-check (' + dailyFree + ')! No move needed.', 'success');

    return;
  }

  log('CONFIRMED: Credits (' + dailyFree + ') below threshold (' + threshold + ') — moving ' + state.direction.toUpperCase(), 'delegate');
  logSub('Direction: ' + state.direction.toUpperCase() + ', Workspace: ' + (cws ? cws.fullName : 'unknown'), 1);
  performDirectMove(state.direction);
}

// ============================================
// handleFallbackAuthRecovery — auth failure recovery with retry
// ============================================

async function handleFallbackAuthRecovery(
  freshToken: string,
  status: number,
  fetchWithTokenFn: () => Promise<void>,
): Promise<void> {
  if (freshToken) {
    markBearerTokenExpired('loop-cycle');
    invalidateSessionBridgeKey(freshToken);
  }

  log('Cycle fallback: Auth ' + status + ' — recovering session...', 'warn');
  showToast('Auth ' + status + ' — recovering session...', 'warn', { noStop: true });

  state.__cycleRetryPending = true;

  await delay(2500);
  state.__cycleRetryPending = false;

  const newToken = await recoverAuthOnce();

  if (!newToken) {
    logError('Cycle fallback', 'Recovery failed — skipping this cycle');
    showToast('Auth recovery failed — will retry next cycle', 'warn', { noStop: true });
    releaseCycleLock();

    return;
  }

  log('Cycle fallback: Recovery successful — retrying API call once', 'success');
  await fetchWithTokenFn();
}

// ============================================
// processWorkspaceData — handles successful workspace API response
// ============================================

async function processWorkspaceData(
  data: Record<string, unknown>,
): Promise<void> {
  if (state.retryCount > 0) {
    log('Retry recovery: API succeeded after ' + state.retryCount + ' previous failure(s)', 'success');
    showToast('Recovered after ' + state.retryCount + ' retry(ies)', 'success');
  }

  state.retryCount = 0;
  state.lastRetryError = null;

  if (isLoopStale()) {
    log('SKIP: State changed during API fetch', 'skip');

    return;
  }

  const isParseOk = parseLoopApiResponse(data);

  if (!isParseOk) {
    logError('Cycle aborted', 'API response parse failed');

    return;
  }

  state.workspaceFromApi = false;

  const cycleToken = resolveToken();
  await autoDetectLoopCurrentWorkspace(cycleToken);

  if (isLoopStale()) {
    log('SKIP: State changed during workspace detection', 'skip');

    return;
  }

  syncCreditStateFromApi();
  mc().updateUI();

  const cws = loopCreditState.currentWs;
  const dailyFree = cws ? (cws.dailyFree || 0) : 0;
  const threshold = BALANCE_CONFIG.minDailyCredit;

  if (dailyFree >= threshold) {
    log('✅ Daily free credits (' + dailyFree + ') >= threshold (' + threshold + ') — NO move needed', 'success');

    return;
  }

  log('Step 3: Credits (' + dailyFree + ') below threshold (' + threshold + ') — double-confirming via API...', 'warn');
  await doubleConfirmAndMove(threshold);
}

// ============================================
// handleCycleFetchError — manages retry/backoff for cycle failures
// ============================================

function handleCycleFetchError(err: Error, freshToken: string): void {
  state.retryCount++;
  const hasRetriesLeft = state.retryCount <= state.maxRetries;

  if (hasRetriesLeft) {
    const backoff = state.retryBackoffMs * Math.pow(2, state.retryCount - 1);
    showToast('Cycle failed: ' + err.message + ' — retrying in ' + (backoff / 1000) + 's (attempt ' + state.retryCount + '/' + state.maxRetries + ')', 'warn');
    log('Cycle fallback API fetch failed (attempt ' + state.retryCount + '/' + state.maxRetries + '): ' + err.message + ' — retrying in ' + backoff + 'ms', 'warn');
    logSub('Token: ' + (freshToken ? freshToken.substring(0, 12) + '...REDACTED' : 'NONE'), 1);
    logSub('Token source: ' + getLastTokenSource(), 1);

    state.__cycleRetryPending = true;
    setTimeout(function () {
      state.__cycleRetryPending = false;
      state.__cycleInFlight = false;

      if (state.running) {
        log('Retry #' + state.retryCount + ' — re-running cycle...', 'check');
        runCycle();
      }
    }, backoff);

    return;
  }

  state.lastRetryError = err.message;
  showToast('Cycle failed after ' + state.maxRetries + ' retries: ' + err.message + '. Loop stopped.', 'error', { stack: err.stack, noStop: true });
  logError('Cycle', 'fallback API fetch failed after \' + state.maxRetries + \' retries: \' + err.message + \' — stopping loop');
  logSub('Last token source: ' + getLastTokenSource(), 1);
  stopLoop();
  runCycleDomFallback();
}

// ============================================
// doCycleFetchWithToken — single workspace API call via SDK
// ============================================

async function doCycleFetchWithToken(isRetryAttempt: boolean): Promise<void> {
  const freshToken = resolveToken();

  log('Cycle fallback API: GET /user/workspaces' + (isRetryAttempt ? ' (RETRY after recovery)' : ''), 'check');
  logSub('Auth: ' + (freshToken ? 'Bearer ' + freshToken.substring(0, 12) + '...REDACTED' : 'NO TOKEN (cookies only)'), 1);
  logSub('Token source: ' + getLastTokenSource(), 1);

  try {
    const resp = await window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });

    if (isAuthFailure(resp.status) && !isRetryAttempt) {
      await handleFallbackAuthRecovery(
        freshToken,
        resp.status,
        () => doCycleFetchWithToken(true),
      );

      return;
    }

    if (isAuthFailure(resp.status) && freshToken) {
      markBearerTokenExpired('loop-cycle');
    }

    if (!resp.ok) {
      throw new Error('HTTP ' + resp.status);
    }

    const data = resp.data as Record<string, unknown>;
    log('Cycle fallback API: response received', 'check');
    await processWorkspaceData(data);
  } catch (err) {
    handleCycleFetchError(err as Error, freshToken);
  } finally {
    releaseCycleLock();
  }
}

// ============================================
// doCycleFetchFallback — entry point for /user/workspaces fallback
// ============================================

async function doCycleFetchFallback(): Promise<void> {
  const token = resolveToken();

  if (!token) {
    log('Cycle fallback: No token — attempting recovery before API call...', 'warn');

    try {
      const recoveredToken = await recoverAuthOnce();

      if (recoveredToken) {
        log('Cycle fallback: Recovered token — proceeding with API call', 'success');
      } else {
        log('Cycle fallback: No token from any source — API call will likely fail with 401', 'warn');
      }
    } catch (err) {
      logError('Cycle fallback', 'Auth recovery failed before API call: ' + (err as Error).message);
      releaseCycleLock();

      return;
    }
  }

  await doCycleFetchWithToken(false);
}

// ============================================
// handleDelegateTimeout — checks and recovers from stale delegation
// ============================================

function handleDelegateTimeout(): boolean {
  const elapsed = state.delegateStartTime ? (Date.now() - state.delegateStartTime) / 1000 : 0;
  const isTimedOut = elapsed > 60;

  if (!isTimedOut) {
    releaseCycleLock();
    log('SKIP: Waiting for API move (' + Math.floor(elapsed) + 's)', 'skip');

    return false;
  }

  log('Move timeout after ' + Math.floor(elapsed) + 's - auto-recovering', 'warn');
  state.isDelegating = false;
  state.forceDirection = null;
  state.delegateStartTime = 0;
  mc().updateUILight();

  return true;
}

// ============================================
// runCycle — API-based credit check
// ============================================

// eslint-disable-next-line max-lines-per-function
export function runCycle(): void {
  if (!state.running) {
    state.__cycleInFlight = false;
    state.__cycleRetryPending = false;
    log('SKIP: Loop not running', 'skip');

    return;
  }

  if (state.__cycleRetryPending) {
    log('SKIP: Retry already scheduled — waiting', 'skip');

    return;
  }

  if (state.__cycleInFlight) {
    log('SKIP: Previous cycle still in flight', 'skip');

    return;
  }

  state.__cycleInFlight = true;

  if (state.isDelegating) {
    const canContinue = handleDelegateTimeout();

    if (!canContinue) {
      return;
    }
  }

  state.cycleCount++;
  state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  log('--- Cycle #' + state.cycleCount + ' ---');

  if (isUserTypingInPrompt()) {
    releaseCycleLock();
    log('SKIP: User is typing in prompt area', 'skip');

    return;
  }

  log('Step 1: Checking credit balance via API...', 'check');

  checkAndActOnCreditBalance()
    .then(function (apiSucceeded: boolean) {
      if (apiSucceeded) {
        log('Step 1: ✅ Credit balance API succeeded', 'success');
        mc().updateUI();
        releaseCycleLock();

        return;
      }

      if (!BALANCE_CONFIG.fallbackToXPath) {
        log('Step 1: Credit balance API failed and XPath fallback disabled — skipping', 'warn');
        releaseCycleLock();

        return;
      }

      log('Step 1: Credit balance API failed — falling back to full workspace API...', 'warn');
      doCycleFetchFallback();
    })
    .catch(function (err: Error) {
      logError('runCycle', 'Credit balance check error — falling back to workspace API', err);

      if (!BALANCE_CONFIG.fallbackToXPath) {
        releaseCycleLock();

        return;
      }

      doCycleFetchFallback();
    });
}
