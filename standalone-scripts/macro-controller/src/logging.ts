 
import { toErrorMessage, logError, logDebug } from './error-utils';
/**
 * MacroLoop Controller — Logging Module
 * Phase 6: for-of conversions, newline-before-return, curly braces (CQ13–CQ15)
 *
 * Core logging functions: safeSetItem, URL/project helpers,
 * log persistence (batched writes), and main log/logSub entry points.
 *
 * Sub-modules: log-csv-export, log-activity-ui.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md
 */

import { VERSION, BLOATED_KEY_PATTERNS, LOG_STORAGE_KEY, LOG_MAX_ENTRIES, WS_HISTORY_KEY, CONFIG, state, cLogDefault, cLogError, cLogInfo, cLogSuccess, cLogWarn, cLogDelegate, cLogCheck, cLogSkip } from './shared-state';
import { getByXPath } from './xpath-utils';
import type { PersistedLogEntry } from './types';
import { shouldLog, shouldConsole, shouldPersist, shouldActivityUi } from './log-manager';
import { addActivityLog } from './log-activity-ui';

// Re-export sub-modules for backward compatibility
export { exportWorkspacesAsCsv, exportAvailableWorkspacesAsCsv } from './log-csv-export';
export { addActivityLog, updateActivityLogUI, toggleActivityLog } from './log-activity-ui';

// ============================================
// Quota-safe localStorage wrapper
// ============================================

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);

    return true;
  } catch (e: unknown) {
    logError('safeSetItem', 'localStorage setItem failed', e);
    const isQuotaError = (
      e instanceof DOMException &&
      (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );

    if (!isQuotaError) {
      return false;
    }

    console.warn('[MacroLoop] localStorage quota exceeded — scanning for bloated keys to purge');
    const purged = purgeBloatedKeys();

    if (purged > 0) {
      return retrySetItemAfterPurge(key, value, purged);
    }

    console.error('[MacroLoop] Quota exceeded but no bloated keys found — clearing all localStorage');

    return clearAndRetrySetItem(key, value);
  }
}

function purgeBloatedKeys(): number {
  let purged = 0;

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);

    if (!k) {
      continue;
    }

    for (const pattern of BLOATED_KEY_PATTERNS) {
      const isMatch = k.indexOf(pattern) !== -1;

      if (isMatch) {
        const size = (localStorage.getItem(k) || '').length;
        console.warn('[MacroLoop] Purging bloated key: "' + k + '" (size=' + size + ')');
        localStorage.removeItem(k);
        purged++;
        break;
      }
    }
  }

  return purged;
}

function retrySetItemAfterPurge(key: string, value: string, purged: number): boolean {
  try {
    localStorage.setItem(key, value);
    console.log('[MacroLoop] Retry succeeded after purging ' + purged + ' bloated key(s)');

    return true;
  } catch (_e2) {
    console.error('[MacroLoop] Retry failed even after purging — clearing all localStorage');

    return clearAndRetrySetItem(key, value);
  }
}

function clearAndRetrySetItem(key: string, value: string): boolean {
  localStorage.clear();

  try {
    localStorage.setItem(key, value);

    return true;
  } catch (e) {
    logError('safeGetItem', 'localStorage getItem failed', e);
    return false;
  }
}

// ============================================
// URL & Project Helpers
// ============================================

export function getProjectIdFromUrl(): string | null {
  const url = window.location.href;
  const match = url.match(/\/projects\/([a-f0-9-]+)/);

  return match ? match[1] : null;
}

export function getWsHistoryKey(): string {
  const projectId = getProjectIdFromUrl();

  return projectId ? WS_HISTORY_KEY + '_' + projectId : WS_HISTORY_KEY;
}

/**
 * Read project name from DOM using the configured XPath.
 * Called once on page load; result cached in state.projectNameFromDom.
 */
export function getProjectNameFromDom(): string | null {
  try {
    const node = getByXPath(CONFIG.PROJECT_NAME_XPATH);
    if (node && node.textContent) {
      const name = node.textContent.trim();
      if (name.length > 0) {
        state.projectNameFromDom = name;

        return name;
      }
    }
  } catch (e) {
    log('getProjectNameFromDom failed: ' + toErrorMessage(e), 'warn');
  }

  return null;
}

export function getDisplayProjectName(): string {
  // Priority 0: User-configured custom display name (settings)
  if (state.customDisplayName) {
    return state.customDisplayName;
  }

  // Priority 1: API-resolved project name (source of truth)
  if (state.projectNameFromApi) {
    return state.projectNameFromApi;
  }

  // Priority 2: DOM XPath-resolved project name (read on page load)
  if (state.projectNameFromDom) {
    return state.projectNameFromDom;
  }

  // Priority 3: document title parse
  const titleMatch = (document.title || '').match(/^(.+?)\s*[-–—]\s*(?:Lovable|lovable)/);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Priority 4: truncated project ID
  const pid = getProjectIdFromUrl();
  return pid ? pid.substring(0, 8) : 'Unknown Project';
}

export function getLogStorageKey(): string {
  const url = window.location.href;
  const projectMatch = url.match(/\/projects\/([a-f0-9-]+)/);
  const projectId = projectMatch ? projectMatch[1].substring(0, 8) : 'unknown';

  return LOG_STORAGE_KEY + '_' + projectId;
}

// ============================================
// Log Persistence — Batched writes
// ============================================

// CQ11: Encapsulate pending log entries in singleton
class LogFlushState {
  private _entries: Array<{ t: string; l: string; m: string; url: string }> = [];
  private _timer: ReturnType<typeof setTimeout> | null = null;

  get entries(): Array<{ t: string; l: string; m: string; url: string }> {
    return this._entries;
  }

  push(entry: { t: string; l: string; m: string; url: string }): void {
    this._entries.push(entry);
  }

  drain(): Array<{ t: string; l: string; m: string; url: string }> {
    const batch = this._entries.slice();
    this._entries = [];

    return batch;
  }

  get timer(): ReturnType<typeof setTimeout> | null {
    return this._timer;
  }

  set timer(v: ReturnType<typeof setTimeout> | null) {
    this._timer = v;
  }
}

const logFlushState = new LogFlushState();
import { LOG_FLUSH_INTERVAL_MS } from './constants';

function _flushPendingLogs(): void {
  logFlushState.timer = null;
  const batch = logFlushState.drain();
  const hasNoPending = batch.length === 0;

  if (hasNoPending) {
    return;
  }

  try {
    const key = getLogStorageKey();
    let logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs = logs.concat(batch);

    const isOverLimit = logs.length > LOG_MAX_ENTRIES;

    if (isOverLimit) {
      logs = logs.slice(logs.length - LOG_MAX_ENTRIES);
    }

    safeSetItem(key, JSON.stringify(logs));
  } catch (e) {
    logError('storeLog', 'Failed to persist log entry', e);
    /* storage full or unavailable */
  }
}

export function persistLog(level: string, message: string): void {
  const now = new Date();
  const timestamp = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  logFlushState.push({
    t: timestamp,
    l: level,
    m: message,
    url: window.location.pathname,
  });

  const hasNoTimer = !logFlushState.timer;

  if (hasNoTimer) {
    logFlushState.timer = setTimeout(_flushPendingLogs, LOG_FLUSH_INTERVAL_MS);
  }
}

/** Force flush any pending logs immediately (e.g., before page unload) */
export function flushLogs(): void {
  if (logFlushState.timer) {
    clearTimeout(logFlushState.timer);
  }

  _flushPendingLogs();
}

export function getAllLogs(): PersistedLogEntry[] {
  try {
    const key = getLogStorageKey();

    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    logError('getStoredLogs', 'Failed to read stored logs', e);
    return [];
  }
}

export function clearAllLogs(): void {
  try {
    const key = getLogStorageKey();
    localStorage.removeItem(key);
  } catch (_e) {
    logDebug('clearAllLogs', 'localStorage.removeItem failed: ' + (_e instanceof Error ? _e.message : String(_e)));
  }
}

export function formatLogsForExport(): string {
  const logs = getAllLogs();
  const lines: string[] = [];
  lines.push('=== MacroLoop Logs ===');
  lines.push('Project URL: ' + window.location.href);
  lines.push('Exported at: ' + new Date().toISOString());
  lines.push('Total entries: ' + logs.length);
  lines.push('---');

  for (const entry of logs) {
    lines.push('[' + entry.t + '] [' + entry.l + '] ' + entry.m);
  }

  return lines.join('\n');
}

export function copyLogsToClipboard(): void {
  const text = formatLogsForExport();
  navigator.clipboard.writeText(text).then(function () {
    log('Copied ' + getAllLogs().length + ' log entries to clipboard', 'success');
  }).catch(function (err: unknown) {
    log('Clipboard copy failed: ' + toErrorMessage(err), 'warn');
  });
}

export function downloadLogs(): void {
  const text = formatLogsForExport();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'macroloop-logs-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log('Downloaded logs file', 'success');
}

// ============================================
// Log level style map
// ============================================

const LOG_STYLE_MAP: Record<string, string> = {
  success: 'color: ' + cLogSuccess + ';',
  error: 'color: ' + cLogError + '; font-weight: bold;',
  warn: 'color: ' + cLogWarn + ';',
  delegate: 'color: ' + cLogDelegate + ';',
  check: 'color: ' + cLogCheck + ';',
  skip: 'color: ' + cLogSkip + '; font-style: italic;',
};

// ============================================
// Main Log Functions
// ============================================

export function log(msg: string, type?: string): void {
  const resolvedType = type || 'info';
  const isFiltered = !shouldLog(resolvedType);

  if (isFiltered) {
    return;
  }

  if (shouldConsole()) {
    const prefix = '[MacroLoop v' + VERSION + '] ';
    const style = LOG_STYLE_MAP[resolvedType] || 'color: ' + cLogDefault + ';';
    console.log('%c' + prefix + msg, style);
  }

  if (shouldActivityUi()) {
    addActivityLog(null, resolvedType, msg, 0);
  }

  if (shouldPersist()) {
    persistLog(resolvedType, msg);
  }
}

export function logSub(msg: string, indent?: number): void {
  const isFiltered = !shouldLog('sub');

  if (isFiltered) {
    return;
  }

  const level = indent || 1;
  const pad = '  '.repeat(level);

  if (shouldConsole()) {
    const prefix = '[MacroLoop v' + VERSION + '] ';
    console.log('%c' + prefix + pad + msg, 'color: ' + cLogInfo + ';');
  }

  if (shouldActivityUi()) {
    addActivityLog(null, 'SUB', msg, level);
  }

  if (shouldPersist()) {
    persistLog('SUB', pad + msg);
  }
}
