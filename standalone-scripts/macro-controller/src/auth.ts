/**
 * MacroLoop Controller — Auth Module (barrel re-export)
 * Phase 5B: Split into focused sub-modules:
 *   - auth-resolve.ts    (token utils, session bridge, cookie, resolve, persist, badge)
 *   - auth-bridge.ts     (extension bridge, relay health, debug snapshot)
 *   - auth-recovery.ts   (recoverAuthOnce, refreshBearerTokenFromBestSource)
 *
 * This barrel preserves backward compatibility for all existing imports.
 */

export {
  normalizeBearerToken,
  isJwtToken,
  isUsableToken,
  extractBearerTokenFromUnknown,
  getLastTokenSource,
  setLastTokenSource,
  getBearerTokenFromSessionBridge,
  getSessionCookieNames,
  getBearerTokenFromCookie,
  persistResolvedBearerToken,
  updateAuthBadge,
  resolveToken,
  markBearerTokenExpired,
  invalidateSessionBridgeKey,
  getTokenSavedAt,
  saveTokenWithTimestamp,
  getTokenAge,
} from './auth-resolve';

export {
  getLastBridgeOutcome,
  getAuthDebugSnapshot,
  extractTokenFromAuthBridgeResponse,
  requestTokenFromExtension,
  isRelayActive,
  wakeBridge,
} from './auth-bridge';

export type { AuthDebugSnapshot } from './auth-bridge';

export {
  setRecordRefreshOutcome,
  recoverAuthOnce,
  refreshBearerTokenFromBestSource,
  authRecoveryManager,
  getBearerToken,
  getRawToken,
} from './auth-recovery';

export type { RefreshTokenOptions, GetBearerTokenOptions } from './auth-recovery';
