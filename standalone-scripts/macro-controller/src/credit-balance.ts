/**
 * Credit Balance API — Free Credit Detection via /workspaces/{id}/credit-balance
 *
 * Spec: spec/17-app-issues/free-credits-detect/overview.md (v1.1.0)
 *
 * Primary: API poll every 100s → daily_remaining >= MinDailyCredit
 * Fallback: XPath progress-bar check when API fails
 *
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 *
 * @see memory/architecture/networking/centralized-api-registry
 */

import { log, logSub } from './logging';
import { getBearerToken, markBearerTokenExpired } from './auth';
import { showToast } from './toast';
import { CREDIT_API_BASE, state } from './shared-state';
import { extractProjectIdFromUrl } from './workspace-detection';
import type { CreditBalanceResponse, CreditBalanceConfig, MacroControllerConfig, CreditStatusConfig } from './types';
import { logError } from './error-utils';

// ============================================
// Config — reads from window.__MARCO_CONFIG__.creditStatus.balance
// ============================================
const cfg = (window.__MARCO_CONFIG__ || {}) as Partial<MacroControllerConfig>;
const creditStatusCfg = (cfg.creditStatus || {}) as Partial<CreditStatusConfig>;
const balanceCfg = (creditStatusCfg.balance || {}) as Partial<CreditBalanceConfig>;

export const BALANCE_CONFIG: CreditBalanceConfig = {
  checkIntervalSeconds: balanceCfg.checkIntervalSeconds ?? 100,
  minDailyCredit: balanceCfg.minDailyCredit ?? 2,
  enableApiDetection: balanceCfg.enableApiDetection !== false,
  fallbackToXPath: balanceCfg.fallbackToXPath !== false,
};

// ============================================
// CreditBalanceState — encapsulated module state (CQ11, CQ17)
// ============================================
const MIN_CALL_GAP_MS = 10_000;

class CreditBalanceState {
  private _lastBalanceCallAt = 0;
  private _resolvedWorkspaceId: string | null = null;
  private _resolvedWorkspaceName: string | null = null;

  get lastBalanceCallAt(): number { return this._lastBalanceCallAt; }
  set lastBalanceCallAt(value: number) { this._lastBalanceCallAt = value; }

  get resolvedWorkspaceId(): string | null { return this._resolvedWorkspaceId; }
  set resolvedWorkspaceId(value: string | null) { this._resolvedWorkspaceId = value; }

  get resolvedWorkspaceName(): string | null { return this._resolvedWorkspaceName; }
  set resolvedWorkspaceName(value: string | null) { this._resolvedWorkspaceName = value; }

  clear(): void {
    this._resolvedWorkspaceId = null;
    this._resolvedWorkspaceName = null;
  }
}

const creditBalanceState = new CreditBalanceState();

export function getResolvedWorkspaceId(): string | null { return creditBalanceState.resolvedWorkspaceId; }
export function getResolvedWorkspaceName(): string | null { return creditBalanceState.resolvedWorkspaceName; }
export function clearResolvedWorkspace(): void {
  creditBalanceState.clear();
}

// ============================================
// Helper — auth failure check
// ============================================

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// ============================================
// resolveWorkspaceId — GET /projects/{projectId}/workspace
// Uses marco.api.call() for non-registry endpoint
// ============================================
export async function resolveWorkspaceId(): Promise<string | null> {
  if (creditBalanceState.resolvedWorkspaceId) {
    return creditBalanceState.resolvedWorkspaceId;
  }

  const projectId = extractProjectIdFromUrl();

  if (!projectId) {
    log('CreditBalance: No projectId in URL — cannot resolve workspace', 'warn');

    return null;
  }

  /**
   * Uses getBearerToken() (Auth Bridge) instead of raw resolveToken().
   * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/01-deep-audit.md (RCA-3)
   */
  const token = await getBearerToken();

  if (!token) {
    log('CreditBalance: No bearer token — cannot resolve workspace', 'warn');

    return null;
  }

  log('CreditBalance: Resolving workspace for project ' + projectId, 'check');

  try {
    const resp = await window.marco!.api!.workspace.resolveByProject(projectId, { baseUrl: CREDIT_API_BASE });

    if (!resp.ok) {
      if (isAuthFailure(resp.status)) {
        markBearerTokenExpired('credit-balance-ws');
      }

      logError('CreditBalance', 'Workspace resolve failed — HTTP ' + resp.status);

      return null;
    }

    const data = resp.data as { workspace?: { id?: string; name?: string } };
    const ws = data.workspace;

    if (!ws || !ws.id) {
      logError('CreditBalance', 'Workspace response missing workspace.id');

      return null;
    }

    creditBalanceState.resolvedWorkspaceId = ws.id;
    creditBalanceState.resolvedWorkspaceName = ws.name || '';
    log('CreditBalance: ✅ Workspace resolved — id="' + ws.id + '" name="' + ws.name + '"', 'success');

    return ws.id;
  } catch (err) {
    logError('CreditBalance', 'Workspace resolve error: ' + (err as Error).message);

    return null;
  }
}

// ============================================
// fetchCreditBalance — GET /workspaces/{id}/credit-balance
// Uses marco.api.credits.fetchBalance()
// ============================================
// eslint-disable-next-line max-lines-per-function
export async function fetchCreditBalance(
  workspaceId?: string,
  isRetry?: boolean,
): Promise<CreditBalanceResponse | null> {
  const wsId = workspaceId || creditBalanceState.resolvedWorkspaceId;

  if (!wsId) {
    const resolved = await resolveWorkspaceId();

    if (!resolved) {
      log('CreditBalance: No workspace ID — skipping API, will use fallback', 'warn');

      return null;
    }

    return fetchCreditBalance(resolved, isRetry);
  }

  const isRateLimited = Date.now() - creditBalanceState.lastBalanceCallAt < MIN_CALL_GAP_MS;

  if (isRateLimited) {
    log('CreditBalance: Rate-limited — last call ' + Math.floor((Date.now() - creditBalanceState.lastBalanceCallAt) / 1000) + 's ago', 'skip');

    return null;
  }

  creditBalanceState.lastBalanceCallAt = Date.now();

  const token = await getBearerToken();

  if (!token) {
    log('CreditBalance: No bearer token', 'warn');

    return null;
  }

  log('CreditBalance: GET /workspaces/' + wsId + '/credit-balance' + (isRetry ? ' (RETRY)' : ''), 'check');

  /**
   * Sequential auth recovery via getBearerToken({ force: true }).
   * NO recursive fetchCreditBalance() call. NO direct recoverAuthOnce().
   * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/00-overview.md
   * @see spec/17-app-issues/88-auth-loading-failure-retry-inconsistency/01-deep-audit.md (RCA-3)
   */
  try {
    const resp = await window.marco!.api!.credits.fetchBalance(wsId, { baseUrl: CREDIT_API_BASE });

    if (!resp.ok) {
      if (isAuthFailure(resp.status) && !isRetry) {
        markBearerTokenExpired('credit-balance');
        log('CreditBalance: Auth ' + resp.status + ' — forcing token refresh...', 'warn');
        const newToken = await getBearerToken({ force: true });

        if (!newToken) {
          logError('CreditBalance', 'Token refresh failed — skipping');

          return null;
        }

        // Sequential retry — NOT recursive
        const retryResp = await window.marco!.api!.credits.fetchBalance(wsId, { baseUrl: CREDIT_API_BASE });

        if (!retryResp.ok) {
          logError('CreditBalance', 'HTTP ' + retryResp.status + ' after recovery');

          return null;
        }

        const retryData = retryResp.data as unknown as CreditBalanceResponse;

        if (typeof retryData.daily_remaining !== 'number') {
          logError('CreditBalance', 'Response missing daily_remaining after recovery');

          return null;
        }

        logSub('daily_remaining=' + retryData.daily_remaining + ' (after recovery)', 1);

        return retryData;
      }

      logError('CreditBalance', 'HTTP ' + resp.status);

      return null;
    }

    const data = resp.data as unknown as CreditBalanceResponse;

    if (typeof data.daily_remaining !== 'number') {
      logError('CreditBalance', 'Response missing daily_remaining — treating as failure');

      return null;
    }

    logSub('daily_remaining=' + data.daily_remaining + ' daily_limit=' + data.daily_limit + ' total_remaining=' + data.total_remaining, 1);

    return data;
  } catch (err) {
    logError('CreditBalance', 'Network error: ' + (err as Error).message);

    return null;
  }
}

// ============================================
// checkAndActOnCreditBalance — The main free-credit detection function
// ============================================
export async function checkAndActOnCreditBalance(): Promise<boolean> {
  if (!BALANCE_CONFIG.enableApiDetection) {
    log('CreditBalance: API detection disabled in config', 'skip');

    return false;
  }

  const response = await fetchCreditBalance();

  if (!response) {
    log('CreditBalance: API failed — fallback to XPath if enabled', 'warn');

    return false;
  }

  const dailyRemaining = response.daily_remaining;
  const threshold = BALANCE_CONFIG.minDailyCredit;
  const hasFree = dailyRemaining >= threshold;

  state.hasFreeCredit = hasFree;

  if (hasFree) {
    log('CreditBalance: ✅ Daily credits (' + dailyRemaining + ') >= threshold (' + threshold + ') — NO move needed', 'success');

    return true;
  }

  const direction = state.direction || 'down';
  log('CreditBalance: ⚠️ Daily credits (' + dailyRemaining + ') below threshold (' + threshold + '), moving ' + direction, 'delegate');
  showToast('Daily credits (' + dailyRemaining + ') below threshold (' + threshold + ') — moving ' + direction, 'warn', { noStop: true });

  const { performDirectMove } = await import('./loop-dom-fallback');
  performDirectMove(direction);

  return true;
}
