/**
 * AuthManager — Wraps auth.ts functions into a class (V2 Phase 02, Step 2)
 *
 * Implements AuthManagerInterface from MacroController.
 * Delegates to existing auth.ts functions — no logic duplication.
 *
 * See: spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import type { AuthManagerInterface } from './MacroController';
import { verifyWorkspaceSessionAfterFailure } from '../workspace-management';

import { getLastTokenSource, getBearerTokenFromCookie, getBearerTokenFromSessionBridge, invalidateSessionBridgeKey, markBearerTokenExpired, persistResolvedBearerToken, recoverAuthOnce, refreshBearerTokenFromBestSource, requestTokenFromExtension, resolveToken, setLastTokenSource, updateAuthBadge, getBearerToken } from '../auth';

export class AuthManager implements AuthManagerInterface {

  /** Unified token retrieval — returns TTL-aware cached token or recovers */
  getToken(): Promise<string> {
    return getBearerToken();
  }

  /** Async refresh from best source (waterfall: localStorage → extension bridge → cookie) */
  refreshToken(callback: (token: string, source: string) => void): void {
    refreshBearerTokenFromBestSource(callback);
  }

  /** Last source that successfully provided a token */
  getLastSource(): string {
    return getLastTokenSource();
  }

  /** Set last token source label */
  setLastSource(source: string): void {
    setLastTokenSource(source);
  }

  /** Get token from localStorage session bridge keys */
  getTokenFromSessionBridge(): string {
    return getBearerTokenFromSessionBridge();
  }

  /** Get token from document.cookie */
  getTokenFromCookie(): string {
    return getBearerTokenFromCookie();
  }

  /** Persist token to localStorage */
  persistToken(token: string): boolean {
    return persistResolvedBearerToken(token);
  }

  /** Update the auth badge UI element */
  updateBadge(hasToken: boolean, source: string): void {
    updateAuthBadge(hasToken, source);
  }

  /** Mark token as expired — clears cached token */
  markExpired(controller: string): void {
    markBearerTokenExpired(controller);
  }

  /** Invalidate a specific session bridge key */
  invalidateKey(token: string): string {
    return invalidateSessionBridgeKey(token);
  }

  /** Request token from extension bridge (async with timeout) */
  requestFromExtension(forceRefresh: boolean, onDone: (token: string, source: string) => void): void {
    requestTokenFromExtension(forceRefresh, onDone);
  }

  /** Single-flight auth recovery (RCA-4 fix) */
  recoverOnce(): Promise<string> {
    return recoverAuthOnce();
  }

  /** Verify session health after a failed API call */
  verifySession(context: string): void {
    verifyWorkspaceSessionAfterFailure(context);
  }
}
