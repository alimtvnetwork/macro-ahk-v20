/**
 * MacroLoop Controller — Startup Token Readiness Gate
 *
 * Polls resolveToken() at short intervals until a bearer token
 * is available or the timeout expires. Proactively triggers
 * extension bridge refresh if no local token exists.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { getAuthDebugSnapshot, resolveToken, refreshBearerTokenFromBestSource } from './auth';
import { log } from './logging';

export interface TokenReadyResult {
  token: string;
  waitedMs: number;
  reason: string;
}

/**
 * Polls resolveToken() at short intervals until a token is available
 * or the timeout expires. Returns immediately if a token already exists.
 */
// CQ16: Extracted token gate context + helpers
interface TokenGateCtx {
  settled: boolean;
  refreshInFlight: boolean;
  lastRefreshAt: number;
  timer: ReturnType<typeof setInterval> | null;
  startedAt: number;
  pollCount: number;
  refreshCount: number;
  resolve: (result: TokenReadyResult) => void;
}

const POLL_INTERVAL_MS = 250;
const REFRESH_RETRY_MS = 1500;
export const AUTH_READY_TIMEOUT_MS = 2_000;

function buildTimeoutReason(ctx: TokenGateCtx, waitedMs: number): string {
  const diag = getAuthDebugSnapshot();
  const bridgeState = diag.bridgeOutcome.success
    ? 'hit:' + (diag.bridgeOutcome.source || 'bridge')
    : ctx.refreshInFlight
      ? 'in-flight'
      : diag.bridgeOutcome.attempted
        ? 'miss:' + (diag.bridgeOutcome.error || 'empty')
        : 'not-attempted';
  const visibleCookies = diag.visibleCookieNames.length > 0
    ? diag.visibleCookieNames.join(',')
    : 'none';

  return 'Timeout — no token after ' + Math.round(waitedMs / 1000) + 's'
    + ' | source=' + diag.tokenSource
    + ' | bridge=' + bridgeState
    + ' | visibleCookies=' + visibleCookies
    + ' | polls=' + ctx.pollCount
    + ' | refreshes=' + ctx.refreshCount;
}

function finishTokenGate(ctx: TokenGateCtx, result: TokenReadyResult): void {
  if (ctx.settled) {
    return;
  }
  ctx.settled = true;
  if (ctx.timer !== null) { clearInterval(ctx.timer); }

  log(
    '[TokenGate] Settled — polls=' + ctx.pollCount
    + ', refreshes=' + ctx.refreshCount
    + ', waited=' + result.waitedMs + 'ms'
    + ', reason=' + result.reason,
    result.token ? 'success' : 'warn',
  );

  ctx.resolve(result);
}

function maybeRefreshFromExtension(ctx: TokenGateCtx): void {
  if (ctx.refreshInFlight) {
    return;
  }
  const now = Date.now();
  const isTooSoon = (now - ctx.lastRefreshAt) < REFRESH_RETRY_MS;
  if (isTooSoon) {
    return;
  }

  ctx.refreshInFlight = true;
  ctx.lastRefreshAt = now;
  ctx.refreshCount++;
  const refreshIdx = ctx.refreshCount;
  const tRefresh = performance.now();

  log('[TokenGate] Refresh #' + refreshIdx + ' started (' + (Date.now() - ctx.startedAt) + 'ms into gate)', 'check');

  refreshBearerTokenFromBestSource(function (refreshedToken: string, source: string) {
    ctx.refreshInFlight = false;
    const refreshMs = (performance.now() - tRefresh).toFixed(1);
    const hasToken = !!refreshedToken;

    if (hasToken) {
      log('[TokenGate] Refresh #' + refreshIdx + ' resolved in ' + refreshMs + 'ms via ' + (source || 'extension-bridge'), 'success');
      finishTokenGate(ctx, {
        token: refreshedToken,
        waitedMs: Date.now() - ctx.startedAt,
        reason: 'refreshed-from-' + (source || 'extension-bridge'),
      });
    } else {
      log('[TokenGate] Refresh #' + refreshIdx + ' returned empty after ' + refreshMs + 'ms', 'warn');
    }
  }, { skipSessionBridgeCache: true });
}

export function ensureTokenReady(timeoutMs: number = AUTH_READY_TIMEOUT_MS): Promise<TokenReadyResult> {
  return new Promise<TokenReadyResult>(function (resolve) {
    const ctx: TokenGateCtx = {
      settled: false, refreshInFlight: false, lastRefreshAt: 0,
      timer: null, startedAt: Date.now(), resolve,
      pollCount: 0, refreshCount: 0,
    };

    log('[TokenGate] Started — timeout=' + timeoutMs + 'ms, pollInterval=' + POLL_INTERVAL_MS + 'ms', 'check');

    const immediateToken = resolveToken();
    const hasImmediate = !!immediateToken;

    if (hasImmediate) {
      log('[TokenGate] Immediate token available — 0ms', 'success');
      finishTokenGate(ctx, { token: immediateToken, waitedMs: 0, reason: 'immediate' });

      return;
    }

    log('[TokenGate] No immediate token — starting poll + refresh waterfall', 'check');
    maybeRefreshFromExtension(ctx);

    ctx.timer = setInterval(function () {
      ctx.pollCount++;
      const token = resolveToken();
      const elapsed = Date.now() - ctx.startedAt;
      const hasToken = !!token;

      if (hasToken) {
        log('[TokenGate] Poll #' + ctx.pollCount + ' resolved at ' + elapsed + 'ms', 'success');
        finishTokenGate(ctx, { token, waitedMs: elapsed, reason: 'resolved' });

        return;
      }

      maybeRefreshFromExtension(ctx);

      const isTimedOut = elapsed >= timeoutMs;

      if (isTimedOut) {
        finishTokenGate(ctx, { token: '', waitedMs: elapsed, reason: buildTimeoutReason(ctx, elapsed) });
      }
    }, POLL_INTERVAL_MS);
  });
}
