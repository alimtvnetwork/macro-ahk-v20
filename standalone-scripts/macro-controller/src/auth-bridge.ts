/**
 * MacroLoop Controller — Extension Bridge Communication
 * Phase 5B: Extracted from auth.ts
 *
 * Contains: requestTokenFromExtension, relay health check,
 * bridge outcome tracking, extractTokenFromAuthBridgeResponse,
 * AuthDebugSnapshot.
 */

import { log } from './logging';
import { getLastSessionBridgeSource } from './shared-state';
import { logError } from './error-utils';
import {
  extractBearerTokenFromUnknown,
  getBearerTokenFromSessionBridge,
  getSessionCookieNames,
  getLastTokenSource,
} from './auth-resolve';

import { BRIDGE_TIMEOUT_MS } from './constants';
import { Label } from './types';

// ============================================
// Bridge Constants & Outcome Tracking
// ============================================



// CQ11: Encapsulate bridge outcome in singleton class
class BridgeOutcomeState {
  private _attempted = false;
  private _success = false;
  private _source = '';
  private _error = '';

  get(): { attempted: boolean; success: boolean; source: string; error: string } {
    return {
      attempted: this._attempted,
      success: this._success,
      source: this._source,
      error: this._error,
    };
  }

  record(success: boolean, source: string, error?: string): void {
    this._attempted = true;
    this._success = success;
    this._source = source;
    this._error = error || '';
  }
}

const bridgeOutcomeState = new BridgeOutcomeState();

export function getLastBridgeOutcome(): {
  attempted: boolean;
  success: boolean;
  source: string;
  error: string;
} {
  return bridgeOutcomeState.get();
}

function recordBridgeOutcome(
  success: boolean,
  source: string,
  error?: string,
): void {
  bridgeOutcomeState.record(success, source, error);
}

// ============================================
// Auth Debug Snapshot
// ============================================

export interface AuthDebugSnapshot {
  tokenSource: string;
  hasResolvedToken: boolean;
  sessionCookieNames: string[];
  bridgeOutcome: {
    attempted: boolean;
    success: boolean;
    source: string;
    error: string;
  };
  visibleCookieNames: string[];
  flow: string;
}

function getVisibleCookieNames(): string[] {
  try {
    const rawCookie = document.cookie || '';

    return rawCookie
      ? rawCookie.split(';').map(function (c: string) { return c.trim().split('=')[0]; }).filter(Boolean)
      : [];
  } catch (e) {
    logError('listCookieNames', 'Failed to parse cookie names', e);
    return [];
  }
}

export function getAuthDebugSnapshot(): AuthDebugSnapshot {
  const sessionCookieNames = getSessionCookieNames();
  const visibleCookieNames = getVisibleCookieNames();
  const localToken = getBearerTokenFromSessionBridge();

  const tokenSource = localToken
    ? 'localStorage[' + getLastSessionBridgeSource() + ']'
    : getLastTokenSource() || 'none';

  return {
    tokenSource,
    hasResolvedToken: !!localToken,
    sessionCookieNames,
    bridgeOutcome: bridgeOutcomeState.get(),
    visibleCookieNames,
    flow:
      'localStorage/session-bridge -> supabase-scan -> extension-bridge(GET_TOKEN, REFRESH_TOKEN) -> cookie[' +
      sessionCookieNames.join(' | ') +
      ']',
  };
}

// ============================================
// Token Extraction from Bridge Response
// ============================================

export function extractTokenFromAuthBridgeResponse(
  payload: Record<string, unknown>,
): string {
  if (!payload || typeof payload !== 'object') return '';

  return extractTokenFromUnknownContainer(payload, 0);
}

function extractTokenFromUnknownContainer(
  raw: unknown,
  depth: number,
): string {
  if (depth > 4 || !raw || typeof raw !== 'object') return '';

  const obj = raw as Record<string, unknown>;

  const tokenCandidates = [
    obj.token, obj.authToken, obj.access_token, obj.jwt, obj.sessionId,
  ];

  for (const candidate of tokenCandidates) {
    const token = extractBearerTokenFromUnknown(candidate);

    if (token) {
      return token;
    }
  }

  const wrapperCandidates = [obj.payload, obj.result, obj.data, obj.response];

  for (const wrapper of wrapperCandidates) {
    const nestedToken = extractTokenFromUnknownContainer(wrapper, depth + 1);

    if (nestedToken) {
      return nestedToken;
    }
  }

  return '';
}

// ============================================
// Extension Bridge Token Request
// ============================================

interface ExtensionBridgeAttemptResult {
  token: string;
  source: string;
  isTimeout: boolean;
  errorMessage?: string;
}

// CQ4: Extracted — handle a single attempt result (success or non-timeout failure)
function handleAttemptResult(
  attempt: ExtensionBridgeAttemptResult,
  messageType: string,
  onDone: (token: string, source: string) => void,
): boolean {
  if (attempt.token) {
    recordBridgeOutcome(true, attempt.source);
    onDone(attempt.token, attempt.source);

    return true;
  }

  if (!attempt.isTimeout) {
    const errorMsg = attempt.errorMessage || 'No token returned';

    if (attempt.errorMessage) {
      log(Label.ExtensionBridge + messageType + ' failed: ' + errorMsg, 'warn');
    }

    recordBridgeOutcome(false, 'none', errorMsg);
    onDone('', 'none');

    return true;
  }

  return false;
}

/**
 * Request token from extension bridge with retry on timeout.
 * v7.40: Increased timeout from 2.5s to 5s for MV3 cold-start.
 * v7.41: Distinguishes timeout vs. explicit relay errors.
 */
export function requestTokenFromExtension(
  forceRefresh: boolean,
  onDone: (token: string, source: string) => void,
): void {
  const messageType = forceRefresh ? 'REFRESH_TOKEN' : 'GET_TOKEN';

  _requestTokenFromExtensionAttempt(forceRefresh, function (firstAttempt: ExtensionBridgeAttemptResult) {
    if (handleAttemptResult(firstAttempt, messageType, onDone)) return;

    // Retry once on timeout (handles MV3 service worker cold-start)
    log(Label.ExtensionBridge + messageType + ' timed out — retrying once...', 'warn');

    _requestTokenFromExtensionAttempt(forceRefresh, function (secondAttempt: ExtensionBridgeAttemptResult) {
      if (handleAttemptResult(secondAttempt, messageType, onDone)) return;

      recordBridgeOutcome(false, 'none', secondAttempt.errorMessage || 'timeout (2 attempts)');
      onDone('', 'none');
    });
  });
}

// ============================================
// CQ16: Extracted context for bridge attempt
// ============================================

interface BridgeAttemptCtx {
  settled: boolean;
  timeoutRef: ReturnType<typeof setTimeout> | null;
  requestId: string;
  startedAt: number;
  messageType: string;
  onDone: (result: ExtensionBridgeAttemptResult) => void;
}

// Extended context with bound listener reference
interface BridgeAttemptCtxFull extends BridgeAttemptCtx {
  _onResponse?: (event: MessageEvent) => void;
}

function finishBridgeAttempt(ctx: BridgeAttemptCtxFull, result: ExtensionBridgeAttemptResult): void {
  if (ctx.settled) return;
  ctx.settled = true;
  window.removeEventListener('message', ctx._onResponse!);
  if (ctx.timeoutRef) clearTimeout(ctx.timeoutRef);
  ctx.onDone(result);
}

function handleBridgeResponse(ctx: BridgeAttemptCtxFull, event: MessageEvent): void {
  if (!event.data) return;
  if (event.data.source !== 'marco-extension') return;
  if (event.data.requestId !== ctx.requestId) return;

  const payload = unwrapRelayPayload(event.data.payload);
  const token = extractTokenFromAuthBridgeResponse(payload);
  const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : undefined;
  const source = token ? 'extension-bridge[' + ctx.messageType + ']' : 'none';

  if (token) {
    log(Label.ExtensionBridge + ctx.messageType + ' resolved in ' + (Date.now() - ctx.startedAt) + 'ms', 'sub');
  }

  finishBridgeAttempt(ctx, { token, source, isTimeout: false, errorMessage });
}

function _requestTokenFromExtensionAttempt(
  forceRefresh: boolean,
  onDone: (result: ExtensionBridgeAttemptResult) => void,
): void {
  const messageType = forceRefresh ? 'REFRESH_TOKEN' : 'GET_TOKEN';
  const requestId = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const ctx: BridgeAttemptCtxFull = {
    settled: false, timeoutRef: null, requestId, startedAt: Date.now(), messageType, onDone,
  };

  ctx._onResponse = function(event: MessageEvent) { handleBridgeResponse(ctx, event); };
  window.addEventListener('message', ctx._onResponse);

  window.postMessage({
    source: 'marco-controller', type: messageType, requestId, tabUrl: window.location.href, pageUrl: window.location.href,
  }, '*');

  ctx.timeoutRef = setTimeout(function () {
    finishBridgeAttempt(ctx, { token: '', source: 'none', isTimeout: true, errorMessage: 'timeout' });
  }, BRIDGE_TIMEOUT_MS);
}

function unwrapRelayPayload(rawPayload: unknown): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};

  const payload = rawPayload as Record<string, unknown>;
  const nested = payload.payload;

  if (!nested || typeof nested !== 'object') return payload;

  const nestedPayload = nested as Record<string, unknown>;
  const hasTokenLikeKey =
    typeof nestedPayload.token === 'string' ||
    typeof nestedPayload.authToken === 'string' ||
    typeof nestedPayload.access_token === 'string' ||
    typeof nestedPayload.sessionId === 'string' ||
    typeof nestedPayload.errorMessage === 'string';

  return hasTokenLikeKey ? nestedPayload : payload;
}

// ============================================
// Relay health check (Fix 3)
// ============================================

interface RelayPingCtx {
  settled: boolean;
  timer: ReturnType<typeof setTimeout>;
  pingId: string;
  resolve: (value: boolean) => void;
  _onPong?: (event: MessageEvent) => void;
}

const RELAY_ERROR_PATTERNS = [
  'failed to send message to extension',
  'extension context invalidated',
  'receiving end does not exist',
  'could not establish connection',
] as const;

function isTransportFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();

  return RELAY_ERROR_PATTERNS.some(function (p) { return normalized.includes(p); });
}

function handleRelayPong(ctx: RelayPingCtx, event: MessageEvent): void {
  if (!event.data || event.data.source !== 'marco-extension') return;
  if (event.data.requestId !== ctx.pingId) return;

  const payload = unwrapRelayPayload((event.data as { payload?: unknown }).payload);
  const errorMsg = typeof payload.errorMessage === 'string' ? payload.errorMessage : '';

  if (!ctx.settled) {
    ctx.settled = true;
    clearTimeout(ctx.timer);
    window.removeEventListener('message', ctx._onPong!);
    ctx.resolve(!isTransportFailure(errorMsg));
  }
}

export function isRelayActive(): Promise<boolean> {
  return new Promise(function (resolve) {
    const pingId = 'relay-ping-' + Date.now();

    const ctx: RelayPingCtx = {
      settled: false,
      timer: setTimeout(function () {
        if (!ctx.settled) {
          ctx.settled = true;
          window.removeEventListener('message', ctx._onPong!);
          resolve(false);
        }
      }, 500),
      pingId,
      resolve,
    };

    ctx._onPong = function(event: MessageEvent) { handleRelayPong(ctx, event); };
    window.addEventListener('message', ctx._onPong);

    window.postMessage({ source: 'marco-controller', type: 'GET_TOKEN', requestId: pingId }, '*');
  });
}

/**
 * Wake the service worker by sending a lightweight ping via the content script relay.
 * If the relay responds (even with an error), the bridge outcome is refreshed.
 * Returns true if the bridge is alive after the wake attempt.
 */
export function wakeBridge(): Promise<boolean> {
  return new Promise(function (resolve) {
    const pingId = 'wake-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    let settled = false;

    function finish(alive: boolean): void {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onResponse);
      if (timer) clearTimeout(timer);
      resolve(alive);
    }

    function onResponse(event: MessageEvent): void {
      if (!event.data || event.data.source !== 'marco-extension') return;
      if (event.data.requestId !== pingId) return;

      const payload = unwrapRelayPayload((event.data as { payload?: unknown }).payload);
      const errorMsg = typeof payload.errorMessage === 'string' ? payload.errorMessage : '';

      if (errorMsg && isTransportFailure(errorMsg)) {
        // Bridge still broken after wake attempt
        finish(false);
      } else {
        // Got a response — service worker is awake, refresh outcome
        recordBridgeOutcome(true, 'extension-bridge[WAKE]');
        finish(true);
      }
    }

    window.addEventListener('message', onResponse);
    window.postMessage({ source: 'marco-controller', type: 'GET_TOKEN', requestId: pingId }, '*');

    const timer = setTimeout(function () { finish(false); }, 3000);
  });
}
