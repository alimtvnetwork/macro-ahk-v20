/**
 * MacroLoop Controller — Token Broadcast Listener
 * v7.41: Listens for TOKEN_UPDATED / TOKEN_EXPIRED broadcasts from
 * the extension's cookie watcher (via content script relay).
 *
 * This provides proactive token updates without polling —
 * when the cookie changes, the extension broadcasts immediately.
 *
 * See: spec/17-app-issues/auth-cookie-read-lovable-issue.md §Fix 4
 */

import { log } from './logging';
import { persistResolvedBearerToken, updateAuthBadge, setLastTokenSource } from './auth';

const SOURCE_EXTENSION = 'marco-extension';

interface TokenBroadcast {
  source: string;
  type: string;
  token?: string;
  reason?: string;
  payload?: {
    token?: string;
    reason?: string;
    payload?: {
      token?: string;
      reason?: string;
    };
  };
}

// CQ11: Singleton for listener registration guard
class BroadcastListenerState {
  private _registered = false;

  get registered(): boolean {
    return this._registered;
  }

  set registered(v: boolean) {
    this._registered = v;
  }
}

const broadcastState = new BroadcastListenerState();

/**
 * Registers a window.postMessage listener for proactive token broadcasts.
 * Idempotent — safe to call multiple times.
 */
export function registerTokenBroadcastListener(): void {
  if (broadcastState.registered) return;
  broadcastState.registered = true;

  window.addEventListener('message', handleTokenBroadcast);
  log('[TokenBroadcast] Listener registered for TOKEN_UPDATED / TOKEN_EXPIRED', 'info');
}

function handleTokenBroadcast(event: MessageEvent): void {
  const data = event.data as TokenBroadcast | null;
  if (!data || data.source !== SOURCE_EXTENSION) return;

  const token = data.token
    || data.payload?.token
    || data.payload?.payload?.token
    || '';

  const reason = data.reason
    || data.payload?.reason
    || data.payload?.payload?.reason
    || 'unknown';

  if (data.type === 'TOKEN_UPDATED' && token) {
    log('[TokenBroadcast] Received TOKEN_UPDATED — persisting new token', 'success');
    const persisted = persistResolvedBearerToken(token);
    if (persisted) {
      setLastTokenSource('broadcast[cookie-watcher]');
      updateAuthBadge(true, 'broadcast[cookie-watcher]');
    } else {
      log('[TokenBroadcast] Ignored TOKEN_UPDATED payload because token is not a valid JWT', 'warn');
    }
    return;
  }

  if (data.type === 'TOKEN_EXPIRED') {
    log('[TokenBroadcast] Received TOKEN_EXPIRED — reason: ' + reason, 'warn');
    updateAuthBadge(false, 'expired[broadcast]');
    return;
  }
}
