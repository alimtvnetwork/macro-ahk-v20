/**
 * MacroLoop Controller — Workspace Rename Logic
 *
 * Extracted from macro-looping.ts IIFE (Step 2, registry pattern).
 * Contains: single rename API, template engine, bulk rename, undo, history.
 * Uses MacroController singleton for cross-module calls.
 */

import { log, logSub } from './logging';
import { resolveToken, recoverAuthOnce } from './auth';
import { invalidateSessionBridgeKey } from './auth';
import { showToast } from './toast';
import { CREDIT_API_BASE, loopCreditState, setLoopWsCheckedIds, setLoopWsLastCheckedIdx } from './shared-state';
import { sendToExtension } from './ui/prompt-manager';

import { MacroController } from './core/MacroController';

function mc() { return MacroController.getInstance(); }

// ============================================
// Forbidden workspace rename cache (Issue 60)
// ============================================
const FORBIDDEN_GROUP = 'rename_forbidden';
const forbiddenWsIds = new Set<string>();

/** Load forbidden workspace IDs from GroupedKv on controller init */
export function loadForbiddenRenameCache(): void {
  sendToExtension('GKV_LIST', { group: FORBIDDEN_GROUP }, function(resp: any) {
    if (resp && resp.entries) {
      forbiddenWsIds.clear();
      for (let i = 0; i < resp.entries.length; i++) {
        forbiddenWsIds.add(resp.entries[i].key);
      }
      if (forbiddenWsIds.size > 0) {
        log('[Rename] Loaded ' + forbiddenWsIds.size + ' forbidden workspace(s) from cache', 'info');
      }
    }
  });
}

/** Check if a workspace is in the forbidden cache */
export function isRenameForbidden(wsId: string): boolean {
  return forbiddenWsIds.has(wsId);
}

/** Get count of forbidden workspaces */
export function getForbiddenCount(): number {
  return forbiddenWsIds.size;
}

/** Clear entire forbidden cache */
export function clearForbiddenRenameCache(): void {
  forbiddenWsIds.clear();
  sendToExtension('GKV_CLEAR_GROUP', { group: FORBIDDEN_GROUP }, function() {
    log('[Rename] Forbidden rename cache cleared', 'success');
  });
}

function addForbidden(wsId: string, message: string): void {
  forbiddenWsIds.add(wsId);
  sendToExtension('GKV_SET', {
    group: FORBIDDEN_GROUP,
    key: wsId,
    value: JSON.stringify({ message: message, timestamp: new Date().toISOString() }),
  });
  log('[Rename] Cached workspace ' + wsId + ' as forbidden', 'warn');
}

function removeForbidden(wsId: string): void {
  forbiddenWsIds.delete(wsId);
  sendToExtension('GKV_DELETE', { group: FORBIDDEN_GROUP, key: wsId });
  log('[Rename] Removed workspace ' + wsId + ' from forbidden cache', 'info');
}

// ============================================
// Rename delay + cancellation state
// ============================================
let RENAME_DELAY_MS = 750;
let RENAME_CANCELLED = false;
/** Once auth recovery fails during a bulk op, skip it for remaining items */
let AUTH_RECOVERY_EXHAUSTED = false;

export function getRenameDelayMs(): number { return RENAME_DELAY_MS; }
export function setRenameDelayMs(ms: number): void {
  RENAME_DELAY_MS = Math.max(100, Math.min(10000, parseInt(String(ms), 10) || 750));
  log('[Rename] Delay set to ' + RENAME_DELAY_MS + 'ms', 'info');
}
export function cancelRename(): void {
  RENAME_CANCELLED = true;
  log('[Rename] Cancellation requested', 'warn');
}

// ============================================
// Rename history
// ============================================
export type RenameStrategy = 'normal' | 'no-limit' | 'auth-retry' | 'rate-retry';

interface RenameHistoryEntry {
  timestamp: number;
  entries: Array<{ wsId: string; oldName: string; newName: string; success?: boolean; strategy?: RenameStrategy }>;
}

let loopRenameHistory: RenameHistoryEntry[] = [];
const RENAME_HISTORY_MAX = 20;

// Rolling average for ETA
let RENAME_AVG_OP_MS = 0;
let RENAME_OP_TIMES: number[] = [];
const RENAME_OP_WINDOW = 5;

export function getRenameAvgOpMs(): number { return RENAME_AVG_OP_MS; }
export function getRenameHistory(): RenameHistoryEntry[] { return loopRenameHistory; }
export function isRenameCancelled(): boolean { return RENAME_CANCELLED; }

// Restore history from localStorage on load
try {
  const savedHistory = localStorage.getItem('ml_rename_history');
  if (savedHistory) {
    loopRenameHistory = JSON.parse(savedHistory);
    log('[Rename] Restored ' + loopRenameHistory.length + ' undo entries from localStorage', 'success');
  }
} catch (e) { /* ignore */ }

// ============================================
// Single rename API call
// ============================================
export function renameWorkspace(wsId: string, newName: string, forceRetry?: boolean): Promise<RenameStrategy> {
  return new Promise<RenameStrategy>(function (resolve, reject) {
    // Check forbidden cache (skip if force retry)
    if (!forceRetry && forbiddenWsIds.has(wsId)) {
      log('[Rename] ⛔ Workspace ' + wsId + ' is in forbidden cache — skipping (use force-retry to override)', 'warn');
      reject(new Error('FORBIDDEN_CACHED'));
      return;
    }

    const url = CREDIT_API_BASE + '/user/workspaces/' + wsId;

    type RenameAttemptState = {
      includeCreditLimit: boolean;
      didAuthRecovery: boolean;
      didLimitFallback: boolean;
      didRateLimitRetry: boolean;
    };

    function getStrategy(attempt: RenameAttemptState): RenameStrategy {
      if (attempt.didAuthRecovery) return 'auth-retry';
      if (attempt.didLimitFallback) return 'no-limit';
      if (attempt.didRateLimitRetry) return 'rate-retry';
      return 'normal';
    }

    function buildBody(includeCreditLimit: boolean): string {
      const payload: { name: string; default_monthly_member_credit_limit?: number } = { name: newName };
      if (includeCreditLimit) payload.default_monthly_member_credit_limit = -1;
      return JSON.stringify(payload);
    }

    function rejectNoBearerToken(bodyStr: string): void {
      const msg = 'No bearer token available for rename request';
      log('[Rename] ' + msg + ' — request blocked', 'error');
      showToast(msg + '. Please refresh authentication.', 'error', {
        noStop: true,
        requestDetail: { method: 'PUT', url: url, body: bodyStr }
      });
      reject(new Error('NO_BEARER_TOKEN'));
    }

    function doRename(tkn: string, attempt: RenameAttemptState): void {
      if (!tkn) {
        rejectNoBearerToken(buildBody(attempt.includeCreditLimit));
        return;
      }

      const h: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + tkn,
      };
      const bodyStr = buildBody(attempt.includeCreditLimit);
      const authLabel = 'Bearer ' + tkn.substring(0, 12) + '...REDACTED';
      const reqSummary = 'Request: PUT ' + url + '\nBody: ' + bodyStr + '\nAuth: ' + authLabel;
      const labels: string[] = [];
      if (attempt.didLimitFallback) labels.push('no-limit');
      if (attempt.didAuthRecovery) labels.push('auth-retry');
      if (attempt.didRateLimitRetry) labels.push('rate-retry');
      const labelSuffix = labels.length > 0 ? ' (' + labels.join(', ') + ')' : '';

      log('[Rename] PUT ' + url + ' → "' + newName + '"' + labelSuffix, 'delegate');
      logSub('Auth: Bearer ' + tkn.substring(0, 12) + '...', 1);

      const fetchId = 'rename-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      console.log('[MacroLoop FETCH→] id=' + fetchId + ' PUT ' + url + ' body=' + bodyStr + ' auth=Bearer ' + tkn.substring(0, 12) + '...');

      fetch(url, {
        method: 'PUT',
        headers: h,
        credentials: 'include',
        mode: 'cors',
        body: bodyStr
      }).then(function (resp: Response) {
        console.log('[MacroLoop FETCH←] id=' + fetchId + ' status=' + resp.status + ' ' + resp.statusText);
        if (resp.status === 429 && !attempt.didRateLimitRetry) {
          log('[Rename] Rate limited (429) — retrying in 2s', 'warn');
          setTimeout(function () {
            doRename(tkn, { ...attempt, didRateLimitRetry: true });
          }, 2000);
          return;
        }

        if (resp.status === 403 && attempt.includeCreditLimit && !attempt.didLimitFallback) {
          resp.text().then(function (body: string) {
            const bodyPreview = body.substring(0, 500);
            log('[Rename] 403 with default_monthly_member_credit_limit — retrying without limit field', 'warn');
            showToast('Rename 403 with monthly-limit field — retrying without it...\n' + reqSummary + '\nResponse: HTTP 403\nResponse Body: ' + bodyPreview, 'warn', {
              requestDetail: {
                method: 'PUT',
                url: url,
                headers: h,
                body: bodyStr,
                status: resp.status,
                statusText: resp.statusText,
                responseBody: bodyPreview,
              }
            });
            doRename(tkn, {
              ...attempt,
              includeCreditLimit: false,
              didLimitFallback: true,
            });
          });
          return;
        }

        if (resp.status === 401 && !attempt.didAuthRecovery) {
          // Only 401 should trigger auth recovery.
          // 403 is treated as permission/ownership denial and should fail fast.
          resp.text().then(function (body: string) {
            const bodyPreview = body.substring(0, 500);

            // Skip auth recovery if it already failed during this bulk operation
            if (AUTH_RECOVERY_EXHAUSTED) {
              log('[Rename] Auth recovery already exhausted in this batch — skipping', 'warn');
              reject(new Error('HTTP ' + resp.status));
              return;
            }

            const invalidatedKey = invalidateSessionBridgeKey(tkn);
            log('[Rename] Got 401 — invalidated "' + invalidatedKey + '", recovering auth...', 'warn');
            showToast('Rename auth 401 — recovering session...\n' + reqSummary + '\nResponse: HTTP 401' + (resp.statusText ? (' ' + resp.statusText) : ''), 'warn', {
              requestDetail: { method: 'PUT', url: url, headers: h, body: bodyStr, status: resp.status, statusText: resp.statusText, responseBody: bodyPreview }
            });

            recoverAuthOnce().then(function (recoveredToken: string) {
              const fallbackToken = recoveredToken || resolveToken();
              if (fallbackToken) {
                log('[Rename] Auth recovered — retrying with new token', 'info');
                doRename(fallbackToken, { ...attempt, didAuthRecovery: true });
              } else {
                log('[Rename] Auth recovery produced no token — marking exhausted for batch', 'warn');
                AUTH_RECOVERY_EXHAUSTED = true;
                rejectNoBearerToken(bodyStr);
              }
            }).catch(function () {
              log('[Rename] Auth recovery error — marking exhausted for batch', 'warn');
              AUTH_RECOVERY_EXHAUSTED = true;
              rejectNoBearerToken(bodyStr);
            });
          }).catch(function () {
            reject(new Error('HTTP 401'));
          });
          return;
        }

        if (!resp.ok) {
          resp.text().then(function (body: string) {
            const bodyPreview = body.substring(0, 500);
            log('[Rename] ❌ HTTP ' + resp.status + ': ' + body.substring(0, 200), 'error');
            showToast('Rename failed: HTTP ' + resp.status + '\n' + reqSummary + '\nResponse: ' + bodyPreview, 'error', {
              requestDetail: { method: 'PUT', url: url, headers: h, body: bodyStr, status: resp.status, statusText: resp.statusText, responseBody: bodyPreview }
            });
            // Cache 403 forbidden responses (non-credit-limit path = permission denied)
            if (resp.status === 403 && attempt.didLimitFallback) {
              addForbidden(wsId, bodyPreview);
            }
            reject(new Error('HTTP ' + resp.status));
          });
          return;
        }

        const strategy = getStrategy(attempt);
        log('[Rename] ✅ renamed to "' + newName + '"' + (strategy !== 'normal' ? ' [' + strategy + ']' : ''), 'success');
        // If this was a force-retry that succeeded, clear the forbidden cache
        if (forceRetry && forbiddenWsIds.has(wsId)) {
          removeForbidden(wsId);
        }
        resolve(strategy);
      }).catch(function (err: Error) {
        console.log('[MacroLoop FETCH✗] id=' + fetchId + ' error=' + err.message);
        log('[Rename] Network error: ' + err.message, 'error');
        showToast('Rename network error: ' + err.message + '\n' + reqSummary, 'error', {
          requestDetail: { method: 'PUT', url: url, headers: h, body: bodyStr },
          stack: err.stack
        });
        // Do not run session probe here — keep failure path lightweight.
        reject(err);
      });
    }

    function startRename(): void {
      const token = resolveToken();
      if (token) {
        doRename(token, {
          includeCreditLimit: true,
          didAuthRecovery: false,
          didLimitFallback: false,
          didRateLimitRetry: false,
        });
        return;
      }

      log('[Rename] No bearer token — recovering before request', 'warn');
      recoverAuthOnce().then(function(recoveredToken: string) {
        const fallbackToken = recoveredToken || resolveToken();
        if (!fallbackToken) {
          rejectNoBearerToken(buildBody(true));
          return;
        }
        doRename(fallbackToken, {
          includeCreditLimit: true,
          didAuthRecovery: false,
          didLimitFallback: false,
          didRateLimitRetry: false,
        });
      }).catch(function() {
        rejectNoBearerToken(buildBody(true));
      });
    }

    startRename();
  });
}

// ============================================
// Template engine
// ============================================
export function applyRenameTemplate(
  template: string, prefix: string, suffix: string,
  startNums: number | Record<string, number>, index: number, originalName: string
): string {
  const starts = (typeof startNums === 'object' && startNums !== null)
    ? startNums as Record<string, number>
    : { dollar: (startNums as number) || 1, hash: (startNums as number) || 1, star: (startNums as number) || 1 };

  function applyVars(str: string): string {
    if (!str) return str;
    str = str.replace(/(\$+)/, function (m: string) {
      const num = (starts.dollar || 1) + index;
      let s = String(num);
      while (s.length < m.length) s = '0' + s;
      return s;
    });
    str = str.replace(/(#+)/, function (m: string) {
      const num = (starts.hash || 1) + index;
      let s = String(num);
      while (s.length < m.length) s = '0' + s;
      return s;
    });
    str = str.replace(/(\*{2,})/, function (m: string) {
      const num = (starts.star || 1) + index;
      let s = String(num);
      while (s.length < m.length) s = '0' + s;
      return s;
    });
    return str;
  }

  let base = template ? applyVars(template) : originalName;
  const resolvedPrefix = applyVars(prefix || '');
  const resolvedSuffix = applyVars(suffix || '');
  return resolvedPrefix + base + resolvedSuffix;
}

// ============================================
// Undo button visibility
// ============================================
export function updateUndoBtnVisibility(): void {
  const undoBtn = document.getElementById('loop-ws-undo-btn');
  if (undoBtn) {
    undoBtn.style.display = loopRenameHistory.length > 0 ? 'inline-block' : 'none';
    if (loopRenameHistory.length > 0) {
      const last = loopRenameHistory[loopRenameHistory.length - 1];
      undoBtn.title = 'Undo last rename (' + last.entries.length + ' workspaces, ' + new Date(last.timestamp).toLocaleTimeString() + ')';
    }
  }
}

// ============================================
// Bulk rename
// ============================================
export function bulkRenameWorkspaces(entries: any, onProgress: Function, forceRetry?: boolean): void {
  const forbiddenSkipped = forceRetry ? 0 : entries.filter((e: any) => forbiddenWsIds.has(e.wsId)).length;
  if (forbiddenSkipped > 0) {
    log('[Rename] ⛔ ' + forbiddenSkipped + ' workspace(s) in forbidden cache will be skipped', 'warn');
  }
  log('[Rename] === BULK RENAME START === (' + entries.length + ' workspaces, ' + forbiddenSkipped + ' forbidden, delay=' + RENAME_DELAY_MS + 'ms)', 'delegate');
  const results = { success: 0, failed: 0, skipped: 0, total: entries.length, successEntries: [] as any[], cancelled: false, strategies: {} as Record<RenameStrategy, number> };
  RENAME_CANCELLED = false;
  AUTH_RECOVERY_EXHAUSTED = false;
  RENAME_OP_TIMES = [];
  RENAME_AVG_OP_MS = 0;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  function trackOpTime(startTime: number): void {
    const requestDuration = Date.now() - startTime;
    RENAME_OP_TIMES.push(requestDuration + RENAME_DELAY_MS);
    if (RENAME_OP_TIMES.length > RENAME_OP_WINDOW) RENAME_OP_TIMES.shift();
    RENAME_AVG_OP_MS = Math.round(RENAME_OP_TIMES.reduce(function (a: number, b: number) { return a + b; }, 0) / RENAME_OP_TIMES.length);
  }

  function doNext(idx: number): void {
    if (RENAME_CANCELLED) {
      log('[Rename] === CANCELLED === at ' + idx + '/' + entries.length + ' (' + results.success + ' success, ' + results.failed + ' failed)', 'warn');
      if (results.successEntries.length > 0) {
        loopRenameHistory.push({ timestamp: Date.now(), entries: results.successEntries });
        if (loopRenameHistory.length > RENAME_HISTORY_MAX) loopRenameHistory.shift();
        updateUndoBtnVisibility();
        try { localStorage.setItem('ml_rename_history', JSON.stringify(loopRenameHistory)); } catch (e) { /* ignore */ }
      }
      (results as any).cancelled = true;
      if (onProgress) onProgress(results, true);
      return;
    }

    if (idx >= entries.length) {
      const strategyParts: string[] = [];
      for (const k in results.strategies) { strategyParts.push(k + ':' + results.strategies[k as RenameStrategy]); }
      const strategySummary = strategyParts.length > 0 ? ' | strategies: ' + strategyParts.join(', ') : '';
      log('[Rename] === BULK RENAME COMPLETE === ' + results.success + '/' + results.total + ' success, ' + results.failed + ' failed' + strategySummary, results.failed > 0 ? 'warn' : 'success');

      if (results.successEntries.length > 0) {
        loopRenameHistory.push({ timestamp: Date.now(), entries: results.successEntries });
        if (loopRenameHistory.length > RENAME_HISTORY_MAX) loopRenameHistory.shift();
        log('[Rename] Saved to undo history (' + results.successEntries.length + ' entries, stack depth=' + loopRenameHistory.length + ')', 'success');
        updateUndoBtnVisibility();
        try { localStorage.setItem('ml_rename_history', JSON.stringify(loopRenameHistory)); } catch (e) { /* ignore */ }
      }

      mc().credits.fetch(false);
      setLoopWsCheckedIds({});
      setLoopWsLastCheckedIdx(-1);
      if (onProgress) onProgress(results, true);
      return;
    }

    const entry = entries[idx];

    // Skip forbidden workspaces unless force-retry
    if (!forceRetry && forbiddenWsIds.has(entry.wsId)) {
      log('[Rename] ⛔ ' + (idx + 1) + '/' + entries.length + ' — "' + entry.oldName + '" SKIPPED (forbidden cache)', 'warn');
      results.skipped++;
      if (onProgress) onProgress(results, false);
      setTimeout(function () { doNext(idx + 1); }, 50);
      return;
    }

    log('[Rename] ' + (idx + 1) + '/' + entries.length + ' — "' + entry.oldName + '" → "' + entry.newName + '"', 'check');
    const opStartTime = Date.now();

    renameWorkspace(entry.wsId, entry.newName, forceRetry).then(function (strategy: RenameStrategy) {
      results.success++;
      consecutiveFailures = 0; // reset on success
      results.strategies[strategy] = (results.strategies[strategy] || 0) + 1;
      results.successEntries.push({ wsId: entry.wsId, oldName: entry.oldName, newName: entry.newName, strategy: strategy });
      const perWs = loopCreditState.perWorkspace || [];
      for (let k = 0; k < perWs.length; k++) {
        if (perWs[k].id === entry.wsId) {
          perWs[k].fullName = entry.newName;
          perWs[k].name = entry.newName;
          break;
        }
      }
      const strategyTag = strategy !== 'normal' ? ' [' + strategy + ']' : '';
      log('[Rename] ✅ ' + (idx + 1) + '/' + entries.length + ' renamed: "' + entry.newName + '"' + strategyTag, 'success');
      trackOpTime(opStartTime);
      if (onProgress) onProgress(results, false);
      setTimeout(function () { doNext(idx + 1); }, RENAME_DELAY_MS);
    }).catch(function (err: Error) {
      results.failed++;
      consecutiveFailures++;
      log('[Rename] ❌ ' + (idx + 1) + '/' + entries.length + ' failed: ' + err.message, 'error');
      trackOpTime(opStartTime);

      // Circuit breaker: auto-cancel after N consecutive failures to prevent UI freeze
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log('[Rename] ⚡ Circuit breaker: ' + MAX_CONSECUTIVE_FAILURES + ' consecutive failures — auto-stopping to prevent freeze', 'error');
        showToast('Bulk rename auto-stopped after ' + MAX_CONSECUTIVE_FAILURES + ' consecutive failures', 'error', { noStop: true });
        RENAME_CANCELLED = true;
      }
      trackOpTime(opStartTime);
      if (onProgress) onProgress(results, false);
      setTimeout(function () { doNext(idx + 1); }, RENAME_DELAY_MS);
    });
  }

  doNext(0);
}

// ============================================
// Undo last rename
// ============================================
export function undoLastRename(onProgress: Function): void {
  if (loopRenameHistory.length === 0) {
    log('[Rename] No rename history to undo', 'warn');
    return;
  }
  const last = loopRenameHistory[loopRenameHistory.length - 1];
  const reverseEntries: Array<{ wsId: string; oldName: string; newName: string }> = [];
  for (let i = 0; i < last.entries.length; i++) {
    reverseEntries.push({
      wsId: last.entries[i].wsId,
      oldName: last.entries[i].newName,
      newName: last.entries[i].oldName!
    });
  }

  log('[Rename] === UNDO RENAME === Reverting ' + reverseEntries.length + ' workspaces (from ' + new Date(last.timestamp).toLocaleTimeString() + ')', 'delegate');
  const results = { success: 0, failed: 0, total: reverseEntries.length };

  function doNext(idx: number): void {
    if (idx >= reverseEntries.length) {
      log('[Rename] === UNDO COMPLETE === ' + results.success + '/' + results.total + ' reverted', results.failed > 0 ? 'warn' : 'success');
      if (results.success > 0) {
        loopRenameHistory.pop();
        try { localStorage.setItem('ml_rename_history', JSON.stringify(loopRenameHistory)); } catch (e) { /* ignore */ }
        updateUndoBtnVisibility();
      }
      mc().credits.fetch(false);
      if (onProgress) onProgress(results, true);
      return;
    }

    const entry = reverseEntries[idx];
    log('[Rename] Undo ' + (idx + 1) + '/' + reverseEntries.length + ' — "' + entry.oldName + '" → "' + entry.newName + '"', 'check');

    renameWorkspace(entry.wsId, entry.newName).then(function () {
      results.success++;
      const perWs = loopCreditState.perWorkspace || [];
      for (let k = 0; k < perWs.length; k++) {
        if (perWs[k].id === entry.wsId) {
          perWs[k].fullName = entry.newName;
          perWs[k].name = entry.newName;
          break;
        }
      }
      if (onProgress) onProgress(results, false);
      doNext(idx + 1);
    }).catch(function (err: Error) {
      results.failed++;
      log('[Rename] Undo ❌ ' + (idx + 1) + '/' + reverseEntries.length + ' failed: ' + err.message, 'error');
      if (onProgress) onProgress(results, false);
      doNext(idx + 1);
    });
  }

  doNext(0);
}
