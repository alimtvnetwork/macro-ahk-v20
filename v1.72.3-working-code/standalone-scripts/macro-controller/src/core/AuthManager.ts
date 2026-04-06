/**
 * AuthManager — Wraps auth.ts functions into a class (V2 Phase 02, Step 2)
 *
 * Implements AuthManagerInterface from MacroController.
 * Delegates to existing auth.ts functions — no logic duplication.
 *
 * See: spec/01-app/macrocontroller-ts-migration-v2/02-class-architecture.md
 */

import type { AuthManagerInterface } from './MacroController';
import {
  resolveToken,
  refreshBearerTokenFromBestSource,
  getBearerTokenFromSessionBridge,
  getBearerTokenFromCookie,
  persistResolvedBearerToken,
  updateAuthBadge,
  markBearerTokenExpired,
  invalidateSessionBridgeKey,
  recoverAuthOnce,
  requestTokenFromExtension,
  LAST_TOKEN_SOURCE,
  setLastTokenSource,
} from '../auth';
import { verifyWorkspaceSessionAfterFailure } from '../workspace-management';
import { log } from '../logging';

export class AuthManager implements AuthManagerInterface {

  /** Synchronous token resolution — returns cached/localStorage/cookie token or '' */
  getToken(): string {
    return resolveToken();
  }

  /** Async refresh from best source (waterfall: localStorage → extension bridge → cookie) */
  refreshToken(callback: (token: string, source: string) => void): void {
    refreshBearerTokenFromBestSource(callback);
  }

  /** Last source that successfully provided a token */
  getLastSource(): string {
    return LAST_TOKEN_SOURCE;
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
