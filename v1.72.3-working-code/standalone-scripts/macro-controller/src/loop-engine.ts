/**
 * MacroLoop Controller — Loop Engine
 *
 * Extracted from macro-looping.ts IIFE (Step 2, registry pattern).
 * Contains: startLoop, stopLoop, runCycle, runCycleDomFallback,
 *   performDirectMove, forceSwitch, delegateComplete, dispatchDelegateSignal,
 *   runCheck, refreshStatus, startStatusRefresh, stopStatusRefresh.
 * Uses MacroController singleton for cross-module calls.
 */

import { log, logSub } from './logging';
import { nsCall, nsRead } from './api-namespace';
import {
  resolveToken, refreshBearerTokenFromBestSource, markBearerTokenExpired,
  invalidateSessionBridgeKey, recoverAuthOnce, LAST_TOKEN_SOURCE,
} from './auth';
import { showToast, setStopLoopCallback } from './toast';
import {
  CREDIT_API_BASE, CONFIG, TIMING, IDS, state, loopCreditState,
} from './shared-state';
import { getByXPath, findElement, ML_ELEMENTS } from './xpath-utils';
import {
  isOnProjectPage, isUserTypingInPrompt, checkSystemBusy,
  highlightElement, ensureProjectDialogOpen, closeProjectDialog, pollForDialogReady,
} from './dom-helpers';
import {
  autoDetectLoopCurrentWorkspace, detectWorkspaceViaProjectDialog, closeProjectDialogSafe,
} from './workspace-detection';
import { parseLoopApiResponse, fetchLoopCreditsAsync, syncCreditStateFromApi } from './credit-fetch';

import { MacroController } from './core/MacroController';

/** Shorthand for MacroController singleton (runtime access, no circular dep) */
function mc() { return MacroController.getInstance(); }

// ============================================
// Manual check (runCheck)
// Spec: spec/12-chrome-extension/60-check-button-spec.md
// Issue: spec/02-app-issues/check-button/08-workspace-detection-race.md
// Runtime parity: spec/02-app-issues/check-button/10-runtime-seed-drift.md
//
// FLOW — Exactly 3 steps:
//   Step 1: Click Project Button XPath → open dialog
//   Step 2: Read Workspace Name from WORKSPACE_XPATH → update state.workspaceName
//   Step 3: Check PROGRESS_XPATH → update state.isIdle / state.hasFreeCredit
//   Always: state.workspaceFromApi = false (manual Check is XPath-authoritative)
//   Always: syncCreditStateFromApi() + updateUI() at end
//   After logic changes: run `npm run build:macro-controller` to sync 01-macro-looping.js
//
// NEVER call mark-viewed API or autoDetectLoopCurrentWorkspace from here.
// ============================================
export function runCheck(): Promise<void> | undefined {
  log('=== MANUAL CHECK START ===', 'check');
  log('Spec: spec/12-chrome-extension/60-check-button-spec.md', 'check');

  const statusEl = document.getElementById(IDS.STATUS);
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Checking...';
  }

  // Preserve previous workspace as fallback (never clear before detection)
  const previousWsName = state.workspaceName || '';
  const previousCurrentWs = loopCreditState.currentWs;

  // CRITICAL: Manual Check is XPath-authoritative.
  // Clear workspaceFromApi at START and END to prevent race with credit-fetch callback.
  // Set isManualCheck to block autoDetectLoopCurrentWorkspace from overriding.
  // See: spec/02-app-issues/check-button/08-workspace-detection-race.md (RCA-1, RCA-3)
  state.workspaceFromApi = false;
  state.isManualCheck = true;

  function normalizeWorkspaceName(name: string): string {
    return (name || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findExactWorkspaceMatch(name: string, wsList: any[]): any | null {
    const normalized = normalizeWorkspaceName(name);
    if (!normalized || !wsList || wsList.length === 0) return null;
    for (let i = 0; i < wsList.length; i++) {
      const wsName = (wsList[i].fullName || wsList[i].name || '') as string;
      if (normalizeWorkspaceName(wsName) === normalized) return wsList[i];
    }
    return null;
  }

  function restoreOnFailure(wsList?: any[]) {
    if (!state.workspaceName && previousWsName) {
      state.workspaceName = previousWsName;
      loopCreditState.currentWs = previousCurrentWs;
      log('Restored previous workspace (detection failed): ' + previousWsName, 'warn');
      return;
    }

    if (state.workspaceName && previousWsName && wsList && wsList.length > 0 && !findExactWorkspaceMatch(state.workspaceName, wsList)) {
      state.workspaceName = previousWsName;
      loopCreditState.currentWs = previousCurrentWs;
      log('Restored previous workspace (detected name was not an exact known workspace): ' + previousWsName, 'warn');
    }
  }

  let perWs = loopCreditState.perWorkspace || [];

  // Sync loopCreditState.currentWs from state.workspaceName after detection
  function syncCurrentWsFromName(wsList: any[]): void {
    if (!state.workspaceName || !wsList || wsList.length === 0) return;
    const matched = findExactWorkspaceMatch(state.workspaceName, wsList);
    if (matched) {
      loopCreditState.currentWs = matched;
    }
  }

  // Step 1+2: Open Project Dialog, read Workspace Name via XPath
  // keepDialogOpen=true so Step 3 can read the Progress Bar (which is inside the dialog DOM)
  // See: spec/02-app-issues/check-button/09-dialog-close-before-progress-read.md
  function doXPathDetect(wsList: any) {
    log('Step 1: Clicking Project Button → opening dialog...', 'check');
    log('  XPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 'check');
    return detectWorkspaceViaProjectDialog('runCheck', wsList, true).then(function(dialogBtn: Element | null) {
      restoreOnFailure(wsList);
      syncCurrentWsFromName(wsList);

      if (state.workspaceName) {
        log('Step 2: ✅ Workspace detected = "' + state.workspaceName + '"', 'success');
      } else {
        log('Step 2: ❌ No workspace matched from XPath = ' + CONFIG.WORKSPACE_XPATH, 'error');
      }
      // Reaffirm: XPath is authoritative, never let API override after manual Check
      state.workspaceFromApi = false;

      // Return the dialog button so Step 3 can close it after reading the progress bar
      return dialogBtn;
    });
  }

  // Issue 84 Fix 3: Always attempt credit fetch when perWs is empty before XPath detection.
  // Previously, if credits hadn't loaded yet, runCheck would detect via XPath with an empty
  // workspace list, causing all name matching to fail silently.
  let detectPromise;
  if (perWs.length > 0) {
    detectPromise = doXPathDetect(perWs);
  } else {
    log('No workspaces loaded — fetching credits first, then detecting via XPath...', 'warn');
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Fetching workspaces...';
    }
    detectPromise = fetchLoopCreditsAsync().then(function() {
      const freshPerWs = loopCreditState.perWorkspace || [];
      if (freshPerWs.length === 0) {
        log('Credit fetch returned 0 workspaces — will try raw XPath text as workspace name', 'warn');
      }
      return doXPathDetect(freshPerWs);
    }).catch(function(err: Error) {
      log('Credit fetch failed: ' + err.message + ' — detecting via XPath without workspace list', 'warn');
      return doXPathDetect([]);
    });
  }

  return detectPromise
    .catch(function(err: Error) {
      restoreOnFailure();
      log('Detection failed: ' + (err && err.message ? err.message : String(err)), 'error');
      throw err;
    })
    .then(function(dialogBtn: Element | null) {
      // Step 3: Check Progress Bar WHILE DIALOG IS STILL OPEN
      // The progress bar XPath is inside the dialog DOM (div[6]).
      // If we close the dialog first, the element disappears.
      // See: spec/02-app-issues/check-button/09-dialog-close-before-progress-read.md
      return new Promise<void>(function(resolve) {
        setTimeout(function() {
          log('Step 3: Checking Progress Bar (credit status) — dialog still open...', 'check');
          log('  XPath: ' + CONFIG.PROGRESS_XPATH + ' (+ fallbacks)', 'check');
          const progressEl = findElement(ML_ELEMENTS.PROGRESS);

          if (progressEl) {
            log('  Progress Bar FOUND → System is BUSY (has free credit)', 'warn');
            highlightElement(progressEl as HTMLElement, '#fbbf24');
            state.isIdle = false;
            state.hasFreeCredit = true;
          } else {
            log('  Progress Bar NOT FOUND → System is IDLE (no free credit)', 'success');
            state.isIdle = true;
            state.hasFreeCredit = false;
          }

          // NOW close the dialog — after both Step 2 and Step 3 are done
          if (dialogBtn) {
            log('  Closing project dialog after Step 3...', 'check');
            closeProjectDialogSafe(dialogBtn);
          }

          // Always sync credit numbers and update UI — regardless of loop state
          syncCreditStateFromApi();
          // Reaffirm: never let API flag survive a manual Check
          state.workspaceFromApi = false;
          state.isManualCheck = false;
          mc().ui.update();
          log('=== MANUAL CHECK COMPLETE ===', 'check');
          resolve();
        }, 100);
      });
    })
    .catch(function(finalErr: Error) {
      // Ensure flags are always cleaned up even on unexpected errors
      state.workspaceFromApi = false;
      state.isManualCheck = false;
      mc().ui.update();
      throw finalErr;
    });
}

// ============================================
// DEPRECATED: Signal AHK via Clipboard
// ============================================
export function dispatchDelegateSignal(direction: string): void {
  const signal = direction === 'up' ? 'DELEGATE_UP' : 'DELEGATE_DOWN';
  const currentUrl = window.location.href;
  const titleMarker = '__AHK_' + signal + '__URL:' + currentUrl + '__ENDURL__';
  const cleanTitle = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
  document.title = titleMarker + cleanTitle;
  log('DEPRECATED: Title signal set: ' + titleMarker, 'delegate');
  try {
    navigator.clipboard.writeText(signal).catch(function() {});
  } catch(e) { /* ignore */ }
}

// ============================================
// performDirectMove — Direct API move
// ============================================
export function performDirectMove(direction: string): void {
  log('=== DIRECT API MOVE ' + direction.toUpperCase() + ' ===', 'delegate');
  logSub('v7.9.6: Using moveToAdjacentWorkspace() — no AHK delegation', 1);
  state.isDelegating = true;
  state.forceDirection = direction;
  state.delegateStartTime = Date.now();
  mc().ui.update();

  try {
    mc().workspaces.moveAdjacent(direction);
    setTimeout(function() {
      state.isDelegating = false;
      state.forceDirection = null;
      state.delegateStartTime = 0;
      state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
      log('Direct API move complete (' + direction.toUpperCase() + ')', 'success');
      mc().credits.fetch(false);
      mc().ui.update();
    }, 3000);
  } catch(err) {
    log('Direct API move FAILED: ' + (err as Error).message, 'error');
    state.isDelegating = false;
    state.forceDirection = null;
    state.delegateStartTime = 0;
    mc().ui.update();
  }
}

// ============================================
// startLoop
// ============================================
export function startLoop(direction: string): boolean {
  if (state.running) {
    log('Cannot start - loop is already running', 'warn');
    return false;
  }

  if (!isOnProjectPage()) {
    log('Cannot start - must be on a supported project/preview page (not settings)', 'error');
    return false;
  }

  state.direction = direction || 'down';
  state.cycleCount = 0;
  state.isIdle = true;
  state.isDelegating = false;
  (state as Record<string, any>).__cycleInFlight = false;
  (state as Record<string, any>).__cycleRetryPending = false;
  state.running = true;
  state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  nsCall('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', true);

  log('=== LOOP STARTING ===', 'success');
  log('Direction: ' + state.direction.toUpperCase(), 'success');
  log('Interval: ' + (TIMING.LOOP_INTERVAL/1000) + 's');
  log('Project Button XPath: ' + CONFIG.PROJECT_BUTTON_XPATH);
  log('Progress XPath: ' + CONFIG.PROGRESS_XPATH);

  log('Step 0: Confirming controller injection at CONTROLS_XPATH...', 'check');
  log('  CONTROLS_XPATH: ' + CONFIG.CONTROLS_XPATH, 'check');

  let marker = document.getElementById(IDS.SCRIPT_MARKER);
  const uiContainer = document.getElementById(IDS.CONTAINER);
  const xpathTarget = getByXPath(CONFIG.CONTROLS_XPATH);

  const loopStartFn = nsRead('__loopStart', 'api.loop.start');
  if (!marker || typeof loopStartFn !== 'function') {
    log('❌ Controller script NOT injected (marker=' + !!marker + ', __loopStart=' + (typeof loopStartFn) + ') — aborting', 'error');
    state.running = false;
    nsCall('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', false);
    return false;
  }

  if (!uiContainer) {
    log('❌ Controller UI container NOT found in DOM (id=' + IDS.CONTAINER + ') — aborting', 'error');
    state.running = false;
    nsCall('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', false);
    return false;
  }

  if (xpathTarget && xpathTarget.contains(uiContainer)) {
    log('Step 0: ✅ Controller confirmed at CONTROLS_XPATH', 'success');
  } else if (xpathTarget) {
    log('Step 0: ⚠️ Controller exists but NOT inside CONTROLS_XPATH (body fallback?) — proceeding with warning', 'warn');
  } else {
    log('Step 0: ⚠️ CONTROLS_XPATH element not found — controller may be in fallback position', 'warn');
  }

  mc().ui.update();

  log('Step 1: Resolving auth token before workspace check...', 'check');

  refreshBearerTokenFromBestSource(function(authToken: string, authSource: string) {
    if (authToken) {
      log('Step 1: ✅ Auth token resolved from ' + authSource, 'success');
    } else {
      log('Step 1: ⚠️ No auth token available — credit checks may fail with 401', 'warn');
      showToast('⚠️ No auth token — credit API may fail. Please ensure you are logged in.', 'warn');
    }

    if (!state.running) {
      log('Loop was stopped during auth resolution — aborting', 'warn');
      return;
    }

    log('Step 2: Running initial workspace check...', 'check');

    let checkPromise;
    try {
      checkPromise = runCheck();
    } catch(e) {
      log('Initial check threw error: ' + (e as Error).message + ' — starting loop anyway', 'warn');
    }

    log('Step 3: Fetching initial credit data...', 'check');
    mc().credits.fetch(false);

    const startTimers = function() {
      if (!state.running) {
        log('Loop was stopped during initial check — not starting timers', 'warn');
        return;
      }

      const cws = loopCreditState.currentWs;
      if (cws) {
        log('Credit state at loop start: workspace="' + cws.fullName + '" dailyFree=' + (cws.dailyFree || 0) + ' available=' + (cws.available || 0), 'check');
      } else {
        log('Credit state at loop start: no workspace detected yet (will detect on first cycle)', 'warn');
      }

      log('=== LOOP STARTED (post-check) ===', 'success');

      state.countdownIntervalId = setInterval(function() {
        if (state.countdown > 0) state.countdown--;
      }, TIMING.COUNTDOWN_INTERVAL);

      state.loopIntervalId = setInterval(runCycle, TIMING.LOOP_INTERVAL);
      setTimeout(runCycle, TIMING.FIRST_CYCLE_DELAY);

      mc().ui.update();
    };

    if (checkPromise && typeof checkPromise.then === 'function') {
      checkPromise.then(function() {
        log('Initial check completed — starting loop timers', 'success');
        startTimers();
      }).catch(function(err: Error) {
        log('Initial check failed: ' + (err && err.message ? err.message : String(err)) + ' — starting loop anyway', 'warn');
        startTimers();
      });
    } else {
      setTimeout(startTimers, 3000);
    }
  });

  return true;
}

// ============================================
// stopLoop
// ============================================
export function stopLoop(): boolean {
  if (!state.running) {
    return false;
  }

  state.running = false;
  state.isDelegating = false;
  state.forceDirection = null;
  (state as Record<string, any>).__cycleInFlight = false;
  (state as Record<string, any>).__cycleRetryPending = false;

  if (state.loopIntervalId) {
    clearInterval(state.loopIntervalId);
    state.loopIntervalId = null;
  }
  if (state.countdownIntervalId) {
    clearInterval(state.countdownIntervalId);
    state.countdownIntervalId = null;
  }

  log('=== LOOP STOPPED ===', 'success');
  log('Total cycles completed: ' + state.cycleCount);
  nsCall('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', false);
  mc().ui.update();
  return true;
}

// ============================================
// runCycle — API-based credit check
// ============================================
export function runCycle(): void {
  const cycleFlags = state as Record<string, any>;

  if (!state.running) {
    cycleFlags.__cycleInFlight = false;
    cycleFlags.__cycleRetryPending = false;
    log('SKIP: Loop not running', 'skip');
    return;
  }

  if (cycleFlags.__cycleRetryPending) {
    log('SKIP: Retry already scheduled — waiting', 'skip');
    return;
  }

  if (cycleFlags.__cycleInFlight) {
    log('SKIP: Previous cycle still in flight', 'skip');
    return;
  }

  cycleFlags.__cycleInFlight = true;

  function releaseCycleLock() {
    if (cycleFlags.__cycleRetryPending) return;
    cycleFlags.__cycleInFlight = false;
  }

  if (state.isDelegating) {
    const elapsed = state.delegateStartTime ? (Date.now() - state.delegateStartTime) / 1000 : 0;
    if (elapsed > 60) {
      log('Move timeout after ' + Math.floor(elapsed) + 's - auto-recovering', 'warn');
      state.isDelegating = false;
      state.forceDirection = null;
      state.delegateStartTime = 0;
      mc().ui.update();
    } else {
      releaseCycleLock();
      log('SKIP: Waiting for API move (' + Math.floor(elapsed) + 's)', 'skip');
      return;
    }
  }

  state.cycleCount++;
  state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  log('--- Cycle #' + state.cycleCount + ' ---');

  if (isUserTypingInPrompt()) {
    releaseCycleLock();
    log('SKIP: User is typing in prompt area', 'skip');
    return;
  }

  log('Step 1: Fetching credit data via API...', 'check');

  let cycleIsRetry = false;

  function doCycleFetch() {
    const url = CREDIT_API_BASE + '/user/workspaces';
    const headers: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    const token = resolveToken();

    if (!token) {
      log('Cycle: No token — attempting recovery before API call...', 'warn');
      recoverAuthOnce().then(function(recoveredToken: string) {
        if (recoveredToken) {
          log('Cycle: Recovered token — proceeding with API call', 'success');
        } else {
          log('Cycle: No token from any source — API call will likely fail with 401', 'warn');
        }
        doCycleFetchWithToken();
      }).catch(function(err: Error) {
        log('Cycle: Auth recovery failed before API call: ' + err.message, 'error');
        releaseCycleLock();
      });
      return;
    }

    doCycleFetchWithToken();

    function doCycleFetchWithToken() {
      const freshToken = resolveToken();
      if (freshToken) {
        headers['Authorization'] = 'Bearer ' + freshToken;
      }

      log('Cycle API: GET ' + url + (cycleIsRetry ? ' (RETRY after recovery)' : ''), 'check');
      logSub('Auth: ' + (freshToken ? 'Bearer ' + freshToken.substring(0, 12) + '...REDACTED' : 'NO TOKEN (cookies only)'), 1);
      logSub('Token source: ' + LAST_TOKEN_SOURCE, 1);

      fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
        .then(function(resp: Response) {
          const respContentType = resp.headers.get('content-type') || '(none)';
          const respContentLength = resp.headers.get('content-length') || '(not set)';
          log('Cycle API: Response status=' + resp.status + ' content-type="' + respContentType + '" content-length=' + respContentLength, 'check');

          // v7.39: On 401/403, use recoverAuthOnce (single retry, no recursion)
          // See: spec/02-app-issues/authentication-freeze-and-retry-loop.md (RCA-1, RCA-2)
          if ((resp.status === 401 || resp.status === 403) && !cycleIsRetry) {
            if (freshToken) {
              markBearerTokenExpired('loop-cycle');
              invalidateSessionBridgeKey(freshToken);
            }
            log('Cycle: Auth ' + resp.status + ' — recovering session...', 'warn');
            showToast('Auth ' + resp.status + ' — recovering session...', 'warn', { noStop: true });
            cycleIsRetry = true;
            cycleFlags.__cycleRetryPending = true;

            // Delay 2.5s then recover and retry once
            setTimeout(function() {
              cycleFlags.__cycleRetryPending = false;
              recoverAuthOnce().then(function(newToken: string) {
                if (newToken) {
                  log('Cycle: Recovery successful — retrying API call once', 'success');
                  doCycleFetchWithToken();
                } else {
                  log('Cycle: Recovery failed — skipping this cycle', 'error');
                  showToast('Auth recovery failed — will retry next cycle', 'warn', { noStop: true });
                  releaseCycleLock();
                }
              }).catch(function(err: Error) {
                log('Cycle: Recovery error — ' + err.message, 'error');
                releaseCycleLock();
              });
            }, 2500);
            return;
          }

          if ((resp.status === 401 || resp.status === 403) && freshToken) {
            markBearerTokenExpired('loop-cycle');
          }

          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.text().then(function(bodyText: string) {
            log('Cycle API: Body length=' + bodyText.length + ' preview="' + bodyText.substring(0, 200) + '"', 'check');
            return JSON.parse(bodyText);
          });
        })
        .then(function(data: any) {
          if (!data) return;

          if (state.retryCount > 0) {
            log('Retry recovery: API succeeded after ' + state.retryCount + ' previous failure(s)', 'success');
            showToast('Recovered after ' + state.retryCount + ' retry(ies)', 'success');
          }
          state.retryCount = 0;
          state.lastRetryError = null;

          if (!state.running || state.isDelegating) {
            log('SKIP: State changed during API fetch', 'skip');
            return;
          }

          const ok = parseLoopApiResponse(data);
          if (!ok) {
            log('Cycle aborted: API response parse failed', 'error');
            return;
          }

          state.workspaceFromApi = false;

          const cycleToken = resolveToken();
          return autoDetectLoopCurrentWorkspace(cycleToken).then(function() {
            if (!state.running || state.isDelegating) {
              log('SKIP: State changed during workspace detection', 'skip');
              return;
            }

            syncCreditStateFromApi();
            mc().ui.update();

            const cws = loopCreditState.currentWs;
            const dailyFree = cws ? (cws.dailyFree || 0) : 0;

            if (dailyFree > 0) {
              log('✅ Daily free credits available (' + dailyFree + ') — NO move needed', 'success');
              return;
            }

            log('Step 3: No credits on first check — double-confirming via API...', 'warn');

            setTimeout(function() {
              if (!state.running || state.isDelegating) {
                log('SKIP: State changed during double-confirm wait', 'skip');
                return;
              }

              const confirmHeaders: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
              const confirmToken = resolveToken();
              if (confirmToken) confirmHeaders['Authorization'] = 'Bearer ' + confirmToken;

              fetch(url, { method: 'GET', headers: confirmHeaders, credentials: 'include' })
                .then(function(resp2: Response) {
                  if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
                  return resp2.json();
                })
                .then(function(data2: any) {
                  if (!state.running || state.isDelegating) {
                    log('SKIP: State changed during double-confirm fetch', 'skip');
                    return;
                  }

                  parseLoopApiResponse(data2);
                  state.workspaceFromApi = false;
                  return autoDetectLoopCurrentWorkspace(confirmToken).then(function() {
                    syncCreditStateFromApi();
                    mc().ui.update();

                    const cws2 = loopCreditState.currentWs;
                    const dailyFree2 = cws2 ? (cws2.dailyFree || 0) : 0;

                    if (dailyFree2 > 0) {
                      log('DOUBLE-CONFIRM: Daily free credits found on re-check (' + dailyFree2 + ')! No move needed.', 'success');
                      return;
                    }

                    log('CONFIRMED: No daily free credits after double-check (dailyFree=' + dailyFree2 + ', available=' + (cws2 ? cws2.available : 0) + ') — moving via API', 'delegate');
                    logSub('Direction: ' + state.direction.toUpperCase() + ', Workspace: ' + (cws2 ? cws2.fullName : 'unknown'), 1);
                    performDirectMove(state.direction);
                  });
                })
                .catch(function(err: Error) {
                  log('Double-confirm API fetch failed: ' + err.message, 'error');
                });
            }, 2000);
          });
        })
        .catch(function(err: Error) {
          state.retryCount++;
          const canRetry = state.retryCount <= state.maxRetries;

          if (canRetry) {
            const backoff = state.retryBackoffMs * Math.pow(2, state.retryCount - 1);
            showToast('Cycle failed: ' + err.message + ' — retrying in ' + (backoff / 1000) + 's (attempt ' + state.retryCount + '/' + state.maxRetries + ')', 'warn');
            log('Cycle API fetch failed (attempt ' + state.retryCount + '/' + state.maxRetries + '): ' + err.message + ' — retrying in ' + backoff + 'ms', 'warn');
            logSub('URL: ' + url, 1);
            logSub('Token: ' + (freshToken ? freshToken.substring(0, 12) + '...REDACTED' : 'NONE'), 1);
            logSub('Token source: ' + LAST_TOKEN_SOURCE, 1);

            cycleFlags.__cycleRetryPending = true;
            setTimeout(function() {
              cycleFlags.__cycleRetryPending = false;
              cycleFlags.__cycleInFlight = false;
              if (state.running) {
                log('Retry #' + state.retryCount + ' — re-running cycle...', 'check');
                runCycle();
              }
            }, backoff);
            return;
          }

          state.lastRetryError = err.message;
          showToast('Cycle failed after ' + state.maxRetries + ' retries: ' + err.message + '. Loop stopped.', 'error', { stack: err.stack, noStop: true });
          log('Cycle API fetch failed after ' + state.maxRetries + ' retries: ' + err.message + ' — stopping loop', 'error');
          logSub('Last URL: ' + url, 1);
          logSub('Last token source: ' + LAST_TOKEN_SOURCE, 1);
          stopLoop();
          runCycleDomFallback();
        })
        .finally(function() {
          releaseCycleLock();
        });
    }
  }

  doCycleFetch();
}

// ============================================
// DEPRECATED: DOM-based cycle fallback
// ============================================
export function runCycleDomFallback(): void {
  log('DOM Fallback: Opening project dialog for progress bar check...', 'warn');

  if (isUserTypingInPrompt()) {
    log('SKIP: User is typing — cannot open dialog', 'skip');
    return;
  }

  const clicked = ensureProjectDialogOpen();
  if (!clicked) {
    log('DOM Fallback: project button not found', 'error');
    return;
  }

  pollForDialogReady(function() {
    if (!state.running || state.isDelegating) {
      closeProjectDialog();
      return;
    }

    mc().workspaces.fetchName();
    const hasProgressBar = checkSystemBusy();
    state.isIdle = !hasProgressBar;
    state.hasFreeCredit = hasProgressBar;
    state.lastStatusCheck = Date.now();
    closeProjectDialog();

    if (hasProgressBar) {
      log('DOM Fallback: Free credit found — NO move needed', 'success');
      mc().ui.update();
      return;
    }

    log('DOM Fallback: No credit — moving via API', 'delegate');
    performDirectMove(state.direction);
  });
}

// ============================================
// forceSwitch — Immediate move without waiting
// ============================================
export function forceSwitch(direction: string): void {
  if (state.isDelegating) {
    log('BLOCKED: Already moving, ignoring force ' + direction.toUpperCase(), 'warn');
    return;
  }
  log('=== FORCE ' + direction.toUpperCase() + ' ===', 'delegate');
  logSub('v7.9.6: Direct API move — no AHK delegation', 1);
  performDirectMove(direction);
}

// ============================================
// DEPRECATED: delegateComplete
// ============================================
export function delegateComplete(): void {
  log('DEPRECATED: delegateComplete called (v7.9.6 uses performDirectMove)', 'warn');
  state.isDelegating = false;
  state.forceDirection = null;
  state.delegateStartTime = 0;
  document.title = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
  state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  mc().ui.update();
}

// ============================================
// refreshStatus — Workspace auto-check (when loop is stopped)
// ============================================
export function refreshStatus(): void {
  // Issue 82 fix: NEVER open project dialog when loop is stopped.
  // Dialog interaction when stopped is only permitted via explicit user actions (Check, Credits).
  // See: spec/02-app-issues/82-project-dialog-auto-click-when-stopped.md
  if (!state.running) {
    // Passive-only check: read workspace name from nav, update UI, no dialog
    const gotNavName = mc().workspaces.fetchNameFromNav();
    if (gotNavName) {
      logSub('Workspace name updated from nav (passive, loop stopped)', 1);
    }
    // Issue 84 Fix 4: If no workspace name yet and no credits loaded,
    // trigger a background credit fetch to populate the workspace list.
    // This ensures passive refreshStatus eventually resolves the workspace.
    if (!state.workspaceName && (!loopCreditState.perWorkspace || loopCreditState.perWorkspace.length === 0)) {
      const token = resolveToken();
      if (token) {
        logSub('No workspace + no credits — triggering background credit fetch', 1);
        fetchLoopCreditsAsync(false).then(function() {
          syncCreditStateFromApi();
          mc().ui.update();
        }).catch(function() { /* ignore */ });
      }
    }
    mc().ui.update();
    return;
  }

  if (isUserTypingInPrompt()) {
    log('Workspace auto-check: user is typing in prompt — skipping', 'skip');
    return;
  }

  const gotNavName = mc().workspaces.fetchNameFromNav();
  if (gotNavName) {
    logSub('Workspace name updated from nav — skipping dialog open for name', 1);
  }

  logSub('Workspace auto-check: opening dialog for credit check...', 1);
  const opened = ensureProjectDialogOpen();
  if (!opened) {
    logSub('Workspace auto-check: could not open project dialog', 1);
    mc().ui.update();
    return;
  }

  pollForDialogReady(function() {
    if (!gotNavName) {
      const oldName = state.workspaceName;
      mc().workspaces.fetchName();
      const nameChanged = oldName && state.workspaceName && oldName !== state.workspaceName;
      if (nameChanged) {
        log('Workspace changed during auto-check: "' + oldName + '" -> "' + state.workspaceName + '"', 'success');
      }
    }

    logSub('Checking credit status (dialog already open)', 1);
    const hasCredit = checkSystemBusy();
    state.hasFreeCredit = hasCredit;
    state.isIdle = !hasCredit;
    state.lastStatusCheck = Date.now();

    closeProjectDialog();
    mc().ui.update();
  });
}

export function startStatusRefresh(): void {
  if (state.statusRefreshId) return;
  const intervalMs = state.running ? (TIMING.WS_CHECK_INTERVAL || 5000) : 30000;
  log('Starting workspace auto-check (every ' + (intervalMs/1000) + 's)', 'success');
  state.statusRefreshId = setInterval(refreshStatus, intervalMs);
  setTimeout(refreshStatus, 1000);
}

export function stopStatusRefresh(): void {
  if (state.statusRefreshId) {
    clearInterval(state.statusRefreshId);
    state.statusRefreshId = null;
    log('Workspace auto-check stopped', 'warn');
  }
}

// Wire toast stop callback
setStopLoopCallback(stopLoop);
