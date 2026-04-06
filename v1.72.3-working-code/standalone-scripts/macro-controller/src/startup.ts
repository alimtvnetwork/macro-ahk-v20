/**
 * MacroLoop Controller — Startup & Initialization
 * Step 2h: Extracted from macro-looping.ts
 *
 * Contains: bootstrap sequence, auth resolution, workspace loading,
 * auto-resync on focus/visibility, SPA persistence observer,
 * global error handlers, diagnostic dump.
 */

import { log } from './logging';
import { timingStart, timingEnd } from './startup-timing';
import { initNamespace, dualWrite, dualWriteAll, nsRead } from './api-namespace';
import { registerTokenBroadcastListener } from './token-broadcast-listener';
import { showToast } from './toast';
import { MacroController, installWindowFacade } from './core/MacroController';
import { AuthManager } from './core/AuthManager';
import { CreditManager } from './core/CreditManager';
import { WorkspaceManager } from './core/WorkspaceManager';
import { LoopEngine } from './core/LoopEngine';
import { UIManager } from './core/UIManager';
import {
  resolveToken, refreshBearerTokenFromBestSource, updateAuthBadge,
  getBearerTokenFromSessionBridge,
  persistResolvedBearerToken, LAST_TOKEN_SOURCE, setLastTokenSource,
} from './auth';
import { SESSION_BRIDGE_KEYS, LAST_SESSION_BRIDGE_SOURCE, IDS, VERSION, CREDIT_API_BASE, loopCreditState, state } from './shared-state';
import { fetchLoopCreditsAsync, syncCreditStateFromApi } from './credit-fetch';
import { autoDetectLoopCurrentWorkspace, extractProjectIdFromUrl } from './workspace-detection';
import { startWorkspaceObserver } from './workspace-observer';
import { updateUI } from './ui/ui-updaters';
import { startLoop, stopLoop } from './loop-engine';

// ============================================
// Startup token readiness gate
// ============================================
interface TokenReadyResult {
  token: string;
  waitedMs: number;
  reason: string;
}

/**
 * Polls resolveToken() at short intervals until a token is available
 * or the timeout expires. Returns immediately if a token already exists.
 */
function ensureTokenReady(timeoutMs: number): Promise<TokenReadyResult> {
  const POLL_INTERVAL_MS = 250;
  const REFRESH_RETRY_MS = 1500;
  const startedAt = Date.now();

  return new Promise<TokenReadyResult>(function(resolve) {
    let settled = false;
    let refreshInFlight = false;
    let lastRefreshAt = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    function finish(result: TokenReadyResult): void {
      if (settled) return;
      settled = true;
      if (timer !== null) clearInterval(timer);
      resolve(result);
    }

    function maybeRefreshFromExtension(): void {
      if (refreshInFlight) return;
      const now = Date.now();
      if ((now - lastRefreshAt) < REFRESH_RETRY_MS) return;

      refreshInFlight = true;
      lastRefreshAt = now;

      refreshBearerTokenFromBestSource(function(refreshedToken: string, source: string) {
        refreshInFlight = false;
        if (!refreshedToken) return;
        finish({
          token: refreshedToken,
          waitedMs: Date.now() - startedAt,
          reason: 'refreshed-from-' + (source || 'extension-bridge'),
        });
      }, { skipSessionBridgeCache: true });
    }

    // Check immediately
    const immediateToken = resolveToken();
    if (immediateToken) {
      finish({ token: immediateToken, waitedMs: 0, reason: 'immediate' });
      return;
    }

    // No local token yet — proactively trigger extension/cookie → storage refresh.
    maybeRefreshFromExtension();

    timer = setInterval(function() {
      const token = resolveToken();
      const elapsed = Date.now() - startedAt;

      if (token) {
        finish({ token, waitedMs: elapsed, reason: 'resolved' });
        return;
      }

      maybeRefreshFromExtension();

      if (elapsed >= timeoutMs) {
        finish({ token: '', waitedMs: elapsed, reason: 'Timeout — no token after ' + Math.round(elapsed / 1000) + 's. Ensure you are logged in.' });
      }
    }, POLL_INTERVAL_MS);
  });
}

// ============================================
// Startup bootstrap
// ============================================

/**
 * Run the full startup sequence (V2 Phase 01 — fixed order):
 * 1. Place script marker
 * 2. Register window globals
 * 3. Resolve auth token
 * 4. Load workspaces via API
 * 5. Create UI with loaded data
 * 6. Start workspace observer
 * 7. Setup auth resync, persistence observer, global error handlers
 */
export function bootstrap(deps: {
  createUI: () => void;
  fetchLoopCreditsWithDetect: (isRetry?: boolean) => void;
  setLoopInterval: (ms: number) => void;
  forceSwitch: (dir: string) => void;
  runCheck: () => any;
  delegateComplete: () => void;
  updateProjectButtonXPath: (xpath: string) => void;
  updateProgressXPath: (xpath: string) => void;
  destroyPanel: () => void;
  hasXPathUtils: boolean;
}): void {
  timingStart('bootstrap', 'Bootstrap');
  // Place marker
  const marker = document.createElement('div');
  marker.id = IDS.SCRIPT_MARKER;
  marker.style.display = 'none';
  marker.setAttribute('data-version', VERSION);
  document.body.appendChild(marker);

  // Register window globals + namespace dual-write (Issue 79 Phase 9A)
  dualWriteAll([
    ['__loopStart', 'api.loop.start', startLoop as (direction?: string) => void],
    ['__loopStop', 'api.loop.stop', stopLoop],
    ['__loopCheck', 'api.loop.check', deps.runCheck],
    ['__loopState', 'api.loop.state', function() { return state; }],
    ['__loopSetInterval', 'api.loop.setInterval', deps.setLoopInterval],
    ['__loopToast', 'api.ui.toast', showToast],
    ['__delegateComplete', '_internal.delegateComplete', deps.delegateComplete],
    ['__setProjectButtonXPath', 'api.config.setProjectButtonXPath', deps.updateProjectButtonXPath],
    ['__setProgressXPath', 'api.config.setProgressXPath', deps.updateProgressXPath],
  ]);

  // V2 Phase 01: UI is NOT created here — it waits for workspace data.
  // Show minimal loading indicator while waiting.
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'marco-loading-indicator';
  loadingIndicator.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;background:rgba(15,15,25,0.95);color:#a78bfa;border:1px solid #7c3aed;border-radius:8px;font-size:11px;font-family:monospace;z-index:99998;box-shadow:0 4px 12px rgba(124,58,237,0.3);';
  loadingIndicator.textContent = '⏳ MacroLoop initializing...';
  document.body.appendChild(loadingIndicator);

  // v7.41: Register proactive token broadcast listener (Fix 4 + payload unwrapping)
  registerTokenBroadcastListener();

  // Timeout fallback: if API takes too long, render UI anyway (5s max)
  const UI_TIMEOUT_MS = 5000;
  let uiCreated = false;

  function createUIOnce() {
    if (uiCreated) return;
    uiCreated = true;
    // Remove loading indicator
    const indicator = document.getElementById('marco-loading-indicator');
    if (indicator) indicator.remove();
    // Create UI with whatever data we have
    deps.createUI();
    // Start workspace observer AFTER UI
    log('Starting workspace MutationObserver (v6.56) — workspace name always visible', 'success');
    startWorkspaceObserver();
  }

  const uiTimeoutTimer = setTimeout(function() {
    if (!uiCreated) {
      log('Startup: ⚠️ UI timeout (' + UI_TIMEOUT_MS + 'ms) — rendering UI without workspace data', 'warn');
      showToast('Workspace loading slow — UI rendered with partial data', 'warn', { noStop: true });
      createUIOnce();
    }
  }, UI_TIMEOUT_MS);

  // Auth + workspace loading (no delay — bridge listener is synchronous)
  function loadWorkspacesOnStartup() {
    log('Auto-loading workspaces on injection...', 'check');

    // ── Startup self-check: ensure token is available before fetching ──
      // Issue 84 Fix 5: Reduced from 6000→4000ms for faster startup.
      // Token is usually available immediately or within 1-2s from the bridge.
      timingStart('token', 'Token Resolution');
      ensureTokenReady(4000).then(function(tokenResult) {
      if (!tokenResult.token) {
        timingEnd('token', 'error', 'No token after ' + tokenResult.waitedMs + 'ms');
        log('Startup self-check: ❌ Token not available after ' + tokenResult.waitedMs + 'ms — ' + tokenResult.reason, 'error');
        showToast(
          '⚠️ Auth failed — no token after ' + Math.round(tokenResult.waitedMs / 1000) + 's. '
          + 'Try: 1) Re-login to lovable.dev  2) Hard refresh (Ctrl+Shift+R)  3) Click Credits to retry',
          'error',
          { noStop: true },
        );
        // Still create UI so the user can interact
        clearTimeout(uiTimeoutTimer);
        timingEnd('bootstrap', 'warn', 'No token');
        createUIOnce();
        updateUI();
        return;
      }

      timingEnd('token', 'ok', tokenResult.waitedMs + 'ms via ' + LAST_TOKEN_SOURCE);
      log('Startup self-check: ✅ Token ready after ' + tokenResult.waitedMs + 'ms (source: ' + LAST_TOKEN_SOURCE + ')', 'success');

      // Parallelize: credit fetch, Tier 1 workspace prefetch, and UI creation all start together
      timingStart('credits', 'Credit Fetch');
      const creditPromise = fetchLoopCreditsAsync(false);

      // Prefetch Tier 1 mark-viewed response while credits load (saves ~200-800ms)
      timingStart('ws-prefetch', 'WS Tier1 Prefetch');
      const projectId = extractProjectIdFromUrl();
      const startupToken = resolveToken();
      let tier1Data: any = null;
      const tier1Promise = (projectId && startupToken)
        ? fetch(CREDIT_API_BASE + '/projects/' + projectId + '/mark-viewed', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + startupToken },
            credentials: 'include',
            body: '{}',
          }).then(function(resp) {
            if (!resp.ok) {
              log('Startup: Tier 1 prefetch HTTP ' + resp.status, 'warn');
              return null;
            }
            return resp.json();
          }).then(function(data) {
            tier1Data = data;
            timingEnd('ws-prefetch', 'ok');
            return data;
          }).catch(function(err: any) {
            log('Startup: Tier 1 prefetch error: ' + (err?.message || err), 'warn');
            timingEnd('ws-prefetch', 'warn', err?.message || String(err));
            return null;
          })
        : Promise.resolve(null).then(function() {
            timingEnd('ws-prefetch', 'warn', 'No projectId or token');
            return null;
          });

      // Create UI immediately (don't wait for API)
      timingStart('ui', 'UI Creation');
      clearTimeout(uiTimeoutTimer);
      createUIOnce();
      timingEnd('ui', 'ok');

      // Wait for both credits AND tier1 prefetch, then resolve workspace
      Promise.all([creditPromise, tier1Promise]).then(function() {
        timingEnd('credits', 'ok');
        log('Startup: Workspaces loaded successfully', 'success');
        timingStart('workspace', 'Workspace Detection');

        // Try to resolve from prefetched Tier 1 data before full autoDetect
        if (tier1Data) {
          const wsId = tier1Data.workspace_id
            || (tier1Data.project && tier1Data.project.workspace_id)
            || tier1Data.workspaceId || '';
          if (wsId) {
            const wsById = loopCreditState.wsById || {};
            const perWs = loopCreditState.perWorkspace || [];
            let matched = wsById[wsId];
            if (!matched) {
              for (let i = 0; i < perWs.length; i++) {
                if (perWs[i].id === wsId) { matched = perWs[i]; break; }
              }
            }
            if (matched) {
              state.workspaceName = matched.fullName || matched.name;
              state.workspaceFromApi = true;
              loopCreditState.currentWs = matched;
              timingEnd('workspace', 'ok', 'Tier 1 prefetch: ' + state.workspaceName);
              log('Startup: ✅ Workspace resolved from prefetched Tier 1: "' + state.workspaceName + '"', 'success');
              syncCreditStateFromApi();
              updateUI();
              timingEnd('bootstrap', 'ok');
              return;
            }
          }
        }

        // Tier 1 prefetch didn't resolve — fall through to full autoDetect
        // skipDialog=true: NEVER click the project dialog during startup (Issue 82)
        const freshToken = resolveToken();
        return autoDetectLoopCurrentWorkspace(freshToken, { skipDialog: true }).then(function() {
          timingEnd('workspace', state.workspaceName ? 'ok' : 'warn', state.workspaceName || 'No name detected');
          syncCreditStateFromApi();
          updateUI();
          timingEnd('bootstrap', 'ok');
          log('Startup: Workspace detection and UI update complete', 'success');

          if (!state.workspaceName) {
            log('Startup: ⚠️ Workspace name still empty after initial detection — scheduling retry in 3s', 'warn');
            scheduleWorkspaceRetry(1);
          }
        });
      }).catch(function(err: Error) {
        timingEnd('credits', 'error', err && err.message ? err.message : String(err));
        timingEnd('bootstrap', 'error', 'Credit fetch failed');
        log('Startup: Credit/workspace load failed: ' + (err && err.message ? err.message : String(err)), 'warn');
        showToast('Could not load workspaces — click Credits to retry', 'warn', { noStop: true });
        updateUI();
        scheduleWorkspaceRetry(1);
      });
    });
  }

  // Issue 84 Fix 2: Increased retries from 2→4 with shorter initial delays (1.5s, 3s, 4.5s, 6s)
  // to improve workspace name detection speed on slow-loading pages.
  const STARTUP_WS_MAX_RETRIES = 4;
  function scheduleWorkspaceRetry(attempt: number) {
    if (attempt > STARTUP_WS_MAX_RETRIES) {
      log('Startup: Workspace retry exhausted (' + STARTUP_WS_MAX_RETRIES + ' attempts) — workspace may need manual Check', 'warn');
      return;
    }
    const delayMs = attempt * 1500;
    log('Startup: Scheduling workspace retry #' + attempt + ' in ' + delayMs + 'ms', 'check');
    setTimeout(function() {
      if (state.workspaceName) {
        log('Startup: Workspace already resolved ("' + state.workspaceName + '") — skipping retry #' + attempt, 'success');
        return;
      }
      log('Startup: Retry #' + attempt + ' — re-fetching credits + workspace detection...', 'check');
      const retryToken = resolveToken();
      state.workspaceFromApi = false;

      // Issue 82: Retry must re-fetch credits first to ensure perWorkspace is populated
      // autoDetectLoopCurrentWorkspace returns immediately if perWorkspace is empty
      fetchLoopCreditsAsync(false).then(function() {
        return autoDetectLoopCurrentWorkspace(retryToken);
      }).then(function() {
        syncCreditStateFromApi();
        updateUI();
        if (state.workspaceName) {
          log('Startup: ✅ Retry #' + attempt + ' succeeded — workspace: "' + state.workspaceName + '"', 'success');
        } else {
          log('Startup: Retry #' + attempt + ' — workspace still empty, scheduling next retry', 'warn');
          scheduleWorkspaceRetry(attempt + 1);
        }
      }).catch(function() {
        log('Startup: Retry #' + attempt + ' failed — scheduling next retry', 'warn');
        scheduleWorkspaceRetry(attempt + 1);
      });
    }, delayMs);
  }

  // ── Fix 1+2: Check seeded localStorage FIRST (synchronous, no bridge needed) ──
  const seededToken = getBearerTokenFromSessionBridge();
  if (seededToken) {
    persistResolvedBearerToken(seededToken);
    setLastTokenSource('localStorage[' + LAST_SESSION_BRIDGE_SOURCE + ']');
    updateAuthBadge(true, LAST_TOKEN_SOURCE);
    log('Startup auth: ✅ Token found in seeded localStorage key="' + LAST_SESSION_BRIDGE_SOURCE + '" (' + seededToken.substring(0, 8) + '...)', 'success');
    loadWorkspacesOnStartup();
  } else {
    // ── No seeded token — fall through to async bridge waterfall ──
    log('Startup auth: No seeded token in localStorage — trying extension bridge waterfall...', 'check');
    log('Startup auth: Checked localStorage keys: [' + SESSION_BRIDGE_KEYS.join(', ') + '] + sb-*-auth-token scan', 'info');

    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      if (token) {
        setLastTokenSource(source || LAST_TOKEN_SOURCE || 'bridge');
        log('Startup auth: ✅ Token resolved from ' + LAST_TOKEN_SOURCE + ' (' + token.substring(0, 8) + '...)', 'success');
        updateAuthBadge(true, LAST_TOKEN_SOURCE);
      } else {
        log('Startup auth: ❌ NO TOKEN AVAILABLE from any source', 'error');
        log('Startup auth: Waterfall: localStorage keys → Supabase scan → extension bridge (GET_TOKEN → REFRESH_TOKEN) → document.cookie', 'error');
        log('Startup auth: Please ensure you are logged in to the platform.', 'error');
        updateAuthBadge(false, 'none');
        showToast('⚠️ No auth token found — workspaces may fail to load.', 'warn');
      }

      loadWorkspacesOnStartup();
    });
  }

  // Auth auto-resync on focus/visibility
  setupAutoAuthResync();

  // SPA persistence observer
  setupPersistenceObserver(deps.createUI);

  // Global error handlers
  setupGlobalErrorHandlers();

  log('Initialization started — waiting for workspace data before rendering UI', 'success');

  // XPathUtils integration
  if (deps.hasXPathUtils) {
    log('XPathUtils v' + window.XPathUtils.version + ' available — use XPathUtils.findByXPath(), XPathUtils.clickByXPath(), etc.', 'success');
  } else {
    log('XPathUtils NOT found — XPath console helpers unavailable. Inject xpath-utils.js first.', 'warn');
  }

  // Diagnostic function
  setupDiagnosticDump();

  // V2 Phase 02: Initialize MacroController singleton and register managers
  const mc = MacroController.getInstance();
  mc.registerAuth(new AuthManager());
  mc.registerCredits(new CreditManager());
  mc.registerWorkspaces(new WorkspaceManager());
  mc.registerLoop(new LoopEngine());
  const uiMgr = new UIManager();
  uiMgr.setCreateFn(deps.createUI);
  mc.registerUI(uiMgr);
  installWindowFacade();
  initNamespace();
  dualWrite('__mc', 'api.mc', mc);
  log('[MacroController] Singleton accessible via RiseupAsiaMacroExt.Projects.MacroController.api.mc', 'sub');

  log('Console API: RiseupAsiaMacroExt.Projects.MacroController.api.loop.start("up"|"down")');
  log('Console API: ...api.loop.stop(), ...api.loop.check(), ...api.loop.diagnostics()');
  log('Keyboard: Ctrl+Alt+Up/Down to toggle loop, Ctrl+Up/Down to force move, Ctrl+Alt+H to show/hide');
}

// ============================================
// Auth auto-resync on focus/visibility
// ============================================
function setupAutoAuthResync(): void {
  let authResyncInFlight = false;
  let authResyncLastAt = 0;

  function tryAutoAuthResync(trigger: string) {
    const badge = document.getElementById('loop-auth-badge');
    if (badge && badge.textContent === '🟢') return;

    const now = Date.now();
    if (authResyncInFlight) return;
    if (now - authResyncLastAt < 3000) return;
    authResyncLastAt = now;
    authResyncInFlight = true;

    log('Auth auto-resync (' + trigger + '): checking bridge for restored session...', 'check');

    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      authResyncInFlight = false;

      if (!token) {
        log('Auth auto-resync (' + trigger + '): no token yet (user may still be logged out)', 'warn');
        updateAuthBadge(false, 'none');
        return;
      }

      setLastTokenSource(source || LAST_TOKEN_SOURCE || 'bridge');
      updateAuthBadge(true, LAST_TOKEN_SOURCE);
      log('Auth auto-resync (' + trigger + '): ✅ token restored from ' + LAST_TOKEN_SOURCE, 'success');

      if (state.running) return;

      fetchLoopCreditsAsync(false)
        .then(function() {
          return autoDetectLoopCurrentWorkspace(token);
        })
        .then(function() {
          syncCreditStateFromApi();
          updateUI();
          log('Auth auto-resync (' + trigger + '): workspace/credit UI refreshed', 'success');
        })
        .catch(function(err: Error) {
          log('Auth auto-resync (' + trigger + '): UI refresh failed: ' + (err && err.message ? err.message : String(err)), 'warn');
        });
    });
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      tryAutoAuthResync('visibilitychange');
    }
  });

  window.addEventListener('focus', function() {
    tryAutoAuthResync('window-focus');
  });
}

// ============================================
// SPA persistence observer
// ============================================
function setupPersistenceObserver(createUI: () => void): void {
  let reinjectDebounce: ReturnType<typeof setTimeout> | null = null;
  const REINJECT_DELAY_MS = 500;

  function tryReinject() {
    if (nsRead('__loopDestroyed', '_internal.destroyed')) {
      log('Panel was destroyed by user — skipping re-injection', 'info');
      return;
    }
    const hasMarker = !!document.getElementById(IDS.SCRIPT_MARKER);
    const hasContainer = !!document.getElementById(IDS.CONTAINER);

    if (!hasMarker) {
      log('Marker removed by SPA navigation, re-placing', 'warn');
      const newMarker = document.createElement('div');
      newMarker.id = IDS.SCRIPT_MARKER;
      newMarker.style.display = 'none';
      newMarker.setAttribute('data-version', VERSION);
      document.body.appendChild(newMarker);
    }

    if (!hasContainer) {
      log('UI container removed by SPA navigation, re-creating', 'warn');
      createUI();
    }
  }

  const observer = new MutationObserver(function(mutations: MutationRecord[]) {
    let hasRemovals = false;
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].removedNodes.length > 0) {
        hasRemovals = true;
        break;
      }
    }
    if (!hasRemovals) return;

    const markerGone = !document.getElementById(IDS.SCRIPT_MARKER);
    const containerGone = !document.getElementById(IDS.CONTAINER);

    if (markerGone || containerGone) {
      if (reinjectDebounce) clearTimeout(reinjectDebounce);
      reinjectDebounce = setTimeout(function() {
        log('SPA navigation detected - checking UI state', 'check');
        tryReinject();
      }, REINJECT_DELAY_MS);
    }
  });

  const observeTarget = document.querySelector('main') || document.querySelector('#root') || document.body;
  observer.observe(observeTarget, { childList: true, subtree: true });
  log('MutationObserver installed on ' + (observeTarget === document.body ? 'document.body' : observeTarget.tagName + (observeTarget.id ? '#' + observeTarget.id : '')) + ' for UI persistence', 'success');
}

// ============================================
// Global error handlers
// ============================================
function setupGlobalErrorHandlers(): void {
  window.addEventListener('error', function(event: ErrorEvent) {
    if (!event || !event.message) return;
    if (event.filename && event.filename.indexOf('macro') === -1 && event.filename.indexOf('blob:') === -1) return;
    const errMsg = event.message || 'Unknown error';
    const stack = event.error && event.error.stack ? event.error.stack : (event.filename + ':' + event.lineno);
    log('[GlobalErrorHandler] Uncaught: ' + errMsg, 'error');
    if (state.running) {
      stopLoop();
    }
    showToast('Uncaught error: ' + errMsg, 'error', { stack: stack, noStop: true });
  });

  window.addEventListener('unhandledrejection', function(event: PromiseRejectionEvent) {
    if (!event || !event.reason) return;
    const errMsg = event.reason.message || String(event.reason);
    const stack = event.reason.stack || '';
    log('[GlobalErrorHandler] Unhandled promise rejection: ' + errMsg, 'error');
    if (state.running) {
      stopLoop();
    }
    showToast('Unhandled rejection: ' + errMsg, 'error', { stack: stack, noStop: true });
  });
}

// ============================================
// Diagnostic dump
// ============================================
function setupDiagnosticDump(): void {
  const diagFn = function() {
    const diag: Record<string, any> = {
      version: VERSION,
      workspaceName: state.workspaceName,
      workspaceFromApi: state.workspaceFromApi,
      currentWsName: loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '(null)',
      currentWsId: loopCreditState.currentWs ? loopCreditState.currentWs.id : '(null)',
      wsCount: (loopCreditState.perWorkspace || []).length,
      wsByIdKeys: Object.keys(loopCreditState.wsById || {}),
      projectId: extractProjectIdFromUrl(),
      lastCheckedAt: loopCreditState.lastCheckedAt ? new Date(loopCreditState.lastCheckedAt).toLocaleTimeString() : '(never)',
      source: loopCreditState.source
    };
    log('=== DIAGNOSTIC DUMP ===', 'warn');
    for (const k in diag) {
      const val = Array.isArray(diag[k]) ? '[' + diag[k].join(', ') + ']' : String(diag[k]);
      log('  ' + k + ': ' + val, 'check');
    }
    const perWs = loopCreditState.perWorkspace || [];
    for (let i = 0; i < perWs.length; i++) {
      log('  ws[' + i + ']: id=' + perWs[i].id + ' name="' + perWs[i].fullName + '"', 'check');
    }
    return diag;
  };
  dualWrite('__loopDiag', 'api.loop.diagnostics', diagFn);
}
