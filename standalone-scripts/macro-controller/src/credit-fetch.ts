/**
 * MacroLoop Controller — Credit Fetch
 *
 * Contains: fetchLoopCredits, fetchLoopCreditsAsync (network layer).
 * Barrel re-exports parseLoopApiResponse, syncCreditStateFromApi, tier utils from credit-parser.
 *
 * v7.39: Replaced recursive retry with single retry after recoverAuthOnce() (RCA-1 fix).
 *        Auth toasts now use noStop:true to avoid stopping loop on recoverable errors.
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 * v2.136: Removed recursive self-calls per issue #88. Sequential pattern only.
 *
 * NO RETRY POLICY: Auth recovery uses getBearerToken({ force: true }) once.
 * If it fails, emit error. No recursive fetchLoopCredits(true) calls.
 * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
 * @see standalone-scripts/macro-controller/diagrams/inconsistencies/auth-retry-inconsistencies.mmd
 *
 * @see spec/17-app-issues/authentication-freeze-and-retry-loop.md (RCA-1, RCA-2)
 * @see memory/architecture/networking/centralized-api-registry
 */

import { log, logSub } from './logging';
import { markBearerTokenExpired, getLastTokenSource, getAuthDebugSnapshot, getBearerToken } from './auth';
import { showToast } from './toast';
import { dualWrite, nsCall } from './api-namespace';

import { MacroController } from './core/MacroController';

import { CREDIT_API_BASE, loopCreditState } from './shared-state';
import { parseLoopApiResponse, syncCreditStateFromApi } from './credit-parser';
import type { WorkspacesApiResponse } from './types';
import { logError } from './error-utils';

const API_USER_WORKSPACES = '/user/workspaces';
const NS_UPDATEAUTHDIAG = '_internal.updateAuthDiag';

function mc() { return MacroController.getInstance(); }

// ============================================
// Helper — call marco.api.credits.fetchWorkspaces
// ============================================

interface SdkApiResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly data: Record<string, string | number | boolean | null>;
  readonly headers: Record<string, string>;
}

async function apiFetchWorkspaces(): Promise<SdkApiResponse> {
  return window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// ============================================
// Auth diagnostics helpers
// ============================================

function buildAuthFailureDetail(): string {
  const snapshot = getAuthDebugSnapshot();
  const bridgeText = !snapshot.bridgeOutcome.attempted
    ? 'not attempted'
    : (snapshot.bridgeOutcome.success
      ? 'success via ' + snapshot.bridgeOutcome.source
      : 'failed' + (snapshot.bridgeOutcome.error ? ' — ' + snapshot.bridgeOutcome.error : ''));

  const visibleNames = snapshot.visibleCookieNames.length > 0
    ? snapshot.visibleCookieNames.join(', ')
    : '(none visible to page JS)';

  return [
    'Auth flow: ' + snapshot.flow,
    'Token source: ' + snapshot.tokenSource,
    'Resolved token available: ' + (snapshot.hasResolvedToken ? 'YES' : 'NO'),
    'Session cookie names from bindings: [' + snapshot.sessionCookieNames.join(', ') + ']',
    'Bridge outcome: ' + bridgeText,
    'Visible cookie names in document.cookie: [' + visibleNames + ']',
  ].join('\n');
}

function emitAuthFailureToast(status: number, statusText: string): void {
  const detail = buildAuthFailureDetail();
  logError('unknown', 'Credit API auth failure diagnostics:\n' + detail);

  showToast(
    'Authentication failed. Tried localStorage → extension bridge → cookie fallback. Click copy for exact cookie names + bridge outcome.',
    'error',
    {
      noStop: true,
      requestDetail: {
        method: 'GET', url: CREDIT_API_BASE + API_USER_WORKSPACES, headers: {}, status, statusText, responseBody: detail,
      },
    },
  );
}

// ============================================
// Auth recovery flow — extracted for reuse
// ============================================

async function handleAuthRecovery(
  status: number,
  statusText: string,
): Promise<string | null> {
  markBearerTokenExpired('credit-fetch');

  log('Credit API: Auth ' + status + ' — forcing token refresh before retry...', 'warn');
  showToast('Auth ' + status + ' — recovering session...', 'warn', {
    noStop: true,
    requestDetail: { method: 'GET', url: CREDIT_API_BASE + API_USER_WORKSPACES, headers: {}, status, statusText },
  });

  const newToken = await getBearerToken({ force: true });

  if (!newToken) {
    logError('Credit API', 'Auth recovery failed — no retry');
    emitAuthFailureToast(status, statusText);

    return null;
  }

  log('Credit API: Token refreshed via getBearerToken({ force }) — retrying', 'check');

  return newToken;
}

// ============================================
// CQ4: Extracted helpers from fetchLoopCredits
// ============================================

function logCreditPreflight(token: string, isRetry?: boolean): void {
  log('Credit API: GET /user/workspaces' + (isRetry ? ' (RETRY after recovery)' : ''), 'check');
  logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : 'cookies only (no bearer)'), 1);

  if (!token) {
    const preflight = getAuthDebugSnapshot();
    logSub('Auth preflight: no bearer. Session cookie names=' + preflight.sessionCookieNames.join(', '), 1);
    logSub('Auth preflight flow: ' + preflight.flow, 1);
  }
}

function handleNonAuthError(resp: SdkApiResponse): void {
  if (isAuthFailure(resp.status)) {
    markBearerTokenExpired('credit-fetch');
  }

  const bodyPreview = JSON.stringify(resp.data).substring(0, 500);
  logError('Credit API', 'HTTP ' + resp.status + ' error body: ' + bodyPreview);

  showToast('Credit API error: HTTP ' + resp.status, 'error', {
    noStop: true,
    requestDetail: {
      method: 'GET', url: CREDIT_API_BASE + API_USER_WORKSPACES, headers: {}, status: resp.status, statusText: '', responseBody: bodyPreview,
    },
  });
}

async function processSuccessData(
  data: WorkspacesApiResponse,
  autoDetectFn?: (token: string) => Promise<void>,
): Promise<void> {
  const isParseOk = parseLoopApiResponse(data);
  if (!isParseOk) {
    return;
  }

  const freshToken = await getBearerToken();
  dualWrite('__loopResolvedToken', '_internal.resolvedToken', freshToken);

  if (autoDetectFn) {
    await autoDetectFn(freshToken);
    syncCreditStateFromApi();
    mc().updateUI();
    log('Credit API: display updated (workspace detected)', 'success');
    nsCall('__loopUpdateAuthDiag', NS_UPDATEAUTHDIAG);

    return;
  }

  syncCreditStateFromApi();
  mc().updateUI();
  nsCall('__loopUpdateAuthDiag', NS_UPDATEAUTHDIAG);
}

// ============================================
// fetchLoopCredits — callback-style credit fetch
// v7.50: Uses marco.api.credits.fetchWorkspaces() via SDK.
// ============================================
/**
 * fetchLoopCredits — callback-style credit fetch
 * v7.50: Uses marco.api.credits.fetchWorkspaces() via SDK.
 * v2.136: Sequential auth recovery — NO recursive self-call.
 * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
 */
export async function fetchLoopCredits(
  isRetry?: boolean,
  autoDetectFn?: (token: string) => Promise<void>,
): Promise<void> {
  const token = await getBearerToken();
  logCreditPreflight(token, isRetry);

  try {
    const resp = await apiFetchWorkspaces();

    if (!resp.ok) {
      if (isAuthFailure(resp.status) && !isRetry) {
        const recovered = await handleAuthRecovery(resp.status, '');
        if (!recovered) { mc().updateUI(); return; }

        // Sequential retry with recovered token — NOT a recursive self-call
        const retryResp = await apiFetchWorkspaces();
        if (!retryResp.ok) {
          handleNonAuthError(retryResp);
          return;
        }
        await processSuccessData(retryResp.data as WorkspacesApiResponse, autoDetectFn);
        return;
      }

      handleNonAuthError(resp);
      return;
    }

    const data = resp.data as WorkspacesApiResponse;
    logSub('Credit API: response received, data keys=' + Object.keys(data).join(','), 1);
    await processSuccessData(data, autoDetectFn);
  } catch (err) {
    logError('Credit API failed', '' + (err as Error).message);
    logSub('Token source: ' + getLastTokenSource(), 1);
    logSub('isRetry: ' + (isRetry ? 'YES' : 'NO'), 1);
    logSub('Hint: If 401/403, the token may be expired. Check extension bridge or re-login.', 1);
    nsCall('__loopUpdateAuthDiag', NS_UPDATEAUTHDIAG);
    mc().updateUI();
  }
}

// ============================================
// fetchLoopCreditsAsync — Promise-returning version
// v7.50: Uses marco.api via SDK.
// ============================================

class CreditAsyncState {
  private _inFlight: Promise<void> | null = null;

  get inFlight(): Promise<void> | null { return this._inFlight; }

  set inFlight(value: Promise<void> | null) { this._inFlight = value; }
}

const creditAsyncState = new CreditAsyncState();

export function fetchLoopCreditsAsync(isRetry?: boolean): Promise<void> {
  const isDedup = !isRetry && creditAsyncState.inFlight !== null;

  if (isDedup) {
    log('Credit API (async): deduped — returning in-flight promise', 'skip');

    return creditAsyncState.inFlight!;
  }

  const promise = doFetchLoopCreditsAsync(isRetry);

  if (!isRetry) {
    creditAsyncState.inFlight = promise.finally(function () { creditAsyncState.inFlight = null; });

    return creditAsyncState.inFlight;
  }

  return promise;
}

/**
 * handleAsyncAuthFailure — sequential recovery via getBearerToken({ force: true }).
 * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
 */
async function handleAsyncAuthFailure(resp: SdkApiResponse): Promise<void> {
  markBearerTokenExpired('credit-fetch-async');

  log('Credit API (async): Auth ' + resp.status + ' — forcing token refresh...', 'warn');
  showToast('Auth ' + resp.status + ' — recovering session...', 'warn', { noStop: true });

  const newToken = await getBearerToken({ force: true });

  if (!newToken) {
    emitAuthFailureToast(resp.status, '');
    throw new Error('AUTH_RECOVERY_FAILED');
  }

  log('Credit API (async): Token refreshed — retrying once sequentially', 'check');

  const retryResp = await apiFetchWorkspaces();

  if (!retryResp.ok) {
    if (isAuthFailure(retryResp.status)) { markBearerTokenExpired('credit-fetch-async'); }
    throw new Error('HTTP ' + retryResp.status + ' (after recovery)');
  }

  const data = retryResp.data as WorkspacesApiResponse;
  parseLoopApiResponse(data);
  log('Credit API (async): parsed ' + (loopCreditState.perWorkspace || []).length + ' workspaces (after recovery)', 'success');
}

async function doFetchLoopCreditsAsync(isRetry?: boolean): Promise<void> {
  const token = await getBearerToken(isRetry ? { force: true } : undefined);

  log('Credit API (async): GET /user/workspaces' + (isRetry ? ' (RETRY after recovery)' : ''), 'check');

  if (!token) {
    const preflightDetail = buildAuthFailureDetail().replace(/\n/g, ' | ');
    log('Credit API (async): still no bearer after preflight; proceeding with cookie credentials only', 'warn');
    logSub('Auth preflight detail: ' + preflightDetail, 1);
  }

  const resp = await apiFetchWorkspaces();

  if (!resp.ok) {
    if (isAuthFailure(resp.status) && !isRetry) {
      return handleAsyncAuthFailure(resp);
    }

    if (isAuthFailure(resp.status)) { markBearerTokenExpired('credit-fetch-async'); }
    throw new Error('HTTP ' + resp.status);
  }

  const data = resp.data as WorkspacesApiResponse;
  parseLoopApiResponse(data);
  log('Credit API (async): parsed ' + (loopCreditState.perWorkspace || []).length + ' workspaces', 'success');
}

// ============================================
// Barrel re-exports from credit-parser
// ============================================
export { parseLoopApiResponse, syncCreditStateFromApi, resolveWsTier, WsTier, WS_TIER_LABELS } from './credit-parser';
