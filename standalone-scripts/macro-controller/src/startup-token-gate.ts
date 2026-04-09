/**
 * MacroLoop Controller — Startup Token Readiness Gate
 *
 * Polls resolveToken() at short intervals until a bearer token
 * is available or the timeout expires. Proactively triggers
 * extension bridge refresh if no local token exists.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { resolveToken, refreshBearerTokenFromBestSource } from './auth';
import { TOKEN_POLL_INTERVAL_MS as POLL_INTERVAL_MS, TOKEN_REFRESH_RETRY_MS as REFRESH_RETRY_MS } from './constants';

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
  resolve: (result: TokenReadyResult) => void;
}

function finishTokenGate(ctx: TokenGateCtx, result: TokenReadyResult): void {
  if (ctx.settled) return;
  ctx.settled = true;
  if (ctx.timer !== null) { clearInterval(ctx.timer); }
  ctx.resolve(result);
}

function maybeRefreshFromExtension(ctx: TokenGateCtx): void {
  if (ctx.refreshInFlight) return;
  const now = Date.now();
  const isTooSoon = (now - ctx.lastRefreshAt) < REFRESH_RETRY_MS;
  if (isTooSoon) return;

  ctx.refreshInFlight = true;
  ctx.lastRefreshAt = now;

  refreshBearerTokenFromBestSource(function (refreshedToken: string, source: string) {
    ctx.refreshInFlight = false;
    const hasToken = !!refreshedToken;

    if (hasToken) {
      finishTokenGate(ctx, {
        token: refreshedToken,
        waitedMs: Date.now() - ctx.startedAt,
        reason: 'refreshed-from-' + (source || 'extension-bridge'),
      });
    }
  }, { skipSessionBridgeCache: true });
}

export function ensureTokenReady(timeoutMs: number): Promise<TokenReadyResult> {
  return new Promise<TokenReadyResult>(function (resolve) {
    const ctx: TokenGateCtx = {
      settled: false, refreshInFlight: false, lastRefreshAt: 0,
      timer: null, startedAt: Date.now(), resolve,
    };

    const immediateToken = resolveToken();
    const hasImmediate = !!immediateToken;

    if (hasImmediate) {
      finishTokenGate(ctx, { token: immediateToken, waitedMs: 0, reason: 'immediate' });

      return;
    }

    maybeRefreshFromExtension(ctx);

    ctx.timer = setInterval(function () {
      const token = resolveToken();
      const elapsed = Date.now() - ctx.startedAt;
      const hasToken = !!token;

      if (hasToken) {
        finishTokenGate(ctx, { token, waitedMs: elapsed, reason: 'resolved' });

        return;
      }

      maybeRefreshFromExtension(ctx);

      const isTimedOut = elapsed >= timeoutMs;

      if (isTimedOut) {
        finishTokenGate(ctx, { token: '', waitedMs: elapsed, reason: 'Timeout — no token after ' + Math.round(elapsed / 1000) + 's. Ensure you are logged in.' });
      }
    }, POLL_INTERVAL_MS);
  });
}
