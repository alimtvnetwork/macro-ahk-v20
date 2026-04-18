/**
 * MacroLoop Controller — Auth Token Resolution & Persistence
 * Phase 5B: Extracted from auth.ts
 * Phase 6: for-of conversions, newline-before-return, curly braces (CQ13–CQ15)
 * Phase 7: Moved pure utilities to marco-sdk AuthTokenUtils (window.marco.authUtils).
 *          Fixed all swallowed errors, inverted nested ifs to guard clauses.
 *
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md
 * @see standalone-scripts/marco-sdk/src/auth-token-utils.ts — AuthTokenUtils class
 */

import { toErrorMessage, logError } from './error-utils';
import { log } from './logging';
import {
  getLastSessionBridgeSource,
  SESSION_BRIDGE_KEYS,
  setLastSessionBridgeSource,
} from './shared-state';

// ============================================
// SDK AuthTokenUtils accessor
// ============================================

/**
 * Get the AuthTokenUtils from the SDK.
 * Falls back to a minimal inline implementation if SDK is not loaded yet.
 */
function getAuthUtils(): MarcoSDKAuthTokenUtils {
  const sdkUtils = window.marco?.authUtils;
  if (sdkUtils) {
    return sdkUtils;
  }

  // Minimal fallback for early boot before SDK is available
  log('auth-resolve: marco.authUtils not available, using inline fallback', 'warn');

  return {
    normalizeBearerToken(raw: string): string {
      return (raw || '').trim().replace(/^Bearer\s+/i, '');
    },
    isJwtToken(raw: string): boolean {
      const token = (raw || '').trim().replace(/^Bearer\s+/i, '');

      return token.startsWith('eyJ') && token.split('.').length === 3;
    },
    isUsableToken(raw: string): boolean {
      const token = (raw || '').trim().replace(/^Bearer\s+/i, '');
      if (!token || token.length < 10) return false;
      if (/\s/.test(token)) return false;
      if (token[0] === '{' || token[0] === '[') return false;

      return token.startsWith('eyJ') && token.split('.').length === 3;
    },
    extractBearerTokenFromUnknown(raw: unknown): string {
      if (typeof raw !== 'string') return '';
      const normalized = this.normalizeBearerToken(raw);
      if (this.isUsableToken(normalized)) return normalized;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed === null || typeof parsed !== 'object') return '';
        const candidates = [parsed.token, parsed.access_token, parsed.authToken, parsed.sessionId];
        for (const candidate of candidates) {
          if (typeof candidate !== 'string') continue;
          const nested = this.normalizeBearerToken(candidate);
          if (this.isUsableToken(nested)) return nested;
        }
      } catch (e: unknown) {
        log('auth-resolve: fallback extractBearerTokenFromUnknown JSON parse failed — ' + toErrorMessage(e), 'debug');
      }

      return '';
    },
    scanSupabaseLocalStorage(): string {
      return '';
    },
    extractSupabaseTokenFromRaw(): string {
      return '';
    },
  };
}

// Re-export SDK utilities for backward compatibility with existing consumers
export function normalizeBearerToken(raw: string): string {
  return getAuthUtils().normalizeBearerToken(raw);
}

export function isJwtToken(raw: string): boolean {
  return getAuthUtils().isJwtToken(raw);
}

export function isUsableToken(raw: string): boolean {
  return getAuthUtils().isUsableToken(raw);
}

export function extractBearerTokenFromUnknown(raw: unknown): string {
  return getAuthUtils().extractBearerTokenFromUnknown(raw);
}

// ============================================
// Last token source tracking (CQ11: singleton)
// ============================================

class TokenSourceState {
  private _source = 'none';

  get value(): string {
    return this._source;
  }

  set value(src: string) {
    this._source = src;
  }
}

const tokenSourceState = new TokenSourceState();

/** Current token source label — read via LAST_TOKEN_SOURCE, write via setLastTokenSource */
export { tokenSourceState };

/**
 * @deprecated Use tokenSourceState.value instead for new code.
 * Kept as a getter-backed export for backward compatibility with 12+ consumer files.
 */
export function getLastTokenSource(): string {
  return tokenSourceState.value;
}

export function setLastTokenSource(src: string): void {
  tokenSourceState.value = src;
}

// ============================================
// Session Bridge Token
// ============================================

export function getBearerTokenFromSessionBridge(): string {
  const utils = getAuthUtils();

  try {
    for (const key of SESSION_BRIDGE_KEYS) {
      const raw = localStorage.getItem(key) || '';
      const token = utils.extractBearerTokenFromUnknown(raw);

      if (!token) {
        if (raw.length >= 10) {
          log('resolveToken: ignoring non-usable value in localStorage[' + key + ']', 'warn');
        }
        continue;
      }

      if (getLastSessionBridgeSource() !== key) {
        setLastSessionBridgeSource(key);
        log('resolveToken: using bearer token from localStorage[' + key + ']', 'success');
      }

      return token;
    }

    const supabaseToken = utils.scanSupabaseLocalStorage(
      (key: string, tokenLength: number) => {
        setLastSessionBridgeSource(key);
        log('resolveToken: ✅ Found Supabase auth in localStorage[' + key + '] (len=' + tokenLength + ')', 'success');
      },
      (scanErr: unknown) => {
        log('resolveToken: Supabase localStorage scan failed — ' + toErrorMessage(scanErr), 'warn');
      },
    );

    if (supabaseToken) {
      return supabaseToken;
    }
  } catch (e: unknown) {
    log('resolveToken: localStorage bridge unavailable — ' + toErrorMessage(e), 'warn');
  }

  return '';
}

// ============================================
// Cookie Token & Session Cookie Names
// ============================================

import { FALLBACK_SESSION_COOKIE_NAMES, COOKIE_DIAGNOSTIC_COOLDOWN_MS } from './constants';
import { StorageKey } from './types';

// CQ11: Encapsulate diagnostic timestamp in singleton
class CookieDiagnosticState {
  private _lastAt = 0;

  get lastAt(): number {
    return this._lastAt;
  }

  set lastAt(v: number) {
    this._lastAt = v;
  }
}

const cookieDiagState = new CookieDiagnosticState();

/**
 * Reads session cookie names from project namespace cookie bindings.
 * Always appends fallback names so diagnostics and resolution stay resilient.
 */
/** Extract session cookie names from a single project namespace. */
function extractSessionNamesFromProject(ns: RiseupAsiaProject): string[] {
  if (!ns?.cookies?.bindings) {
    return [];
  }

  const names: string[] = [];
  for (const binding of ns.cookies.bindings) {
    if (binding.role === 'session' && binding.cookieName) {
      names.push(binding.cookieName);
    }
  }

  return names;
}

export function getSessionCookieNames(): string[] {
  try {
    const root = (typeof window !== 'undefined' ? window.RiseupAsiaMacroExt : undefined);
    if (!root?.Projects) {
      return FALLBACK_SESSION_COOKIE_NAMES;
    }

    const names: string[] = [];
    for (const projectKey of Object.keys(root.Projects)) {
      const project = root.Projects[projectKey];
      if (!project) {
        continue;
      }
      names.push(...extractSessionNamesFromProject(project));
    }

    return Array.from(new Set(names.concat(FALLBACK_SESSION_COOKIE_NAMES)));
  } catch (e: unknown) {
    log('getSessionCookieNames: failed to read config — ' + toErrorMessage(e), 'warn');

    return FALLBACK_SESSION_COOKIE_NAMES;
  }
}

/** Search cookies for a matching session token. */
function findTokenInCookies(cookies: string[], sessionNames: string[]): { token: string; hasTarget: boolean } {
  const utils = getAuthUtils();

  for (const cookieStr of cookies) {
    const trimmedCookie = cookieStr.trim();
    for (const sessionName of sessionNames) {
      const prefix = sessionName + '=';
      if (trimmedCookie.indexOf(prefix) !== 0) {
        continue;
      }

      const normalized = utils.normalizeBearerToken(trimmedCookie.substring(prefix.length));
      if (!utils.isUsableToken(normalized)) {
        continue;
      }

      log('getBearerTokenFromCookie: Found usable token in document.cookie[' + sessionName + '] (len=' + normalized.length + ')', 'success');

      return { token: normalized, hasTarget: true };
    }
  }

  return { token: '', hasTarget: false };
}

export function getBearerTokenFromCookie(): string {
  const fn = 'getBearerTokenFromCookie';

  try {
    const rawCookie = document.cookie || '';
    const cookies = rawCookie ? rawCookie.split(';') : [];
    const sessionNames = getSessionCookieNames();

    const result = findTokenInCookies(cookies, sessionNames);
    if (result.token) {
      return result.token;
    }

    const now = Date.now();
    const shouldLogDiagnostics = (now - cookieDiagState.lastAt) >= COOKIE_DIAGNOSTIC_COOLDOWN_MS;
    if (!shouldLogDiagnostics) {
      return '';
    }

    cookieDiagState.lastAt = now;
    logCookieDiagnostics(fn, cookies, sessionNames, rawCookie, result.hasTarget);
  } catch (e: unknown) {
    logError('readCookies', 'EXCEPTION reading cookies: ' + toErrorMessage(e));
    logError('readCookies', 'This may happen in sandboxed iframes or restricted contexts');
  }

  return '';
}

function logCookieDiagnostics(
  fn: string,
  cookies: string[],
  sessionNames: string[],
  rawCookie: string,
  hasTargetCookie: boolean,
): void {
  const cookieNames = cookies.map(function (c: string) {
    return c.trim().split('=')[0];
  });

  log(fn + ': === COOKIE DIAGNOSTIC START ===', 'info');
  log(fn + ': Session cookie names (from namespace): [' + sessionNames.join(', ') + ']', 'info');
  log(fn + ': document.cookie accessible: ' + (typeof document.cookie === 'string' ? 'YES' : 'NO'), 'info');
  log(fn + ': Total cookies visible to JS: ' + cookies.length, 'info');
  log(fn + ': Cookie names visible: [' + cookieNames.join(', ') + ']', 'info');
  log(fn + ': Raw cookie string length: ' + rawCookie.length + ' chars', 'info');

  if (!hasTargetCookie) {
    log(fn + ': Session cookie NOT found in document.cookie (expected: HttpOnly)', 'info');
    log(fn + ': Auth should resolve via Supabase localStorage scan or extension bridge', 'info');
  }

  log(fn + ': === COOKIE DIAGNOSTIC END ===', 'info');
}

// ============================================
// Token Persistence & Auth Badge
// ============================================

// ============================================
// Token timestamp helpers (Phase A: Auth Bridge)
// ============================================


/** Read the timestamp when the token was last persisted. */
export function getTokenSavedAt(): number {
  try {
    const raw = localStorage.getItem(StorageKey.TokenSavedAt) || '0';

    return parseInt(raw, 10) || 0;
  } catch (e: unknown) {
    log('getTokenSavedAt: localStorage read failed — ' + toErrorMessage(e), 'warn');

    return 0;
  }
}

/** Save token + timestamp atomically to localStorage. */
export function saveTokenWithTimestamp(token: string): void {
  localStorage.setItem('marco_bearer_token', token);
  localStorage.setItem('lovable-session-id', token);
  localStorage.setItem(StorageKey.TokenSavedAt, String(Date.now()));
  log('[AuthBridge] Token persisted with timestamp', 'info');
}

/** Compute the age of the cached token in milliseconds. */
export function getTokenAge(): number {
  const savedAt = getTokenSavedAt();

  if (savedAt === 0) {
    return Infinity;
  }

  return Date.now() - savedAt;
}

export function persistResolvedBearerToken(token: string): boolean {
  const utils = getAuthUtils();
  const normalized = utils.normalizeBearerToken(token);

  if (!utils.isUsableToken(normalized)) {
    log('resolveToken: rejected non-JWT token candidate', 'warn');

    return false;
  }

  try {
    saveTokenWithTimestamp(normalized);
    updateAuthBadge(true, tokenSourceState.value || 'persisted');

    return true;
  } catch (e: unknown) {
    log('resolveToken: failed to persist token to localStorage — ' + toErrorMessage(e), 'warn');

    return false;
  }
}

export function updateAuthBadge(hasToken: boolean, source: string): void {
  const badge = document.getElementById('loop-auth-badge');
  if (!badge) {
    return;
  }

  if (hasToken) {
    badge.textContent = '🟢';
    badge.title = 'Auth: token available (' + (source || 'unknown') + ') — click to refresh';
  } else {
    badge.textContent = '🔴';
    badge.title = 'Auth: no token — click to refresh';
  }
}

// ============================================
// Synchronous token resolver (primary entry point)
// ============================================

export function resolveToken(): string {
  const sessionToken = getBearerTokenFromSessionBridge();

  if (!sessionToken) {
    tokenSourceState.value = 'none';

    return '';
  }

  tokenSourceState.value = 'localStorage[' + getLastSessionBridgeSource() + ']';

  return sessionToken;
}

// v7.39: markBearerTokenExpired now actually clears cached token (RCA-5 fix)
export function markBearerTokenExpired(controller: string): void {
  log('[' + controller + '] Bearer token expired (401/403) — clearing cached token', 'warn');

  try {
    for (const key of SESSION_BRIDGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (e: unknown) {
    log('markBearerTokenExpired: localStorage cleanup failed — ' + toErrorMessage(e), 'warn');
  }

  updateAuthBadge(false, 'expired');
}

// v7.25: Invalidate a specific session bridge key
export function invalidateSessionBridgeKey(token: string): string {
  const utils = getAuthUtils();
  const normalizedTarget = utils.normalizeBearerToken(token);
  const removedKeys: string[] = [];

  for (const key of SESSION_BRIDGE_KEYS) {
    try {
      const stored = localStorage.getItem(key) || '';
      const normalizedStored = utils.extractBearerTokenFromUnknown(stored);

      if (normalizedStored === '' || normalizedStored !== normalizedTarget) {
        continue;
      }

      localStorage.removeItem(key);
      removedKeys.push(key);
    } catch (e: unknown) {
      log('invalidateSessionBridgeKey: failed to check/remove localStorage[' + key + '] — ' + toErrorMessage(e), 'warn');
    }
  }

  if (removedKeys.length > 0) {
    log('Token fallback: invalidated localStorage[' + removedKeys.join(', ') + ']', 'warn');
  }

  return removedKeys.join(',');
}
