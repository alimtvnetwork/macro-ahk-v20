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
import { getBearerToken, getLastTokenSource, markBearerTokenExpired } from './auth';
import { parseLoopApiResponse, syncCreditStateFromApi } from './credit-fetch';
import type { WorkspacesApiResponse } from './types';
import { MacroController } from './core/MacroController';
import { isUserTypingInPrompt } from './dom-helpers';
import { CREDIT_API_BASE, TIMING, loopCreditState, state } from './shared-state';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import { performDirectMove } from './loop-dom-fallback';
import { runCycleDomFallback } from './loop-dom-fallback';
import { checkAndActOnCreditBalance, BALANCE_CONFIG } from './credit-balance';
import { logError } from './error-utils';

/** Shorthand for MacroController singleton */
function mc() { return MacroController.getInstance(); }

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
    logError('Double-confirm', 'API fetch failed — HTTP ' + resp.status);

    return;
  }

  if (isLoopStale()) {
    log('SKIP: State changed during double-confirm fetch', 'skip');

    return;
  }

  const data = resp.data as WorkspacesApiResponse;
  parseLoopApiResponse(data);
  state.workspaceFromApi = false;

  const confirmToken = await getBearerToken();
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

  const cycleToken = await getBearerToken();
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
  await delay(2000);

  if (isLoopStale()) {
    log('SKIP: State changed during double-confirm wait', 'skip');

    return;
  }

  await doubleConfirmAndMove(threshold);
}

// ============================================
// handleCycleFetchError — log and release, NO retry/recovery.
// The loop interval is the natural retry mechanism.
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/01-deep-audit.md
// ============================================

function handleCycleFetchError(err: Error, freshToken: string): void {
  logError('Cycle', 'API fetch failed: ' + err.message + ' — skipping this cycle');
  logSub('Token: ' + (freshToken ? freshToken.substring(0, 12) + '...REDACTED' : 'NONE'), 1);
  logSub('Token source: ' + getLastTokenSource(), 1);
  showToast('Cycle failed: ' + err.message + ' — will retry next interval', 'warn', { noStop: true });
  runCycleDomFallback();
}

// ============================================
// doCycleFetchWithToken — single workspace API call via SDK.
// Auth failure = FAIL this cycle immediately. No recovery, no second attempt.
// The next scheduled cycle will obtain a fresh token via getBearerToken().
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/01-deep-audit.md (RCA-1, RCA-2)
// ============================================

async function doCycleFetchWithToken(): Promise<void> {
  const freshToken = await getBearerToken();

  log('Cycle API: GET /user/workspaces', 'check');
  logSub('Auth: ' + (freshToken ? 'Bearer ' + freshToken.substring(0, 12) + '...REDACTED' : 'NO TOKEN (cookies only)'), 1);
  logSub('Token source: ' + getLastTokenSource(), 1);

  try {
    const resp = await window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });

    if (!resp.ok && (resp.status === 401 || resp.status === 403) && freshToken) {
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
// doCycleFetchFallback — entry point for /user/workspaces fallback.
// Uses getBearerToken() for token resolution. No manual recovery.
// @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/01-deep-audit.md (RCA-2)
// ============================================

async function doCycleFetchFallback(): Promise<void> {
  const token = await getBearerToken();

  if (!token) {
    logError('Cycle fallback', 'No token from getBearerToken() — skipping this cycle');
    showToast('No auth token — will try again next cycle', 'warn', { noStop: true });
    releaseCycleLock();

    return;
  }

  await doCycleFetchWithToken();
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
