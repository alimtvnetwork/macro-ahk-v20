/**
 * MacroLoop Controller — Startup Token Readiness Gate
 *
 * Uses the unified getBearerToken() contract so startup, bridge, and
 * background all share the same readiness budget and diagnostics.
 *
 * Includes a fast client-side pre-seed that runs synchronously before
 * the async waterfall to populate localStorage from signed URL tokens
 * and Supabase localStorage JWTs — enabling sub-2s cold-load resolution.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { getAuthDebugSnapshot, getBearerToken, getLastTokenSource, resolveToken } from './auth';
import { saveTokenWithTimestamp } from './auth-resolve';
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
  preSeedSource: string;
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
  preSeedSource: 'none',
};

export function getStartupGateSnapshot(): StartupGateSnapshot {
  return _lastGateSnapshot;
}

// ── Fast client-side pre-seed ──
// Runs synchronously before the async waterfall to populate localStorage
// from sources that are already available in the page context.

function extractSignedUrlJwt(): string | null {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('__lovable_token') ?? url.searchParams.get('lovable_token');
    if (typeof token === 'string' && token.startsWith('eyJ') && token.split('.').length === 3) {
      return token;
    }
  } catch { /* ignore */ }
  return null;
}

function scanSupabaseLocalStorageForJwt(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.includes('-auth-token')) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw || raw.length < 20) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        const accessToken = parsed?.access_token;
        if (typeof accessToken === 'string' && accessToken.startsWith('eyJ') && accessToken.split('.').length === 3) {
          return accessToken;
        }
        const session = parsed?.currentSession ?? parsed?.session;
        if (session?.access_token && typeof session.access_token === 'string' && session.access_token.startsWith('eyJ')) {
          return session.access_token;
        }
      } catch {
        if (raw.startsWith('eyJ') && raw.split('.').length === 3) {
          return raw;
        }
      }
    }
  } catch { /* localStorage unavailable */ }
  return null;
}

/**
 * Fast client-side pre-seed: extracts JWT from signed URL or Supabase localStorage
 * and writes it into marco_bearer_token so resolveToken() can find it immediately.
 * Returns the source label if a token was seeded, or 'none'.
 */
function fastPreSeed(): string {
  // Skip if marco_bearer_token already has a valid JWT
  try {
    const existing = localStorage.getItem('marco_bearer_token') || '';
    if (existing.startsWith('eyJ') && existing.split('.').length === 3) {
      return 'already-seeded';
    }
  } catch { /* ignore */ }

  // Try signed URL first (highest priority for cold preview loads)
  const signedUrlJwt = extractSignedUrlJwt();
  if (signedUrlJwt) {
    try {
      saveTokenWithTimestamp(signedUrlJwt);
      log('[TokenGate] Pre-seed: seeded JWT from signed URL param', 'success');
      return 'signed-url';
    } catch { /* ignore */ }
  }

  // Try Supabase localStorage scan
  const supabaseJwt = scanSupabaseLocalStorageForJwt();
  if (supabaseJwt) {
    try {
      saveTokenWithTimestamp(supabaseJwt);
      log('[TokenGate] Pre-seed: seeded JWT from Supabase localStorage', 'success');
      return 'supabase-localStorage';
    } catch { /* ignore */ }
  }

  return 'none';
}

// ── Diagnostics helpers ──

function detectSignedUrlToken(): boolean {
  return extractSignedUrlJwt() !== null;
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

function buildTimeoutReason(waitedMs: number, preSeedSource: string): string {
  const diag = getAuthDebugSnapshot();
  return 'Timeout — no token after ' + Math.round(waitedMs / 1000) + 's'
    + ' | source=' + diag.tokenSource
    + ' | bridge=' + getBridgeState()
    + ' | visibleCookies=' + getVisibleCookies()
    + ' | signedUrl=' + (detectSignedUrlToken() ? 'yes' : 'no')
    + ' | preSeed=' + preSeedSource
    + ' | contract=getBearerToken';
}

function captureGateSnapshot(result: TokenReadyResult, preSeedSource: string): void {
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
    preSeedSource,
  };
}

// ── Main gate ──

export async function ensureTokenReady(timeoutMs: number = AUTH_READY_TIMEOUT_MS): Promise<TokenReadyResult> {
  const startedAt = Date.now();

  // Phase 0: Fast client-side pre-seed (synchronous, <1ms)
  const preSeedSource = fastPreSeed();
  if (preSeedSource !== 'none') {
    log('[TokenGate] Pre-seed completed: source=' + preSeedSource, 'info');
  }

  // Phase 1: Check if resolveToken() can find a token now (after pre-seed)
  const immediateToken = resolveToken();

  if (immediateToken) {
    const result: TokenReadyResult = {
      token: immediateToken,
      waitedMs: 0,
      reason: preSeedSource !== 'none' && preSeedSource !== 'already-seeded'
        ? 'pre-seeded-from-' + preSeedSource
        : 'immediate',
    };
    captureGateSnapshot(result, preSeedSource);
    log('[TokenGate] Immediate token available — 0ms (preSeed=' + preSeedSource + ')', 'success');
    return result;
  }

  // Phase 2: Fall back to async getBearerToken() with unified timeout
  log('[TokenGate] Started — timeout=' + timeoutMs + 'ms, contract=getBearerToken(), preSeed=' + preSeedSource, 'check');
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
    : { token: '', waitedMs, reason: buildTimeoutReason(waitedMs, preSeedSource) };

  captureGateSnapshot(result, preSeedSource);

  log(
    '[TokenGate] Settled — waited=' + waitedMs + 'ms, reason=' + result.reason,
    hasToken ? 'success' : 'warn',
  );

  return result;
}
