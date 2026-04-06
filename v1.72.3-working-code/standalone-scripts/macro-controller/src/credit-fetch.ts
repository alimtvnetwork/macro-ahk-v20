/**
 * MacroLoop Controller — Credit Fetch & Parse
 *
 * Extracted from macro-looping.ts IIFE (Step 2, registry pattern).
 * Contains: parseLoopApiResponse, fetchLoopCredits, fetchLoopCreditsAsync, syncCreditStateFromApi.
 * Uses MacroController singleton for cross-module calls.
 *
 * v7.39: Replaced recursive retry with single retry after recoverAuthOnce() (RCA-1 fix).
 *        Auth toasts now use noStop:true to avoid stopping loop on recoverable errors.
 * See: spec/02-app-issues/authentication-freeze-and-retry-loop.md (RCA-1, RCA-2)
 */

import { log, logSub } from './logging';
import { resolveToken, invalidateSessionBridgeKey, markBearerTokenExpired, recoverAuthOnce, LAST_TOKEN_SOURCE, getAuthDebugSnapshot } from './auth';
import { showToast } from './toast';
import { dualWrite, nsCall } from './api-namespace';
import {
  CREDIT_API_BASE, loopCreditState, state,
} from './shared-state';
import { calcTotalCredits, calcAvailableCredits } from './credit-api';

import { MacroController } from './core/MacroController';

function mc() { return MacroController.getInstance(); }

// ============================================
// Workspace Tier Enum
// ============================================
export const enum WsTier {
  FREE     = 'FREE',
  LITE     = 'LITE',
  PRO      = 'PRO',
  EXPIRED  = 'EXPIRED',
}

export const WS_TIER_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  FREE:    { label: 'FREE',    bg: 'rgba(255,255,255,0.08)', fg: '#94a3b8' },
  LITE:    { label: 'LITE',    bg: '#3b82f6',                fg: '#fff' },
  PRO:     { label: 'PRO',     bg: '#F59E0B',                fg: '#1a1a2e' },
  EXPIRED: { label: 'EXPIRED', bg: '#7f1d1d',                fg: '#fca5a5' },
};

/**
 * Derive workspace tier from plan name + subscription status + billing limit.
 * - plan "free" or empty + no billing → FREE
 * - plan "ktlo" or "lite" → LITE
 * - plan "free" + subStatus "canceled"/"cancelled" → EXPIRED (was pro, now canceled)
 * - billing limit > 0 + subStatus "active" → PRO
 * - billing limit > 0 + subStatus canceled → EXPIRED
 */
export function resolveWsTier(plan: string, subStatus: string, billingLimit: number): string {
  const p = (plan || '').toLowerCase().trim();
  const s = (subStatus || '').toLowerCase().trim();

  // Lite / ktlo plan
  if (p === 'ktlo' || p === 'lite') return 'LITE';

  // Has billing = was/is pro
  if (billingLimit > 0 || (p && p !== 'free')) {
    if (s === 'active') return 'PRO';
    if (s === 'canceled' || s === 'cancelled' || s === 'past_due') return 'EXPIRED';
    return 'PRO'; // default if billing exists
  }

  // Free plan + canceled sub = expired trial/pro
  if (s === 'canceled' || s === 'cancelled') return 'EXPIRED';

  return 'FREE';
}

// ============================================
// parseLoopApiResponse — parse /user/workspaces API response
// ============================================
export function parseLoopApiResponse(data: Record<string, unknown>): boolean {
  const workspaces = (data.workspaces || data || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(workspaces)) {
    log('parseLoopApiResponse: unexpected response shape', 'warn');
    return false;
  }

  const perWs = [];
  for (let i = 0; i < workspaces.length; i++) {
    const rawWs = workspaces[i] as Record<string, unknown>;
    const ws = (rawWs.workspace || rawWs) as Record<string, number | string>;
    const bUsed = (ws.billing_period_credits_used as number) || 0;
    const bLimit = (ws.billing_period_credits_limit as number) || 0;
    const dUsed = (ws.daily_credits_used as number) || 0;
    const dLimit = (ws.daily_credits_limit as number) || 0;
    const rUsed = (ws.rollover_credits_used as number) || 0;
    const rLimit = (ws.rollover_credits_limit as number) || 0;
    const freeGranted = (ws.credits_granted as number) || 0;
    const freeUsed = (ws.credits_used as number) || 0;
    const freeRemaining = Math.max(0, Math.round(freeGranted - freeUsed));

    const dailyFree = Math.max(0, Math.round(dLimit - dUsed));
    const rollover = Math.max(0, Math.round(rLimit - rUsed));
    const billingAvailable = Math.max(0, Math.round(bLimit - bUsed));
    const topupLimit = Math.round((ws.topup_credits_limit as number) || 0);
    const totalCreditsUsed = Math.round((ws.total_credits_used as number) || 0);
    const totalCredits = calcTotalCredits(freeGranted, dLimit, bLimit, topupLimit, rLimit);
    const available = calcAvailableCredits(totalCredits, rUsed, dUsed, bUsed, freeUsed);

    const subStatus = ((rawWs.workspace ? (rawWs as Record<string, unknown>).subscription_status : ws.subscription_status) || '') as string;
    const role = ((rawWs.workspace ? (rawWs as Record<string, unknown>).role : ws.role) || 'N/A') as string;
    const plan = ((rawWs.workspace ? (rawWs as Record<string, unknown>).plan : ws.plan) || (rawWs.plan as string) || '') as string;

    perWs.push({
      id: (ws.id as string) || '',
      name: ((ws.name as string) || 'WS' + i).substring(0, 12),
      fullName: (ws.name as string) || 'WS' + i,
      dailyFree: dailyFree, dailyLimit: Math.round(dLimit),
      dailyUsed: Math.round(dUsed),
      rollover: rollover, rolloverLimit: Math.round(rLimit),
      rolloverUsed: Math.round(rUsed),
      available: available, billingAvailable: billingAvailable,
      used: Math.round(bUsed),
      limit: Math.round(bLimit),
      freeGranted: Math.round(freeGranted), freeRemaining: freeRemaining,
      hasFree: freeGranted > 0 && freeUsed < freeGranted,
      topupLimit: topupLimit,
      totalCreditsUsed: totalCreditsUsed,
      totalCredits: totalCredits,
      subscriptionStatus: subStatus, plan: plan, role: role,
      tier: resolveWsTier(plan, subStatus, bLimit),
      raw: ws
    });
  }

  loopCreditState.perWorkspace = perWs;
  loopCreditState.lastCheckedAt = Date.now();

  // Aggregate totals
  let tdf = 0, tr = 0, ta = 0, tba = 0;
  for (let j = 0; j < perWs.length; j++) {
    tdf += perWs[j].dailyFree;
    tr += perWs[j].rollover;
    ta += perWs[j].available;
    tba += perWs[j].billingAvailable;
  }
  loopCreditState.totalDailyFree = tdf;
  loopCreditState.totalRollover = tr;
  loopCreditState.totalAvailable = ta;
  loopCreditState.totalBillingAvail = tba;

  // v7.9.19: Match current workspace by name
  if (state.workspaceName && perWs.length > 0) {
    for (let k = 0; k < perWs.length; k++) {
      if (perWs[k].fullName === state.workspaceName || perWs[k].name === state.workspaceName) {
        loopCreditState.currentWs = perWs[k];
        break;
      }
    }
  }

  // v7.9.20: Build wsById dictionary for O(1) lookup
  loopCreditState.wsById = {};
  for (let w = 0; w < perWs.length; w++) {
    if (perWs[w].id) {
      loopCreditState.wsById[perWs[w].id] = perWs[w];
    }
  }

  loopCreditState.source = 'api';
  log('Credit API: parsed ' + perWs.length + ' workspaces — dailyFree=' + tdf + ' rollover=' + tr + ' available=' + ta + ' | wsById keys=' + Object.keys(loopCreditState.wsById).length, 'success');
  return true;
}

// ============================================
// Helper: delay utility
// ============================================
function delay(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

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

function emitAuthFailureToast(url: string, headers: Record<string, string>, status: number, statusText: string): void {
  const detail = buildAuthFailureDetail();
  log('Credit API auth failure diagnostics:\n' + detail, 'error');
  showToast(
    'Authentication failed. Tried localStorage → extension bridge → cookie fallback. Click copy for exact cookie names + bridge outcome.',
    'error',
    {
      noStop: true,
      requestDetail: {
        method: 'GET',
        url: url,
        headers: headers,
        status: status,
        statusText: statusText,
        responseBody: detail,
      },
    },
  );
}

// ============================================
// fetchLoopCredits — callback-style credit fetch
// v7.39: No longer recursively calls itself. Uses recoverAuthOnce + single retry.
// ============================================
export function fetchLoopCredits(
  isRetry?: boolean,
  autoDetectFn?: (token: string) => Promise<void>,
): void {
  const url = CREDIT_API_BASE + '/user/workspaces';
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
  const token = resolveToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  log('Credit API: GET ' + url + (isRetry ? ' (RETRY after recovery)' : ''), 'check');
  logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : 'cookies only (no bearer)'), 1);

  if (!token) {
    const preflight = getAuthDebugSnapshot();
    logSub('Auth preflight: no bearer. Session cookie names=' + preflight.sessionCookieNames.join(', '), 1);
    logSub('Auth preflight flow: ' + preflight.flow, 1);
  }

  fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
    .then(function(resp: Response) {
      const respContentType = resp.headers.get('content-type') || '(none)';
      const respContentLength = resp.headers.get('content-length') || '(not set)';
      log('Credit API: Response status=' + resp.status + ' statusText="' + resp.statusText + '" content-type="' + respContentType + '" content-length=' + respContentLength, 'check');
      if (!resp.ok) {
        if ((resp.status === 401 || resp.status === 403) && !isRetry) {
          // v7.39: Invalidate token, recover, retry ONCE (no recursion)
          markBearerTokenExpired('credit-fetch');
          if (token) invalidateSessionBridgeKey(token);
          log('Credit API: Auth ' + resp.status + ' — attempting recovery before single retry...', 'warn');
          showToast('Auth ' + resp.status + ' — recovering session...', 'warn', {
            noStop: true,
            requestDetail: { method: 'GET', url: url, headers: headers, status: resp.status, statusText: resp.statusText }
          });

          delay(500).then(function() {
            return recoverAuthOnce();
          }).then(function(newToken: string) {
            if (!newToken) {
              log('Credit API: Auth recovery failed — no retry', 'error');
              emitAuthFailureToast(url, headers, resp.status, resp.statusText);
              mc().ui.update();
              return;
            }
            // Single retry with recovered token
            fetchLoopCredits(true, autoDetectFn);
          });
          return;
        }
        if (resp.status === 401 || resp.status === 403) {
          markBearerTokenExpired('credit-fetch');
        }
        return resp.text().then(function(errBody: string) {
          log('Credit API: HTTP ' + resp.status + ' error body: ' + (errBody || '(empty)').substring(0, 500), 'error');
          showToast('Credit API error: HTTP ' + resp.status, 'error', {
            noStop: true,
            requestDetail: { method: 'GET', url: url, headers: headers, status: resp.status, statusText: resp.statusText, responseBody: (errBody || '').substring(0, 500) }
          });
          throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
        });
      }
      return resp.text().then(function(bodyText: string) {
        bodyText = (bodyText || '').trim();
        logSub('Credit API: body length=' + bodyText.length + ' preview="' + (bodyText || '(empty)').substring(0, 200) + '"', 1);
        if (!bodyText) {
          throw new Error('Empty response body from ' + url);
        }
        let data: Record<string, unknown>;
        try { data = JSON.parse(bodyText); } catch(e) {
          throw new Error('JSON parse failed: ' + (e as Error).message + ' | raw: "' + bodyText.substring(0, 300) + '"');
        }
        return data;
      });
    })
    .then(function(data: Record<string, unknown> | undefined) {
      if (!data) return;
      const ok = parseLoopApiResponse(data);
      if (ok) {
        const freshToken = resolveToken();
        dualWrite('__loopResolvedToken', '_internal.resolvedToken', freshToken);
        if (autoDetectFn) {
          autoDetectFn(freshToken).then(function() {
            syncCreditStateFromApi();
            mc().ui.update();
            log('Credit API: display updated (workspace detected)', 'success');
            nsCall('__loopUpdateAuthDiag', '_internal.updateAuthDiag');
          });
        } else {
          syncCreditStateFromApi();
          mc().ui.update();
          nsCall('__loopUpdateAuthDiag', '_internal.updateAuthDiag');
        }
      }
    })
    .catch(function(err: Error) {
      log('Credit API failed: ' + err.message, 'error');
      logSub('URL: ' + url, 1);
      logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : 'NO TOKEN (cookies only)'), 1);
      logSub('Token source: ' + LAST_TOKEN_SOURCE, 1);
      logSub('isRetry: ' + (isRetry ? 'YES' : 'NO'), 1);
      logSub('Hint: If 401/403, the token may be expired. Check extension bridge or re-login.', 1);
      nsCall('__loopUpdateAuthDiag', '_internal.updateAuthDiag');
      mc().ui.update();
    });
}

// ============================================
// fetchLoopCreditsAsync — Promise-returning version
// v7.39: No longer recursively calls itself. Uses recoverAuthOnce + single retry.
// v7.42: In-flight deduplication — concurrent calls share the same promise.
// ============================================
let _inFlightCreditsAsync: Promise<void> | null = null;

export function fetchLoopCreditsAsync(isRetry?: boolean): Promise<void> {
  // Dedup: if a non-retry fetch is already in-flight, return existing promise
  if (!isRetry && _inFlightCreditsAsync) {
    log('Credit API (async): deduped — returning in-flight promise', 'skip');
    return _inFlightCreditsAsync;
  }

  const promise = _doFetchLoopCreditsAsync(isRetry);

  if (!isRetry) {
    _inFlightCreditsAsync = promise.finally(function() {
      _inFlightCreditsAsync = null;
    });
    return _inFlightCreditsAsync;
  }
  return promise;
}

function _doFetchLoopCreditsAsync(isRetry?: boolean): Promise<void> {
  const url = CREDIT_API_BASE + '/user/workspaces';
  let token = resolveToken();

  const tokenReadyPromise = (!token && !isRetry)
    ? (function() {
      log('Credit API (async): no bearer token preflight — attempting proactive recoverAuthOnce()', 'warn');
      return recoverAuthOnce().then(function(recoveredToken: string) {
        token = recoveredToken || '';
        return token;
      });
    })()
    : Promise.resolve(token);

  return tokenReadyPromise.then(function(preflightToken: string) {
    token = preflightToken || resolveToken();

    const headers: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    log('Credit API (async): GET ' + url + (isRetry ? ' (RETRY after recovery)' : ''), 'check');

    if (!token) {
      const preflightDetail = buildAuthFailureDetail().replace(/\n/g, ' | ');
      log('Credit API (async): still no bearer after preflight; proceeding with cookie credentials only', 'warn');
      logSub('Auth preflight detail: ' + preflightDetail, 1);
    }

    return fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp: Response): Promise<string | void> {
        if (!resp.ok) {
          if ((resp.status === 401 || resp.status === 403) && !isRetry) {
            // v7.39: Invalidate, recover with delay, retry ONCE
            markBearerTokenExpired('credit-fetch-async');
            if (token) invalidateSessionBridgeKey(token);
            log('Credit API (async): Auth ' + resp.status + ' — recovering session before retry...', 'warn');
            showToast('Auth ' + resp.status + ' — recovering session...', 'warn', { noStop: true });

            return delay(500)
              .then(function() { return recoverAuthOnce(); })
              .then(function(newToken: string) {
                if (!newToken) {
                  emitAuthFailureToast(url, headers, resp.status, resp.statusText);
                  throw new Error('AUTH_RECOVERY_FAILED');
                }
                return fetchLoopCreditsAsync(true);
              }) as unknown as Promise<string | void>;
          }
          if (resp.status === 401 || resp.status === 403) {
            markBearerTokenExpired('credit-fetch-async');
          }
          throw new Error('HTTP ' + resp.status);
        }
        return resp.text();
      })
      .then(function(bodyText: string | void) {
        if (!bodyText) return;
        bodyText = (bodyText || '').trim();
        if (!bodyText) throw new Error('Empty response body');
        const data = JSON.parse(bodyText);
        parseLoopApiResponse(data);
        log('Credit API (async): parsed ' + (loopCreditState.perWorkspace || []).length + ' workspaces', 'success');
      });
  });
}

// ============================================
// syncCreditStateFromApi — sync loop state from API data
// ============================================
export function syncCreditStateFromApi(): void {
  const cws = loopCreditState.currentWs;
  if (!cws) {
    logSub('syncCreditState: no currentWs — cannot determine credit', 1);
    return;
  }
  const dailyFree = cws.dailyFree || 0;
  const hasCredit = dailyFree > 0;
  state.hasFreeCredit = hasCredit;
  state.isIdle = !hasCredit;
  state.lastStatusCheck = Date.now();
  log('API Credit Sync: ' + cws.fullName + ' dailyFree=' + dailyFree + ' (available=' + cws.available + ') → ' + (hasCredit ? '[Y] FREE CREDIT' : '[N] NO FREE CREDIT → will move'), hasCredit ? 'success' : 'warn');
}
