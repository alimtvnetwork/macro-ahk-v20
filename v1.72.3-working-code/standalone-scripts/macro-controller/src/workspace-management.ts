/**
 * Workspace Management — Move & Session Verification
 *
 * Extracted from macro-looping.ts (Step 05c).
 * Functions: moveToWorkspace, moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached,
 *   updateLoopMoveStatus, verifyWorkspaceSessionAfterFailure
 *
 * Uses MacroController singleton for cross-module calls.
 */


import { MacroController } from './core/MacroController';

function mc() { return MacroController.getInstance(); }
import { log, logSub } from './logging';
import { resolveToken, invalidateSessionBridgeKey, recoverAuthOnce } from './auth';
import { parseLoopApiResponse } from './credit-fetch';
import { extractProjectIdFromUrl } from './workspace-detection';
import { showToast } from './toast';
import { CREDIT_API_BASE, loopCreditState, state } from './shared-state';

/**
 * Update the move status indicator element.
 */
export function updateLoopMoveStatus(statusState: string, message: string): void {
  const el = document.getElementById('loop-move-status');
  if (!el) return;
  const colors: Record<string, string> = { loading: '#facc15', success: '#4ade80', error: '#ef4444' };
  el.style.color = colors[statusState] || '#9ca3af';
  el.textContent = message;
  if (statusState === 'success') {
    setTimeout(function () { el.textContent = ''; }, 5000);
  }
}

/**
 * After a move/rename failure, probe /user/workspaces to check session health.
 * Bearer token is required for all workspace APIs.
 */
export function verifyWorkspaceSessionAfterFailure(context: string): void {
  const url = CREDIT_API_BASE + '/user/workspaces';

  function probeWithToken(token: string): void {
    const h: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
    };
    const authLabel = 'Bearer ' + token.substring(0, 12) + '...REDACTED';

    log('[SessionCheck/' + context + '] Probing GET ' + url + ' (auth: ' + authLabel + ')', 'info');

    fetch(url, { method: 'GET', headers: h, credentials: 'include' })
      .then(function (resp: Response) {
        if (resp.ok) {
          return resp.text().then(function (body: string) {
            let data: any;
            try { data = JSON.parse(body); } catch (_e) { data = null; }
            const wsCount = Array.isArray(data) ? data.length : (data && data.workspaces ? data.workspaces.length : '?');
            log('[SessionCheck/' + context + '] ✅ Session valid — ' + wsCount + ' workspaces loaded (auth: ' + authLabel + ')', 'success');
            showToast(context + ' failed but session is valid (' + wsCount + ' workspaces)', 'info');
          });
        }
        log('[SessionCheck/' + context + '] ❌ Session probe failed: HTTP ' + resp.status + ' (auth: ' + authLabel + ')', 'error');
        showToast(context + ' failed — session also broken (HTTP ' + resp.status + '). Re-auth needed.', 'error');
      })
      .catch(function (err: Error) {
        log('[SessionCheck/' + context + '] ❌ Network error: ' + err.message, 'error');
        showToast(context + ' failed — network error on session check', 'error');
      });
  }

  const token = resolveToken();
  if (token) {
    probeWithToken(token);
    return;
  }

  log('[SessionCheck/' + context + '] No bearer token — recovering before probe', 'warn');
  recoverAuthOnce().then(function(recoveredToken: string) {
    const fallbackToken = recoveredToken || resolveToken();
    if (!fallbackToken) {
      log('[SessionCheck/' + context + '] Recovery failed — skipping unauthenticated session probe', 'error');
      showToast(context + ' failed — no bearer token available for session check', 'error', { noStop: true });
      return;
    }
    probeWithToken(fallbackToken);
  }).catch(function() {
    log('[SessionCheck/' + context + '] Recovery error — skipping unauthenticated session probe', 'error');
    showToast(context + ' failed — no bearer token available for session check', 'error', { noStop: true });
  });
}

/**
 * Move current project to a target workspace via API.
 */
export function moveToWorkspace(targetWorkspaceId: string, targetWorkspaceName: string): void {
  const projectId = extractProjectIdFromUrl();
  if (!projectId) {
    log('Cannot extract projectId from URL: ' + window.location.href, 'error');
    updateLoopMoveStatus('error', 'No project ID in URL');
    return;
  }

  function failNoToken(): void {
    log('Move aborted: no bearer token available', 'error');
    updateLoopMoveStatus('error', 'Auth token missing');
    showToast('Cannot move workspace: bearer token is missing. Please re-authenticate.', 'error', { noStop: true });
  }

  function doMove(token: string, isRetry: boolean) {
    if (!token) {
      failNoToken();
      return;
    }

    const url = CREDIT_API_BASE + '/projects/' + projectId + '/move-to-workspace';
    const requestBody = { workspace_id: targetWorkspaceId };
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    };

    const label = isRetry ? ' (auth-retry)' : '';
    log('=== MOVE TO WORKSPACE ===' + label, 'delegate');
    log('PUT ' + url, 'delegate');
    logSub('Target: ' + targetWorkspaceName + ' (id=' + targetWorkspaceId + ')', 1);
    logSub('Auth: Bearer ' + token.substring(0, 12) + '...REDACTED', 1);

    updateLoopMoveStatus('loading', 'Moving to ' + targetWorkspaceName + '...');

    fetch(url, {
      method: 'PUT',
      headers: headers,
      credentials: 'include',
      mode: 'cors',
      body: JSON.stringify(requestBody)
    }).then(function (resp: Response) {
      // v7.25: If 401/403 with bearer token, invalidate current key and retry with next source
      if ((resp.status === 401 || resp.status === 403) && !isRetry) {
        const invalidatedKey = invalidateSessionBridgeKey(token);
        log('Move got ' + resp.status + ' — invalidated "' + invalidatedKey + '", retrying with fallback', 'warn');
        showToast('Move auth ' + resp.status + ' — token "' + invalidatedKey + '" expired, retrying...', 'warn', { noStop: true });
        const fallbackToken = resolveToken();
        if (fallbackToken) {
          doMove(fallbackToken, true);
          return;
        }
        recoverAuthOnce().then(function(recoveredToken: string) {
          const refreshedToken = recoveredToken || resolveToken();
          if (!refreshedToken) {
            failNoToken();
            return;
          }
          doMove(refreshedToken, true);
        }).catch(function() {
          failNoToken();
        });
        return;
      }
      log('Move response: ' + resp.status + ' ' + resp.statusText + label, resp.ok ? 'success' : 'error');
      if (!resp.ok) {
        return resp.text().then(function (body: string) {
          log('Move failed: HTTP ' + resp.status + ' | body: ' + body.substring(0, 500), 'error');
          updateLoopMoveStatus('error', 'HTTP ' + resp.status + ': ' + body.substring(0, 80));
          // v7.25: After move failure, verify workspace loading still works
          log('Move failed — verifying workspace session is still valid...', 'warn');
          verifyWorkspaceSessionAfterFailure('move');
        });
      }
      return resp.text().then(function () {
        log('✅ MOVE SUCCESS -> ' + targetWorkspaceName + label, 'success');
        updateLoopMoveStatus('success', 'Moved to ' + targetWorkspaceName);
        // v7.9.39: Log workspace change to history before updating state
        const previousWorkspace = state.workspaceName || '(unknown)';
        mc().workspaces.addChangeEntry(previousWorkspace, targetWorkspaceName);
        // Update current workspace name to the target
        state.workspaceName = targetWorkspaceName;
        state.workspaceFromApi = true;
        log('Updated state.workspaceName to: "' + targetWorkspaceName + '"', 'success');
        // v7.14.1: Immediately update UI so workspace name displays right away
        mc().ui.populateDropdown();
        mc().ui.update();
        // v7.9.32: After move, state is already set authoritatively from API success.
        // Do NOT run XPath detection — the dialog may still show the old workspace.
        // Just refresh credits to get updated data, then sync UI.
        setTimeout(function () {
          mc().credits.fetch(false);
        }, 2000);
      });
    }).catch(function (err: Error) {
      log('Move error: ' + err.message, 'error');
      updateLoopMoveStatus('error', err.message);
      // v7.25: Network error — verify session
      verifyWorkspaceSessionAfterFailure('move');
    });
  }

  const resolvedToken = resolveToken();
  if (resolvedToken) {
    doMove(resolvedToken, false);
    return;
  }

  log('No bearer token — recovering before move request', 'warn');
  recoverAuthOnce().then(function(recoveredToken: string) {
    const freshToken = recoveredToken || resolveToken();
    if (!freshToken) {
      failNoToken();
      return;
    }
    doMove(freshToken, false);
  }).catch(function() {
    failNoToken();
  });
}

/**
 * Fallback: move using cached workspace data (no fresh fetch).
 */
export function moveToAdjacentWorkspaceCached(direction: string): void {
  const workspaces = loopCreditState.perWorkspace || [];
  if (workspaces.length === 0) {
    log('No cached workspaces — click 💳 first', 'error');
    updateLoopMoveStatus('error', 'Load workspaces first (💳)');
    return;
  }
  let currentName = state.workspaceName || '';
  let currentIdx = -1;
  for (let i = 0; i < workspaces.length; i++) {
    if (workspaces[i].fullName === currentName || workspaces[i].name === currentName) {
      currentIdx = i;
      break;
    }
  }
  if (currentIdx === -1) currentIdx = 0;
  const len = workspaces.length;
  const step = direction === 'up' ? -1 : 1;
  const targetIdx = ((currentIdx + step) % len + len) % len;
  const target = workspaces[targetIdx];
  const targetId = (target.raw && target.raw.id) || target.id || '';
  log('API Move (cached fallback) ' + direction.toUpperCase() + ': -> "' + target.fullName + '"', 'delegate');
  moveToWorkspace(targetId, target.fullName);
}

/**
 * Move to adjacent workspace — fetches fresh data, skips depleted workspaces.
 */
export function moveToAdjacentWorkspace(direction: string): void {
  log('moveToAdjacentWorkspace(' + direction + '): Fetching fresh workspace data before move...', 'delegate');
  updateLoopMoveStatus('loading', 'Fetching workspaces...');

  const url = CREDIT_API_BASE + '/user/workspaces';

  function noTokenFailure(): void {
    log('moveToAdjacentWorkspace: no bearer token available — request blocked', 'error');
    updateLoopMoveStatus('error', 'Auth token missing');
    showToast('Cannot fetch workspaces: bearer token is missing.', 'error', { noStop: true });
  }

  function doFetchWorkspaces(tkn: string, isRetry: boolean) {
    if (!tkn) {
      if (isRetry) {
        noTokenFailure();
        return;
      }
      log('moveToAdjacentWorkspace: no token — recovering before request', 'warn');
      recoverAuthOnce().then(function(recoveredToken: string) {
        const refreshedToken = recoveredToken || resolveToken();
        if (!refreshedToken) {
          noTokenFailure();
          return;
        }
        doFetchWorkspaces(refreshedToken, true);
      }).catch(function() {
        noTokenFailure();
      });
      return;
    }

    const h: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + tkn,
    };

    fetch(url, { method: 'GET', headers: h, credentials: 'include' })
      .then(function (resp: Response) {
        // v7.25: Token fallback retry for workspace fetch
        if ((resp.status === 401 || resp.status === 403) && !isRetry) {
          const invalidatedKey = invalidateSessionBridgeKey(tkn);
          log('moveToAdjacentWorkspace: Auth ' + resp.status + ' — invalidated "' + invalidatedKey + '", retrying with fallback', 'warn');
          showToast('Workspace fetch auth ' + resp.status + ' — token "' + invalidatedKey + '" expired, retrying...', 'warn', { noStop: true });
          const fallbackToken = resolveToken();
          if (fallbackToken) {
            doFetchWorkspaces(fallbackToken, true);
            return;
          }
          recoverAuthOnce().then(function(recoveredToken: string) {
            const refreshedToken = recoveredToken || resolveToken();
            if (!refreshedToken) {
              noTokenFailure();
              return;
            }
            doFetchWorkspaces(refreshedToken, true);
          }).catch(function() {
            noTokenFailure();
          });
          return;
        }
        if (!resp.ok) {
          return resp.text().then(function (errBody: string) {
            throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + ': ' + (errBody || '').substring(0, 200));
          });
        }
        return resp.text().then(function (bodyText: string) {
          if (!bodyText) throw new Error('Empty response body');
          let data: any;
          try { data = JSON.parse(bodyText); } catch (e) { throw new Error('JSON parse: ' + (e as Error).message); }
          return data;
        });
      })
      .then(function (data: any) {
        const ok = parseLoopApiResponse(data);
        if (!ok) {
          log('moveToAdjacentWorkspace: Failed to parse workspace data', 'error');
          updateLoopMoveStatus('error', 'Failed to parse workspaces');
          return;
        }
        const workspaces = loopCreditState.perWorkspace || [];
        if (workspaces.length === 0) {
          log('No workspaces loaded from API', 'error');
          updateLoopMoveStatus('error', 'No workspaces found');
          return;
        }

        log('moveToAdjacentWorkspace: Fresh data loaded — ' + workspaces.length + ' workspaces', 'success');

        // Find current workspace index
        let currentName = state.workspaceName || '';
        let currentIdx = -1;
        for (let i = 0; i < workspaces.length; i++) {
          if (workspaces[i].fullName === currentName || workspaces[i].name === currentName) {
            currentIdx = i;
            break;
          }
        }
        if (currentIdx === -1 && currentName) {
          const lowerName = currentName.toLowerCase();
          for (let pi = 0; pi < workspaces.length; pi++) {
            if ((workspaces[pi].fullName || '').toLowerCase().indexOf(lowerName) !== -1 ||
              lowerName.indexOf((workspaces[pi].fullName || '').toLowerCase()) !== -1) {
              currentIdx = pi;
              log('Workspace partial match: "' + currentName + '" ~ "' + workspaces[pi].fullName + '"', 'warn');
              break;
            }
          }
        }
        if (currentIdx === -1) {
          log('Current workspace "' + currentName + '" not found — using idx 0', 'warn');
          currentIdx = 0;
        }

        // v7.9.40: Walk in direction, find first workspace with dailyFree > 0
        const len = workspaces.length;
        const step = direction === 'up' ? -1 : 1;
        let targetIdx = -1;
        let fallbackIdx = -1;

        for (let s = 1; s <= len; s++) {
          const candidateIdx = ((currentIdx + step * s) % len + len) % len;
          if (candidateIdx === currentIdx) continue;

          if (fallbackIdx === -1) fallbackIdx = candidateIdx;

          const candidate = workspaces[candidateIdx];
          const candidateDailyFree = candidate.dailyFree || 0;
          logSub('Checking ' + direction + ' #' + s + ': "' + candidate.fullName + '" dailyFree=' + candidateDailyFree, 1);

          if (candidateDailyFree > 0) {
            targetIdx = candidateIdx;
            log('Found workspace with free credit: "' + candidate.fullName + '" (dailyFree=' + candidateDailyFree + ', ' + s + ' step(s) ' + direction + ')', 'success');
            break;
          }
        }

        if (targetIdx === -1) {
          log('⚠️ No workspace has dailyFree > 0 — falling back to immediate ' + direction + ' neighbor', 'warn');
          targetIdx = fallbackIdx !== -1 ? fallbackIdx : ((currentIdx + step) % len + len) % len;
        }

        const target = workspaces[targetIdx];
        const targetId = (target.raw && target.raw.id) || target.id || '';
        let skipped = Math.abs(targetIdx - currentIdx);
        if (skipped < 0) skipped += len;
        log('API Move ' + direction.toUpperCase() + ': "' + currentName + '" (#' + currentIdx + ') -> "' + target.fullName + '" (#' + targetIdx + ') dailyFree=' + (target.dailyFree || 0) + (skipped > 1 ? ' (skipped ' + (skipped - 1) + ' depleted)' : ''), 'delegate');
        moveToWorkspace(targetId, target.fullName);

        // Update UI with fresh data
        mc().credits.sync();
        mc().ui.update();
      })
      .catch(function (err: Error) {
        log('moveToAdjacentWorkspace: Fetch failed — ' + err.message + '. Falling back to cached data.', 'error');
        moveToAdjacentWorkspaceCached(direction);
      });
  }

  const token = resolveToken();
  if (token) {
    doFetchWorkspaces(token, false);
    return;
  }

  log('moveToAdjacentWorkspace: no token — recovering before initial fetch', 'warn');
  recoverAuthOnce().then(function(recoveredToken: string) {
    const refreshedToken = recoveredToken || resolveToken();
    if (!refreshedToken) {
      noTokenFailure();
      return;
    }
    doFetchWorkspaces(refreshedToken, true);
  }).catch(function() {
    noTokenFailure();
  });
}
