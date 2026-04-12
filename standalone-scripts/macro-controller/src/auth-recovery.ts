/**
 * MacroLoop Controller — Auth Recovery & Refresh Waterfall
 * Phase 5B: Extracted from auth.ts
 * Phase 6: Refactored to class-based encapsulation (CQ11, CQ12, CQ16, CQ17, CQ18)
 *
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md
 *
 * Conversion (CQ10):
 *   Before: 4 module-level `let` vars, nested `finishRecovery()`, inline setTimeout retry,
 *           C-style for loops, `.push()`/`.splice()` on shared arrays.
 *   After:  `AuthRecoveryManager` class with private state, `ConcurrencyLock` utility,
 *           `for-of` loops, no nested functions, no mutable module-level state.
 */

import { log } from './logging';
import { logDebug } from './error-utils';
import { getLastSessionBridgeSource } from './shared-state';
import {
  getBearerTokenFromSessionBridge,
  getBearerTokenFromCookie,
  getSessionCookieNames,
  getTokenAge,
  persistResolvedBearerToken,
  resolveToken,
  setLastTokenSource,
  updateAuthBadge,
} from './auth-resolve';
import {
  isRelayActive,
  requestTokenFromExtension,
} from './auth-bridge';
import { createConcurrencyLock } from './async-utils';
import type { ConcurrencyLock } from './async-utils';
import { logError } from './error-utils';

// ============================================
// Types
// ============================================

export interface RefreshTokenOptions {
  readonly skipSessionBridgeCache?: boolean;
}

/** Options for getBearerToken(). */
export interface GetBearerTokenOptions {
  /** Force a refresh even if the cached token is fresh. */
  readonly force?: boolean;
}

type RefreshOutcomeRecorder = (success: boolean, source: string, error?: string) => void;

type RefreshCallback = (token: string, source: string) => void;

// ============================================
// AuthRecoveryManager
// ============================================

/**
 * Manages auth token recovery with single-flight concurrency control (RCA-4).
 * All mutable state is encapsulated — no module-level `let` variables.
 */
export class AuthRecoveryManager {
  private readonly recoveryLock: ConcurrencyLock<string>;
  private outcomeRecorder: RefreshOutcomeRecorder | null = null;

  constructor() {
    this.recoveryLock = createConcurrencyLock<string>();
  }

  /**
   * Register a late-bound callback for recording refresh outcomes (diagnostics).
   */
  setOutcomeRecorder(fn: RefreshOutcomeRecorder): void {
    this.outcomeRecorder = fn;
  }

  /**
   * Attempt auth recovery exactly once. If recovery is already in progress,
   * waits for the existing attempt to finish (10s safety timeout).
   * Prevents parallel recovery storms (RCA-4).
   */
  recoverOnce(): Promise<string> {
    const isAlreadyRunning = this.recoveryLock.isInFlight;

    if (isAlreadyRunning) {
      log(
        '[AuthRecovery] Recovery already in flight — waiting for result...',
        'info',
      );
    } else {
      log('[AuthRecovery] Starting token recovery...', 'check');
    }

    return this.recoveryLock
      .run(
        () => this.executeRecovery(),
        10_000,
        resolveToken(),
      )
      .then(function (result) {
        return result.value;
      });
  }

  /**
   * Core recovery logic — called only once per flight.
   */
  private executeRecovery(): Promise<string> {
    return new Promise<string>((resolve) => {
      refreshBearerTokenFromBestSource(
        (token: string, source: string) => {
          this.handleRecoveryResult(token, source);

          resolve(token);
        },
        { skipSessionBridgeCache: true },
      );
    });
  }

  /**
   * Process recovery result: update badge, log, record outcome.
   */
  private handleRecoveryResult(token: string, source: string): void {
    const hasToken = !!token;

    if (hasToken) {
      setLastTokenSource(source);
      updateAuthBadge(true, source);
      log('[AuthRecovery] Recovered token from ' + source, 'success');
      this.recordOutcome(true, source);

      return;
    }

    log(
      '[AuthRecovery] No token from any source — recovery failed',
      'error',
    );
    updateAuthBadge(false, 'recovery-failed');
    this.recordOutcome(false, 'none', 'No token from any source');
  }

  private recordOutcome(success: boolean, source: string, error?: string): void {
    const hasRecorder = this.outcomeRecorder !== null;

    if (hasRecorder) {
      this.outcomeRecorder!(success, source, error);
    }
  }
}

// ============================================
// Singleton instance
// ============================================

const authRecoveryManager = new AuthRecoveryManager();

// ============================================
// TTL-aware getBearerToken (Phase A: Auth Bridge)
// ============================================

import { DEFAULT_TOKEN_TTL_MS } from './constants';

/** Read configured TTL from marco_config_overrides or config JSON. */
function resolveTokenTtlMs(): number {
  try {
    const overrides = (window as unknown as Record<string, unknown>).marco_config_overrides as
      { tokenTtlMs?: number } | undefined;

    if (overrides && typeof overrides.tokenTtlMs === 'number') {
      return overrides.tokenTtlMs;
    }
  } catch (_e) {
    logDebug('getTokenTtlMs', 'Config override read failed: ' + (_e instanceof Error ? _e.message : String(_e)));
  }

  try {
    const cfg = (window as unknown as Record<string, unknown>).__MARCO_CONFIG__ as
      { authBridge?: { tokenTtlMs?: number } } | undefined;

    if (cfg?.authBridge?.tokenTtlMs) {
      return cfg.authBridge.tokenTtlMs;
    }
  } catch (_e) {
    logDebug('getTokenTtlMs', '__MARCO_CONFIG__ read failed: ' + (_e instanceof Error ? _e.message : String(_e)));
  }

  return DEFAULT_TOKEN_TTL_MS;
}

/** Check if the cached token is still fresh per TTL. */
function isTokenFresh(): boolean {
  const age = getTokenAge();
  const ttl = resolveTokenTtlMs();

  return age < ttl;
}

/**
 * TTL-aware bearer token accessor.
 *
 * Fast path: returns localStorage token if fresh (age < TTL).
 * Slow path: refreshes via cookie fallback, saves with timestamp.
 *
 * @see spec/05-chrome-extension/36-cookie-only-bearer.md (v2.0.0)
 */
export function getBearerToken(options?: GetBearerTokenOptions): Promise<string> {
  const shouldForce = !!(options && options.force);

  if (!shouldForce && isTokenFresh()) {
    const cached = resolveToken();

    if (cached) {
      log('[AuthBridge] Token fresh (age=' + getTokenAge() + 'ms) — returning cached', 'info');

      return Promise.resolve(cached);
    }
  }

  log('[AuthBridge] Token stale or forced — refreshing via recovery...', 'check');

  return authRecoveryManager.recoverOnce();
}

/** Return raw token from localStorage without TTL check. */
export function getRawToken(): string {
  return resolveToken();
}

// ============================================
// Public API (backward-compatible exports)
// ============================================

/**
 * @deprecated Use `authRecoveryManager.setOutcomeRecorder()` directly.
 * Kept for backward compatibility with existing consumers.
 */
export function setRecordRefreshOutcome(
  fn: (success: boolean, source: string, error?: string) => void,
): void {
  authRecoveryManager.setOutcomeRecorder(fn);
}

/**
 * @deprecated Use `authRecoveryManager.recoverOnce()` directly.
 * Kept for backward compatibility with existing consumers.
 */
export function recoverAuthOnce(): Promise<string> {
  return authRecoveryManager.recoverOnce();
}

/** Export the manager for direct use by newer code. */
export { authRecoveryManager };

// ============================================
// Refresh from best source (waterfall)
// ============================================

/**
 * Multi-tier token refresh waterfall:
 * Tier 1/2: localStorage (seeded keys + Supabase scan)
 * Tier 3a: Extension bridge GET_TOKEN
 * Tier 3b: Extension bridge REFRESH_TOKEN
 * Tier 4: Cookie fallback
 */
export function refreshBearerTokenFromBestSource(
  onDone: RefreshCallback,
  options?: RefreshTokenOptions,
): void {
  const shouldSkipCache = !!(options && options.skipSessionBridgeCache);
  const cookieSourceLabel = buildCookieSourceLabel();

  const hasCachedToken = attemptLocalStorageTier(shouldSkipCache, onDone);

  if (hasCachedToken) {
    return;
  }

  attemptExtensionBridgeTier(onDone, cookieSourceLabel);
}

// ============================================
// Waterfall tier helpers (CQ4: decomposed)
// ============================================

function buildCookieSourceLabel(): string {
  const sessionNames = getSessionCookieNames();
  const firstName = sessionNames[0] || 'session';

  return 'cookie[' + firstName + ']';
}

function attemptLocalStorageTier(
  shouldSkipCache: boolean,
  onDone: RefreshCallback,
): boolean {
  if (shouldSkipCache) {
    return false;
  }

  const seededToken = getBearerTokenFromSessionBridge();
  const hasSeededToken = !!seededToken;
  const isPersisted = hasSeededToken && persistResolvedBearerToken(seededToken);

  if (isPersisted) {
    log(
      'refreshToken: ✅ Tier 1/2 — resolved from localStorage[' +
        getLastSessionBridgeSource() + ']',
      'success',
    );
    onDone(seededToken, 'localStorage[' + getLastSessionBridgeSource() + ']');

    return true;
  }

  return false;
}

function attemptExtensionBridgeTier(
  onDone: RefreshCallback,
  cookieSourceLabel: string,
): void {
  log(
    'refreshToken: Tier 1/2 miss — checking relay health before bridge attempt...',
    'check',
  );

  isRelayActive().then(function (isRelayAlive) {
    logRelayStatus(isRelayAlive);
    attemptBridgeGetToken(onDone, cookieSourceLabel);
  });
}

function logRelayStatus(isRelayAlive: boolean): void {
  if (isRelayAlive) {
    log(
      'refreshToken: Relay active — attempting extension bridge GET_TOKEN...',
      'check',
    );

    return;
  }

  log(
    'refreshToken: ⚠️ Relay ping timed out (500ms) — attempting bridge anyway before cookie fallback',
    'warn',
  );
}

function attemptBridgeGetToken(
  onDone: RefreshCallback,
  cookieSourceLabel: string,
): void {
  requestTokenFromExtension(
    false,
    function (cachedToken: string, cachedSource: string) {
      const hasCachedToken = !!cachedToken && persistResolvedBearerToken(cachedToken);

      if (hasCachedToken) {
        log('refreshToken: ✅ Tier 3a — resolved from ' + cachedSource, 'success');
        onDone(cachedToken, cachedSource);

        return;
      }

      attemptBridgeRefreshToken(onDone, cookieSourceLabel);
    },
  );
}

function attemptBridgeRefreshToken(
  onDone: RefreshCallback,
  cookieSourceLabel: string,
): void {
  requestTokenFromExtension(
    true,
    function (refreshedToken: string, refreshedSource: string) {
      const hasRefreshedToken = !!refreshedToken && persistResolvedBearerToken(refreshedToken);

      if (hasRefreshedToken) {
        log('refreshToken: ✅ Tier 3b — resolved from ' + refreshedSource, 'success');
        onDone(refreshedToken, refreshedSource);

        return;
      }

      attemptCookieFallback(onDone, cookieSourceLabel);
    },
  );
}

function attemptCookieFallback(
  onDone: RefreshCallback,
  cookieSourceLabel: string,
): void {
  const cookieToken = getBearerTokenFromCookie();
  const hasCookieToken = !!cookieToken && persistResolvedBearerToken(cookieToken);

  if (hasCookieToken) {
    log('refreshToken: ✅ Tier 4 — resolved from cookie', 'success');
    onDone(cookieToken, cookieSourceLabel);

    return;
  }

  logError('refreshToken', '❌ All tiers exhausted — no token found');
  onDone('', 'none');
}
