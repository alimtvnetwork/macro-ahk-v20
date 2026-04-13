/**
 * Loop Cycle — Core API-based loop iteration logic
 *
 * Phase 5C split from loop-engine.ts.
 * v1.74: Integrated credit-balance API as primary free-credit detection.
 *        Falls back to full /user/workspaces when credit-balance API fails.
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 * v2.136: REMOVED all retry/backoff logic per issue #88. Cycle failures are
 *         transient — the loop interval is the natural retry mechanism.
 *
 * NO RETRY POLICY: If a cycle fails, log the error and release the lock.
 * The next scheduled cycle will try again. No exponential backoff, no
 * retryCount, no __cycleRetryPending. See:
 * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
 * @see standalone-scripts/macro-controller/diagrams/inconsistencies/auth-retry-inconsistencies.mmd
 *
 * @see spec/17-app-issues/free-credits-detect/overview.md
 * @see memory/architecture/networking/centralized-api-registry
 */

import { log, logSub } from './logging';
import { showToast } from './toast';
import { resolveToken } from './auth';
import { getLastTokenSource, invalidateSessionBridgeKey, markBearerTokenExpired, recoverAuthOnce } from './auth';
import { parseLoopApiResponse, syncCreditStateFromApi } from './credit-fetch';
import type { WorkspacesApiResponse } from './types';
import { MacroController } from './core/MacroController';
import { isUserTypingInPrompt } from './dom-helpers';
import { CREDIT_API_BASE, TIMING, loopCreditState, state } from './shared-state';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import { performDirectMove } from './loop-dom-fallback';
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

  const data = resp.data as WorkspacesApiResponse;
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
// handleFallbackAuthRecovery — single auth recovery attempt (NO retry)
// If recovery fails, the cycle is skipped. Next interval will try again.
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
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

  log('Cycle: Auth ' + status + ' — recovering session...', 'warn');
  showToast('Auth ' + status + ' — recovering session...', 'warn', { noStop: true });

  const newToken = await recoverAuthOnce();

  if (!newToken) {
    logError('Cycle', 'Auth recovery failed — skipping this cycle. Next interval will retry naturally.');
    showToast('Auth recovery failed — will try again next cycle', 'warn', { noStop: true });
    releaseCycleLock();

    return;
  }

  log('Cycle: Recovery successful — completing API call', 'success');
  await fetchWithTokenFn();
}

// ============================================
// processWorkspaceData — handles successful workspace API response
// ============================================

async function processWorkspaceData(
  data: WorkspacesApiResponse,
): Promise<void> {
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
    log('Daily free credits (' + dailyFree + ') >= threshold (' + threshold + ') — NO move needed', 'success');

    return;
  }

  log('Step 3: Credits (' + dailyFree + ') below threshold (' + threshold + ') — double-confirming via API...', 'warn');
  await doubleConfirmAndMove(threshold);
}

// ============================================
// handleCycleFetchError — log and release, NO retry
// Cycle failures are transient. The loop interval handles natural retry.
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
// ============================================

function handleCycleFetchError(err: Error, freshToken: string): void {
  logError('Cycle', 'API fetch failed: ' + err.message + ' — skipping this cycle');
  logSub('Token: ' + (freshToken ? freshToken.substring(0, 12) + '...REDACTED' : 'NONE'), 1);
  logSub('Token source: ' + getLastTokenSource(), 1);
  showToast('Cycle failed: ' + err.message + ' — will retry next interval', 'warn', { noStop: true });
  runCycleDomFallback();
}

// ============================================
// doCycleFetchWithToken — single workspace API call via SDK
// ============================================

async function doCycleFetchWithToken(isRecoveryAttempt: boolean): Promise<void> {
  const freshToken = resolveToken();

  log('Cycle API: GET /user/workspaces' + (isRecoveryAttempt ? ' (after recovery)' : ''), 'check');
  logSub('Auth: ' + (freshToken ? 'Bearer ' + freshToken.substring(0, 12) + '...REDACTED' : 'NO TOKEN (cookies only)'), 1);
  logSub('Token source: ' + getLastTokenSource(), 1);

  try {
    const resp = await window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });

    if (isAuthFailure(resp.status) && !isRecoveryAttempt) {
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

    const data = resp.data as WorkspacesApiResponse;
    log('Cycle API: response received', 'check');
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
    log('Cycle fallback: No token — attempting single recovery...', 'warn');

    try {
      const recoveredToken = await recoverAuthOnce();

      if (recoveredToken) {
        log('Cycle fallback: Recovered token — proceeding', 'success');
      } else {
        logError('Cycle fallback', 'No token from any source — skipping this cycle');
        releaseCycleLock();

        return;
      }
    } catch (err) {
      logError('Cycle fallback', 'Auth recovery failed: ' + (err as Error).message + ' — skipping cycle');
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
// NO RETRY: If the cycle fails, it releases the lock and the next
// scheduled interval will try again naturally.
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
// ============================================

export function runCycle(): void {
  if (!state.running) {
    state.__cycleInFlight = false;
    log('SKIP: Loop not running', 'skip');

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
        log('Step 1: Credit balance API succeeded', 'success');
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
      logError('Step 1', 'Credit balance check error: ' + err.message + ' — skipping cycle');

      if (!BALANCE_CONFIG.fallbackToXPath) {
        releaseCycleLock();

        return;
      }

      doCycleFetchFallback();
    });
}
