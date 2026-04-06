/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Auth & Token Resolution Module
 * Step 2g: Extracted from macro-looping.ts
 *
 * Contains: session bridge token, extension bridge, cookie reading,
 * token persistence, auth badge UI, resolveToken(), recoverAuthOnce().
 *
 * v7.39: Added recoverAuthOnce() with concurrency lock (RCA-4 fix).
 *        Made markBearerTokenExpired() actually clear cached token (RCA-5 fix).
 * See: spec/02-app-issues/authentication-freeze-and-retry-loop.md
 */

import {
  SESSION_BRIDGE_KEYS, LAST_SESSION_BRIDGE_SOURCE, setLastSessionBridgeSource,
} from './shared-state';
import { log } from './logging';

// Late-bound import to avoid circular deps; set by panel-builder
let _recordRefreshOutcome: ((success: boolean, source: string, error?: string) => void) | null = null;
export function setRecordRefreshOutcome(fn: (success: boolean, source: string, error?: string) => void): void {
  _recordRefreshOutcome = fn;
}

function normalizeBearerToken(raw: string): string {
  return (raw || '').trim().replace(/^Bearer\s+/i, '');
}

function isJwtToken(raw: string): boolean {
  const token = normalizeBearerToken(raw);
  return token.startsWith('eyJ') && token.split('.').length === 3;
}

function isUsableToken(raw: string): boolean {
  const token = normalizeBearerToken(raw);
  if (!token || token.length < 10) return false;
  if (/\s/.test(token)) return false;
  if (token[0] === '{' || token[0] === '[') return false;
  return isJwtToken(token);
}

function extractBearerTokenFromUnknown(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  const normalized = normalizeBearerToken(raw);
  if (isUsableToken(normalized)) return normalized;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const candidates = [parsed.token, parsed.access_token, parsed.authToken, parsed.sessionId];
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (typeof candidate !== 'string') continue;
        const nested = normalizeBearerToken(candidate);
        if (isUsableToken(nested)) return nested;
      }
    }
  } catch (_e) {
    // ignore parse errors
  }

  return '';
}

// v7.22: Track last token source for auth diagnostic UI
export let LAST_TOKEN_SOURCE = 'none';
export function setLastTokenSource(src: string) { LAST_TOKEN_SOURCE = src; }

// ============================================
// Auth Recovery Concurrency Lock (RCA-4 fix)
// See: spec/02-app-issues/authentication-freeze-and-retry-loop.md (RCA-4)
// ============================================
let _authRecoveryInFlight = false;
let _authRecoveryWaiters: Array<(token: string) => void> = [];

/**
 * Attempt auth recovery exactly once. If recovery is already in progress,
 * waits for the existing attempt to finish and returns whatever it resolved.
 * Prevents parallel recovery storms (RCA-4).
 */
export function recoverAuthOnce(): Promise<string> {
  if (_authRecoveryInFlight) {
    log('[AuthRecovery] Recovery already in flight — waiting for result...', 'info');
    return new Promise<string>(function(resolve) {
      _authRecoveryWaiters.push(resolve);
      // Safety timeout: 10s max wait
      const safetyTimer = setTimeout(function() {
        const idx = _authRecoveryWaiters.indexOf(resolve);
        if (idx !== -1) _authRecoveryWaiters.splice(idx, 1);
        resolve(resolveToken());
      }, 10000);
      // Store timer ref on the resolve fn for cleanup
      (resolve as unknown as Record<string, ReturnType<typeof setTimeout>>)._timer = safetyTimer;
    });
  }

  _authRecoveryInFlight = true;
  log('[AuthRecovery] Starting token recovery...', 'check');

  return new Promise<string>(function(resolve) {
    function finishRecovery(token: string) {
      _authRecoveryInFlight = false;
      // Notify all waiters
      const waiters = _authRecoveryWaiters.splice(0);
      for (let i = 0; i < waiters.length; i++) {
        const waiterResolve = waiters[i];
        // Clear safety timer
        const timer = (waiterResolve as unknown as Record<string, ReturnType<typeof setTimeout>>)._timer;
        if (timer) clearTimeout(timer);
        waiterResolve(token);
      }
      resolve(token);
    }

    // Step 1: Force extension bridge refresh path (skip local cache to avoid stale-token reuse)
    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      if (token) {
        setLastTokenSource(source);
        updateAuthBadge(true, source);
        log('[AuthRecovery] Recovered token from ' + source, 'success');
        if (_recordRefreshOutcome) _recordRefreshOutcome(true, source);
        finishRecovery(token);
        return;
      }

      log('[AuthRecovery] No token from any source — recovery failed', 'error');
      updateAuthBadge(false, 'recovery-failed');
      if (_recordRefreshOutcome) _recordRefreshOutcome(false, 'none', 'No token from any source');
      finishRecovery('');
    }, { skipSessionBridgeCache: true });
  });
}

// ============================================
// Session Bridge Token
// ============================================
export function getBearerTokenFromSessionBridge(): string {
  try {
    // Priority 1: Check extension-seeded keys
    for (let i = 0; i < SESSION_BRIDGE_KEYS.length; i++) {
      const key = SESSION_BRIDGE_KEYS[i];
      const raw = localStorage.getItem(key) || '';
      const token = extractBearerTokenFromUnknown(raw);
      if (token) {
        if (LAST_SESSION_BRIDGE_SOURCE !== key) {
          setLastSessionBridgeSource(key);
          log('resolveToken: using bearer token from localStorage[' + key + ']', 'success');
        }
        return token;
      }

      if (raw && raw.length >= 10) {
        log('resolveToken: ignoring non-usable value in localStorage[' + key + ']', 'warn');
      }
    }

    // Priority 2: Scan for Supabase auth keys (sb-<ref>-auth-token*)
    // The platform uses Supabase under the hood — the session is stored natively
    // in localStorage as a JSON object with access_token/refresh_token.
    const supabaseToken = scanSupabaseLocalStorage();
    if (supabaseToken) {
      return supabaseToken;
    }
  } catch (e: unknown) {
    log('resolveToken: localStorage bridge unavailable — ' + ((e as Error)?.message || e), 'warn');
  }
  return '';
}

/**
 * Scans localStorage for Supabase auth keys matching `sb-*-auth-token*`.
 * The platform's Supabase client stores the session natively under this pattern.
 * The value is a JSON object: { access_token, refresh_token, ... }
 */
function scanSupabaseLocalStorage(): string {
  try {
    const len = localStorage.length;
    for (let i = 0; i < len; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Match Supabase auth token keys: sb-<ref>-auth-token or sb-<ref>-auth-token.0, etc.
      const isSupabaseAuthKey = key.startsWith('sb-') && key.includes('-auth-token');
      if (!isSupabaseAuthKey) continue;

      const raw = localStorage.getItem(key) || '';
      if (!raw || raw.length < 20) continue;

      // Supabase stores JSON: { access_token: "eyJ...", refresh_token: "...", ... }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const accessToken = parsed.access_token;

        if (typeof accessToken === 'string' && isUsableToken(accessToken)) {
          setLastSessionBridgeSource(key);
          log('resolveToken: ✅ Found Supabase auth in localStorage[' + key + '] (access_token len=' + accessToken.length + ')', 'success');
          return accessToken;
        }

        // Some Supabase versions nest under currentSession or session
        const session = (parsed.currentSession || parsed.session) as Record<string, unknown> | undefined;
        if (session && typeof session.access_token === 'string' && isUsableToken(session.access_token as string)) {
          setLastSessionBridgeSource(key);
          log('resolveToken: ✅ Found Supabase auth in localStorage[' + key + '].session.access_token', 'success');
          return session.access_token as string;
        }
      } catch (_jsonErr) {
        // Not JSON — might be a chunked token segment, try as raw bearer
        const token = normalizeBearerToken(raw);
        if (isUsableToken(token)) {
          setLastSessionBridgeSource(key);
          log('resolveToken: ✅ Found raw token in localStorage[' + key + '] (len=' + token.length + ')', 'success');
          return token;
        }
      }
    }
  } catch (scanErr) {
    log('resolveToken: Supabase localStorage scan failed — ' + ((scanErr as Error)?.message || scanErr), 'warn');
  }
  return '';
}

export function extractTokenFromAuthBridgeResponse(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== 'object') return '';

  return extractTokenFromUnknownContainer(payload, 0);
}

function extractTokenFromUnknownContainer(raw: unknown, depth: number): string {
  if (depth > 4 || !raw || typeof raw !== 'object') return '';

  const obj = raw as Record<string, unknown>;

  const tokenCandidates = [
    obj.token,
    obj.authToken,
    obj.access_token,
    obj.jwt,
    obj.sessionId,
  ];

  for (let i = 0; i < tokenCandidates.length; i++) {
    const token = extractBearerTokenFromUnknown(tokenCandidates[i]);
    if (token) return token;
  }

  // Common wrapper envelopes observed in relay/background responses.
  const wrapperCandidates = [obj.payload, obj.result, obj.data, obj.response];
  for (let i = 0; i < wrapperCandidates.length; i++) {
    const nestedToken = extractTokenFromUnknownContainer(wrapperCandidates[i], depth + 1);
    if (nestedToken) return nestedToken;
  }

  return '';
}

// ============================================
// Extension Bridge Token
// ============================================
/**
 * Request token from extension bridge with retry on timeout.
 * v7.40: Increased timeout from 2.5s to 5s for MV3 cold-start.
 *        Added single retry on first timeout before giving up.
 * v7.41: Distinguishes timeout vs. explicit relay errors and unwraps nested relay payloads.
 */
const BRIDGE_TIMEOUT_MS = 5000;
const COOKIE_DIAGNOSTIC_COOLDOWN_MS = 60_000;

/** Hardcoded fallback (always appended for compatibility with stale bindings). */
const FALLBACK_SESSION_COOKIE_NAMES = [
  'lovable-session-id-v2',
  'lovable-session-id.id',
  '__Secure-lovable-session-id.id',
  '__Host-lovable-session-id.id',
  'lovable-session-id',
];

/**
 * Reads session cookie names from project namespace cookie bindings.
 * Always appends fallback names so diagnostics and resolution stay resilient.
 */
export function getSessionCookieNames(): string[] {
  try {
    const root = (window as any).RiseupAsiaMacroExt;
    const names: string[] = [];

    if (root && root.Projects) {
      const projects = root.Projects;
      const keys = Object.keys(projects);
      for (let i = 0; i < keys.length; i++) {
        const ns = projects[keys[i]];
        if (ns && ns.cookies && ns.cookies.bindings) {
          const bindings = ns.cookies.bindings;
          for (let j = 0; j < bindings.length; j++) {
            if (bindings[j].role === 'session' && bindings[j].cookieName) {
              names.push(bindings[j].cookieName);
            }
          }
        }
      }
    }

    return Array.from(new Set(names.concat(FALLBACK_SESSION_COOKIE_NAMES)));
  } catch (_e) {
    return FALLBACK_SESSION_COOKIE_NAMES;
  }
}

let _lastCookieDiagnosticAt = 0;

// Bridge outcome tracking for diagnostics UI
let _lastBridgeOutcome = { attempted: false, success: false, source: '', error: '' };
export function getLastBridgeOutcome(): { attempted: boolean; success: boolean; source: string; error: string } {
  return _lastBridgeOutcome;
}
function recordBridgeOutcome(success: boolean, source: string, error?: string): void {
  _lastBridgeOutcome = { attempted: true, success, source, error: error || '' };
}

export interface AuthDebugSnapshot {
  tokenSource: string;
  hasResolvedToken: boolean;
  sessionCookieNames: string[];
  bridgeOutcome: { attempted: boolean; success: boolean; source: string; error: string };
  visibleCookieNames: string[];
  flow: string;
}

export function getAuthDebugSnapshot(): AuthDebugSnapshot {
  const sessionCookieNames = getSessionCookieNames();
  let visibleCookieNames: string[] = [];
  try {
    const rawCookie = document.cookie || '';
    visibleCookieNames = rawCookie
      ? rawCookie.split(';').map(function(c: string) { return c.trim().split('=')[0]; }).filter(Boolean)
      : [];
  } catch (_e) {
    visibleCookieNames = [];
  }

  const localToken = getBearerTokenFromSessionBridge();
  const tokenSource = localToken
    ? 'localStorage[' + LAST_SESSION_BRIDGE_SOURCE + ']'
    : (LAST_TOKEN_SOURCE || 'none');

  return {
    tokenSource,
    hasResolvedToken: !!localToken,
    sessionCookieNames,
    bridgeOutcome: {
      attempted: _lastBridgeOutcome.attempted,
      success: _lastBridgeOutcome.success,
      source: _lastBridgeOutcome.source,
      error: _lastBridgeOutcome.error,
    },
    visibleCookieNames,
    flow: 'localStorage/session-bridge -> supabase-scan -> extension-bridge(GET_TOKEN, REFRESH_TOKEN) -> cookie[' + sessionCookieNames.join(' | ') + ']',
  };
}

interface ExtensionBridgeAttemptResult {
  token: string;
  source: string;
  isTimeout: boolean;
  errorMessage?: string;
}

export function requestTokenFromExtension(forceRefresh: boolean, onDone: (token: string, source: string) => void): void {
  const messageType = forceRefresh ? 'REFRESH_TOKEN' : 'GET_TOKEN';

  _requestTokenFromExtensionAttempt(forceRefresh, function(firstAttempt: ExtensionBridgeAttemptResult) {
    if (firstAttempt.token) {
      recordBridgeOutcome(true, firstAttempt.source);
      onDone(firstAttempt.token, firstAttempt.source);
      return;
    }

    if (!firstAttempt.isTimeout) {
      if (firstAttempt.errorMessage) {
        log('Extension bridge ' + messageType + ' failed: ' + firstAttempt.errorMessage, 'warn');
        recordBridgeOutcome(false, 'none', firstAttempt.errorMessage);
      } else {
        recordBridgeOutcome(false, 'none', 'No token returned');
      }
      onDone('', 'none');
      return;
    }

    // Retry once on timeout (handles MV3 service worker cold-start)
    log('Extension bridge ' + messageType + ' timed out — retrying once...', 'warn');

    _requestTokenFromExtensionAttempt(forceRefresh, function(secondAttempt: ExtensionBridgeAttemptResult) {
      if (secondAttempt.token) {
        recordBridgeOutcome(true, secondAttempt.source);
        onDone(secondAttempt.token, secondAttempt.source);
        return;
      }

      if (secondAttempt.errorMessage) {
        log('Extension bridge ' + messageType + ' retry failed: ' + secondAttempt.errorMessage, 'warn');
      }

      recordBridgeOutcome(false, 'none', secondAttempt.errorMessage || 'timeout (2 attempts)');
      onDone('', 'none');
    });
  });
}

function _requestTokenFromExtensionAttempt(
  forceRefresh: boolean,
  onDone: (result: ExtensionBridgeAttemptResult) => void,
): void {
  const messageType = forceRefresh ? 'REFRESH_TOKEN' : 'GET_TOKEN';
  const requestId = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  let settled = false;
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;

  function finish(result: ExtensionBridgeAttemptResult) {
    if (settled) return;
    settled = true;
    window.removeEventListener('message', onResponse);
    if (timeoutRef) clearTimeout(timeoutRef);
    onDone(result);
  }

  function onResponse(event: MessageEvent) {
    if (!event.data) return;
    if (event.data.source !== 'marco-extension') return;
    if (event.data.requestId !== requestId) return;

    const payload = unwrapRelayPayload(event.data.payload);
    const token = extractTokenFromAuthBridgeResponse(payload);
    const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : undefined;
    const source = token ? 'extension-bridge[' + messageType + ']' : 'none';

    if (token) {
      log('Extension bridge ' + messageType + ' resolved in ' + (Date.now() - startedAt) + 'ms', 'sub');
    }

    finish({ token, source, isTimeout: false, errorMessage });
  }

  window.addEventListener('message', onResponse);
  // Keep bridge payload shape mirrored in shipped standalone bundle.
  // RCA: spec/02-app-issues/81-auth-no-token-stale-macro-bundle.md
  window.postMessage({
    source: 'marco-controller',
    type: messageType,
    requestId: requestId,
    tabUrl: window.location.href,
    pageUrl: window.location.href,
  }, '*');

  timeoutRef = setTimeout(function() {
    finish({ token: '', source: 'none', isTimeout: true, errorMessage: 'timeout' });
  }, BRIDGE_TIMEOUT_MS);
}

function unwrapRelayPayload(rawPayload: unknown): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return {};
  }

  const payload = rawPayload as Record<string, unknown>;
  const nested = payload.payload;

  if (!nested || typeof nested !== 'object') {
    return payload;
  }

  const nestedPayload = nested as Record<string, unknown>;
  const hasTokenLikeKey = (
    typeof nestedPayload.token === 'string'
    || typeof nestedPayload.authToken === 'string'
    || typeof nestedPayload.access_token === 'string'
    || typeof nestedPayload.sessionId === 'string'
    || typeof nestedPayload.errorMessage === 'string'
  );

  return hasTokenLikeKey ? nestedPayload : payload;
}

// ============================================
// Token Persistence & Auth Badge
// ============================================
export function persistResolvedBearerToken(token: string): boolean {
  const normalized = normalizeBearerToken(token);
  if (!isUsableToken(normalized)) {
    log('resolveToken: rejected non-JWT token candidate', 'warn');
    return false;
  }

  try {
    localStorage.setItem('marco_bearer_token', normalized);
    localStorage.setItem('lovable-session-id', normalized);
    updateAuthBadge(true, LAST_TOKEN_SOURCE || 'persisted');
    return true;
  } catch (e: unknown) {
    log('resolveToken: failed to persist token to localStorage — ' + ((e as Error)?.message || e), 'warn');
    return false;
  }
}

export function updateAuthBadge(hasToken: boolean, source: string): void {
  const badge = document.getElementById('loop-auth-badge');
  if (!badge) return;
  if (hasToken) {
    badge.textContent = '🟢';
    badge.title = 'Auth: token available (' + (source || 'unknown') + ') — click to refresh';
  } else {
    badge.textContent = '🔴';
    badge.title = 'Auth: no token — click to refresh';
  }
}

export interface RefreshTokenOptions {
  skipSessionBridgeCache?: boolean;
}

// ============================================
// Relay health check (Fix 3)
// ============================================
function isRelayActive(): Promise<boolean> {
  return new Promise(function(resolve) {
    const pingId = 'relay-ping-' + Date.now();
    let settled = false;

    const timer = setTimeout(function() {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onPong);
        resolve(false);
      }
    }, 500);

    function onPong(event: MessageEvent) {
      if (!event.data) return;
      if (event.data.source !== 'marco-extension') return;
      if (event.data.requestId !== pingId) return;

      const payload = unwrapRelayPayload((event.data as { payload?: unknown }).payload);
      const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : '';
      const normalizedError = errorMessage.toLowerCase();
      const isTransportFailure = (
        normalizedError.includes('failed to send message to extension')
        || normalizedError.includes('extension context invalidated')
        || normalizedError.includes('receiving end does not exist')
        || normalizedError.includes('could not establish connection')
      );

      if (!settled) {
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onPong);
        resolve(!isTransportFailure);
      }
    }

    window.addEventListener('message', onPong);
    window.postMessage({ source: 'marco-controller', type: 'GET_TOKEN', requestId: pingId }, '*');
  });
}

// ============================================
// Refresh from best source (waterfall)
// See root-cause: spec/02-app-issues/80-auth-token-bridge-null-on-preview.md
// ============================================
export function refreshBearerTokenFromBestSource(
  onDone: (token: string, source: string) => void,
  options?: RefreshTokenOptions,
): void {
  const skipSessionBridgeCache = !!(options && options.skipSessionBridgeCache);
  const cookieSourceLabel = (function() {
    const sessionNames = getSessionCookieNames();
    return 'cookie[' + (sessionNames[0] || 'session') + ']';
  })();

  // Tier 1+2: Synchronous localStorage check (seeded keys + Supabase scan)
  if (!skipSessionBridgeCache) {
    const seededToken = getBearerTokenFromSessionBridge();
    if (seededToken && persistResolvedBearerToken(seededToken)) {
      log('refreshToken: ✅ Tier 1/2 — resolved from localStorage[' + LAST_SESSION_BRIDGE_SOURCE + ']', 'success');
      onDone(seededToken, 'localStorage[' + LAST_SESSION_BRIDGE_SOURCE + ']');
      return;
    }
  }

  // Tier 3: Extension bridge — probe relay, but always attempt bridge
  // even if ping is slow/unresponsive (cold-start can exceed 500ms).
  log('refreshToken: Tier 1/2 miss — checking relay health before bridge attempt...', 'check');
  isRelayActive().then(function(relayAlive) {
    if (!relayAlive) {
      log('refreshToken: ⚠️ Relay ping timed out (500ms) — attempting bridge anyway before cookie fallback', 'warn');
    } else {
      log('refreshToken: Relay active — attempting extension bridge GET_TOKEN...', 'check');
    }

    requestTokenFromExtension(false, function(cachedToken: string, cachedSource: string) {
      if (cachedToken && persistResolvedBearerToken(cachedToken)) {
        log('refreshToken: ✅ Tier 3a — resolved from ' + cachedSource, 'success');
        onDone(cachedToken, cachedSource);
        return;
      }

      requestTokenFromExtension(true, function(refreshedToken: string, refreshedSource: string) {
        if (refreshedToken && persistResolvedBearerToken(refreshedToken)) {
          log('refreshToken: ✅ Tier 3b — resolved from ' + refreshedSource, 'success');
          onDone(refreshedToken, refreshedSource);
          return;
        }

        // Tier 4: Cookie fallback (last resort)
        const cookieToken = getBearerTokenFromCookie();
        if (cookieToken && persistResolvedBearerToken(cookieToken)) {
          log('refreshToken: ✅ Tier 4 — resolved from cookie', 'success');
          onDone(cookieToken, cookieSourceLabel);
          return;
        }

        log('refreshToken: ❌ All tiers exhausted — no token found', 'error');
        onDone('', 'none');
      });
    });
  });
}

// ============================================
// Cookie Token (last resort)
// ============================================
export function getBearerTokenFromCookie(): string {
  const fn = 'getBearerTokenFromCookie';

  try {
    const rawCookie = document.cookie || '';
    const cookies = rawCookie ? rawCookie.split(';') : [];

    const sessionNames = getSessionCookieNames();
    let hasTargetCookie = false;
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i].trim();
      for (let n = 0; n < sessionNames.length; n++) {
        const prefix = sessionNames[n] + '=';
        if (c.indexOf(prefix) === 0) {
          hasTargetCookie = true;
          const val = c.substring(prefix.length);
          const normalized = normalizeBearerToken(val);

          if (isUsableToken(normalized)) {
            log(fn + ': Found usable token in document.cookie[' + sessionNames[n] + '] (len=' + normalized.length + ')', 'success');
            return normalized;
          }
        }
      }
    }

    const now = Date.now();
    const shouldLogDiagnostics = (now - _lastCookieDiagnosticAt) >= COOKIE_DIAGNOSTIC_COOLDOWN_MS;

    if (!shouldLogDiagnostics) {
      return '';
    }

    _lastCookieDiagnosticAt = now;

    const cookieNames = cookies.map(function(c: string) { return c.trim().split('=')[0]; });
    const cookieCount = cookies.length;

    log(fn + ': === COOKIE DIAGNOSTIC START ===', 'info');
    log(fn + ': Session cookie names (from namespace): [' + sessionNames.join(', ') + ']', 'info');
    log(fn + ': document.cookie accessible: ' + (typeof document.cookie === 'string' ? 'YES' : 'NO'), 'info');
    log(fn + ': Total cookies visible to JS: ' + cookieCount, 'info');
    log(fn + ': Cookie names visible: [' + cookieNames.join(', ') + ']', 'info');
    log(fn + ': Raw cookie string length: ' + rawCookie.length + ' chars', 'info');

    if (!hasTargetCookie) {
      log(fn + ': Session cookie NOT found in document.cookie (expected: HttpOnly)', 'info');
      log(fn + ': Auth should resolve via Supabase localStorage scan or extension bridge', 'info');
    }

    log(fn + ': === COOKIE DIAGNOSTIC END ===', 'info');
  } catch (e: unknown) {
    log(fn + ': EXCEPTION reading cookies: ' + ((e as Error)?.message || e), 'error');
    log(fn + ': This may happen in sandboxed iframes or restricted contexts', 'error');
  }
  return '';
}

// ============================================
// Synchronous token resolver (primary entry point)
// ============================================
export function resolveToken(): string {
  const sessionToken = getBearerTokenFromSessionBridge();
  if (sessionToken) {
    LAST_TOKEN_SOURCE = 'localStorage[' + LAST_SESSION_BRIDGE_SOURCE + ']';
    return sessionToken;
  }

  LAST_TOKEN_SOURCE = 'none';
  return '';
}

// v7.39: markBearerTokenExpired now actually clears cached token (RCA-5 fix)
// See: spec/02-app-issues/authentication-freeze-and-retry-loop.md (RCA-5)
export function markBearerTokenExpired(controller: string): void {
  log('[' + controller + '] Bearer token expired (401/403) — clearing cached token', 'warn');
  try {
    for (let i = 0; i < SESSION_BRIDGE_KEYS.length; i++) {
      localStorage.removeItem(SESSION_BRIDGE_KEYS[i]);
    }
  } catch (_e) { /* ignore */ }
  updateAuthBadge(false, 'expired');
}

// v7.25: Invalidate a specific session bridge key so resolveToken() skips it on next call
export function invalidateSessionBridgeKey(token: string): string {
  const normalizedTarget = normalizeBearerToken(token);
  const removedKeys: string[] = [];

  for (let i = 0; i < SESSION_BRIDGE_KEYS.length; i++) {
    const key = SESSION_BRIDGE_KEYS[i];
    try {
      const stored = localStorage.getItem(key) || '';
      const normalizedStored = extractBearerTokenFromUnknown(stored);
      if (normalizedStored && normalizedStored === normalizedTarget) {
        localStorage.removeItem(key);
        removedKeys.push(key);
      }
    } catch (_e) { /* ignore */ }
  }

  if (removedKeys.length > 0) {
    log('Token fallback: invalidated localStorage[' + removedKeys.join(', ') + ']', 'warn');
  }

  return removedKeys.join(',');
}
