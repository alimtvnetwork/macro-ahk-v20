/**
 * MacroLoop Controller — Startup Token Readiness Gate
 *
 * Uses the unified getBearerToken() contract so startup, bridge, and
 * background all share the same readiness budget and diagnostics.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { getAuthDebugSnapshot, getBearerToken, getLastTokenSource, resolveToken } from './auth';
import { log } from './logging';

export interface TokenReadyResult {
  token: string;
  waitedMs: number;
  reason: string;
}

export interface StartupGateSnapshot {
  settled: boolean;
  token: boolean;
  waitedMs: number;
  reason: string;
  pollCount: number;
  refreshCount: number;
  bridgeState: string;
  visibleCookies: string;
  signedUrlDetected: boolean;
}

export const AUTH_READY_TIMEOUT_MS = 10_000;

let _lastGateSnapshot: StartupGateSnapshot = {
  settled: false,
  token: false,
  waitedMs: 0,
  reason: 'not-started',
  pollCount: 0,
  refreshCount: 0,
  bridgeState: 'not-attempted',
  visibleCookies: 'none',
  signedUrlDetected: false,
};

export function getStartupGateSnapshot(): StartupGateSnapshot {
  return _lastGateSnapshot;
}

function detectSignedUrlToken(): boolean {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('__lovable_token') ?? url.searchParams.get('lovable_token');
    return typeof token === 'string' && token.startsWith('eyJ') && token.split('.').length === 3;
  } catch {
    return false;
  }
}

function getBridgeState(): string {
  const diag = getAuthDebugSnapshot();
  if (diag.bridgeOutcome.success) {
    return 'hit:' + (diag.bridgeOutcome.source || 'bridge');
  }
  if (diag.bridgeOutcome.attempted) {
    return 'miss:' + (diag.bridgeOutcome.error || 'empty');
  }
  return 'not-attempted';
}

function getVisibleCookies(): string {
  const diag = getAuthDebugSnapshot();
  return diag.visibleCookieNames.length > 0
    ? diag.visibleCookieNames.join(',')
    : 'none';
}

function buildTimeoutReason(waitedMs: number): string {
  const diag = getAuthDebugSnapshot();
  return 'Timeout — no token after ' + Math.round(waitedMs / 1000) + 's'
    + ' | source=' + diag.tokenSource
    + ' | bridge=' + getBridgeState()
    + ' | visibleCookies=' + getVisibleCookies()
    + ' | signedUrl=' + (detectSignedUrlToken() ? 'yes' : 'no')
    + ' | contract=getBearerToken';
}

function captureGateSnapshot(result: TokenReadyResult): void {
  _lastGateSnapshot = {
    settled: true,
    token: !!result.token,
    waitedMs: result.waitedMs,
    reason: result.reason,
    pollCount: 0,
    refreshCount: 0,
    bridgeState: getBridgeState(),
    visibleCookies: getVisibleCookies(),
    signedUrlDetected: detectSignedUrlToken(),
  };
}

export async function ensureTokenReady(timeoutMs: number = AUTH_READY_TIMEOUT_MS): Promise<TokenReadyResult> {
  const startedAt = Date.now();
  const immediateToken = resolveToken();

  if (immediateToken) {
    const result = { token: immediateToken, waitedMs: 0, reason: 'immediate' };
    captureGateSnapshot(result);
    log('[TokenGate] Immediate token available — 0ms', 'success');
    return result;
  }

  log('[TokenGate] Started — timeout=' + timeoutMs + 'ms, contract=getBearerToken()', 'check');
  const token = await Promise.race<string>([
    getBearerToken(),
    new Promise<string>(function (resolve) {
      setTimeout(function () { resolve(''); }, timeoutMs);
    }),
  ]);
  const waitedMs = Date.now() - startedAt;
  const hasToken = !!token;
  const source = getLastTokenSource() || 'unknown';
  const result: TokenReadyResult = hasToken
    ? { token, waitedMs, reason: 'contract-resolved-from-' + source }
    : { token: '', waitedMs, reason: buildTimeoutReason(waitedMs) };

  captureGateSnapshot(result);

  log(
    '[TokenGate] Settled — waited=' + waitedMs + 'ms, reason=' + result.reason,
    hasToken ? 'success' : 'warn',
  );

  return result;
}

