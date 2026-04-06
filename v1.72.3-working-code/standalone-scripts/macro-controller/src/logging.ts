/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Logging Module
 * Step 2d: Extracted from macro-looping.ts
 *
 * Contains: safeSetItem, URL/project helpers, log persistence,
 * activity log UI, CSV export, log/logSub main functions.
 */

import {
  VERSION, BLOATED_KEY_PATTERNS, LOG_STORAGE_KEY, LOG_MAX_ENTRIES,
  WS_HISTORY_KEY, WS_SHARED_KEY, WS_HISTORY_MAX_ENTRIES, CONFIG,
  activityLogLines, activityLogVisible, maxActivityLines, setActivityLogVisible,
  loopCreditState,
  cLogDefault, cLogError, cLogInfo, cLogSuccess, cLogDebug, cLogWarn,
  cLogDelegate, cLogCheck, cLogSkip, cLogTimestamp,
  tFont, tFontSm,
} from './shared-state';
import { shouldLog, shouldConsole, shouldPersist, shouldActivityUi } from './log-manager';

// ============================================
// Quota-safe localStorage wrapper
// ============================================
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    const isQuotaError = (
      e instanceof DOMException &&
      (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );
    if (!isQuotaError) return false;

    console.warn('[MacroLoop] localStorage quota exceeded — scanning for bloated keys to purge');
    let purged = 0;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      for (let p = 0; p < BLOATED_KEY_PATTERNS.length; p++) {
        if (k.indexOf(BLOATED_KEY_PATTERNS[p]) !== -1) {
          const size = (localStorage.getItem(k) || '').length;
          console.warn('[MacroLoop] Purging bloated key: "' + k + '" (size=' + size + ')');
          localStorage.removeItem(k);
          purged++;
          break;
        }
      }
    }

    if (purged > 0) {
      try {
        localStorage.setItem(key, value);
        console.log('[MacroLoop] Retry succeeded after purging ' + purged + ' bloated key(s)');
        return true;
      } catch (_e2) {
        console.error('[MacroLoop] Retry failed even after purging — clearing all localStorage');
        localStorage.clear();
        try { localStorage.setItem(key, value); return true; } catch (_e3) { return false; }
      }
    } else {
      console.error('[MacroLoop] Quota exceeded but no bloated keys found — clearing all localStorage');
      localStorage.clear();
      try { localStorage.setItem(key, value); return true; } catch (_e4) { return false; }
    }
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

export function getProjectNameFromDom(): string | null {
  const xp = CONFIG.PROJECT_NAME_XPATH;
  if (!xp || xp.charAt(0) === '_') return null;
  try {
    const el = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (el) {
      const text = (el.textContent || '').trim();
      if (text) return text;
    }
  } catch (_e) { /* XPath error */ }
  return null;
}

export function getDisplayProjectName(): string {
  const domName = getProjectNameFromDom();
  if (domName) return domName;
  const titleMatch = (document.title || '').match(/^(.+?)\s*[-–—]\s*(?:Lovable|lovable)/);
  if (titleMatch) return titleMatch[1].trim();
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
// Log Persistence — Batched writes (V2 Phase 04, Task 04.4)
// Queues log entries and flushes to localStorage every 1s max.
// ============================================
let _pendingLogEntries: Array<{ t: string; l: string; m: string; url: string }> = [];
let _logFlushTimer: ReturnType<typeof setTimeout> | null = null;
const LOG_FLUSH_INTERVAL_MS = 1000;

function _flushPendingLogs(): void {
  _logFlushTimer = null;
  if (_pendingLogEntries.length === 0) return;

  try {
    const key = getLogStorageKey();
    let logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs = logs.concat(_pendingLogEntries);
    if (logs.length > LOG_MAX_ENTRIES) {
      logs = logs.slice(logs.length - LOG_MAX_ENTRIES);
    }
    safeSetItem(key, JSON.stringify(logs));
  } catch (_e) { /* storage full or unavailable */ }

  _pendingLogEntries = [];
}

export function persistLog(level: string, message: string): void {
  const now = new Date();
  const timestamp = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  _pendingLogEntries.push({
    t: timestamp,
    l: level,
    m: message,
    url: window.location.pathname
  });

  if (!_logFlushTimer) {
    _logFlushTimer = setTimeout(_flushPendingLogs, LOG_FLUSH_INTERVAL_MS);
  }
}

/** Force flush any pending logs immediately (e.g., before page unload) */
export function flushLogs(): void {
  if (_logFlushTimer) {
    clearTimeout(_logFlushTimer);
  }
  _flushPendingLogs();
}

export function getAllLogs(): any[] {
  try {
    const key = getLogStorageKey();
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (_e) { return []; }
}

export function clearAllLogs(): void {
  try {
    const key = getLogStorageKey();
    localStorage.removeItem(key);
  } catch (_e) { /* ignore */ }
}

export function formatLogsForExport(): string {
  const logs = getAllLogs();
  const lines: string[] = [];
  lines.push('=== MacroLoop Logs ===');
  lines.push('Project URL: ' + window.location.href);
  lines.push('Exported at: ' + new Date().toISOString());
  lines.push('Total entries: ' + logs.length);
  lines.push('---');
  for (let i = 0; i < logs.length; i++) {
    const e = logs[i];
    lines.push('[' + e.t + '] [' + e.l + '] ' + e.m);
  }
  return lines.join('\n');
}

export function copyLogsToClipboard(): void {
  const text = formatLogsForExport();
  navigator.clipboard.writeText(text).then(function() {
    log('Copied ' + getAllLogs().length + ' log entries to clipboard', 'success');
  }).catch(function(err: any) {
    log('Clipboard copy failed: ' + err.message, 'warn');
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
// CSV Export: Workspace names + credits
// ============================================
function csvVal(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsvRow(ws: any): (string | number)[] {
  const r = ws.raw || {};
  const m = r.membership || {};
  return [
    csvVal(ws.fullName),
    csvVal(ws.id),
    csvVal(m.email || ''),
    csvVal(m.role || ws.role || ''),
    csvVal(r.plan || ''),
    csvVal(r.plan_type || ''),
    csvVal(ws.subscriptionStatus || r.subscription_status || ''),
    csvVal(r.subscription_currency || ''),
    csvVal(r.payment_provider || ''),
    ws.dailyFree,
    ws.dailyLimit,
    ws.dailyUsed,
    r.daily_credits_used_in_billing_period != null ? r.daily_credits_used_in_billing_period : '',
    ws.rollover,
    ws.rolloverLimit,
    ws.rolloverUsed,
    ws.billingAvailable,
    ws.limit,
    ws.used,
    ws.freeGranted,
    ws.freeRemaining,
    ws.topupLimit,
    r.topup_credits_used != null ? r.topup_credits_used : '',
    ws.totalCredits,
    ws.totalCreditsUsed != null ? ws.totalCreditsUsed : (r.total_credits_used != null ? r.total_credits_used : ''),
    r.total_credits_used_in_billing_period != null ? r.total_credits_used_in_billing_period : '',
    ws.available,
    r.backend_total_used_in_billing_period != null ? r.backend_total_used_in_billing_period : '',
    r.num_projects != null ? r.num_projects : '',
    r.referral_count != null ? r.referral_count : '',
    r.followers_count != null ? r.followers_count : '',
    csvVal(r.billing_period_start_date || ''),
    csvVal(r.billing_period_end_date || ''),
    csvVal(r.next_monthly_credit_grant_date || ''),
    csvVal(r.created_at || ''),
    csvVal(r.updated_at || ''),
    csvVal(r.owner_id || ''),
    r.mcp_enabled != null ? r.mcp_enabled : ''
  ];
}

const CSV_HEADER = [
  'Workspace Name', 'Workspace ID', 'Email', 'Role',
  'Plan', 'Plan Type', 'Subscription Status', 'Subscription Currency', 'Payment Provider',
  'Daily Free', 'Daily Limit', 'Daily Used', 'Daily Used In Billing',
  'Rollover', 'Rollover Limit', 'Rollover Used',
  'Billing Available', 'Billing Limit', 'Billing Used',
  'Granted', 'Granted Remaining', 'Topup Limit', 'Topup Used',
  'Total Credits', 'Total Credits Used', 'Total Used In Billing', 'Available Credits',
  'Backend Used In Billing',
  'Num Projects', 'Referral Count', 'Followers Count',
  'Billing Period Start', 'Billing Period End', 'Next Credit Grant Date',
  'Created At', 'Updated At',
  'Owner ID', 'MCP Enabled'
].join(',');

function downloadCsvBlob(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export: No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const sorted = workspaces.slice().sort(function(a: any, b: any) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const lines = [CSV_HEADER];
  for (let i = 0; i < sorted.length; i++) {
    lines.push(buildCsvRow(sorted[i]).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export: Downloaded ' + sorted.length + ' workspaces (sorted A→Z)', 'success');
}

export function exportAvailableWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export (available): No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const filtered = workspaces.filter(function(ws: any) {
    return (ws.available || 0) > 0;
  });

  if (filtered.length === 0) {
    log('CSV Export (available): No workspaces with available credits > 0', 'warn');
    return;
  }

  const sorted = filtered.slice().sort(function(a: any, b: any) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const lines = [CSV_HEADER];
  for (let i = 0; i < sorted.length; i++) {
    lines.push(buildCsvRow(sorted[i]).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-available-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export (available): Downloaded ' + sorted.length + '/' + workspaces.length + ' workspaces with credits > 0', 'success');
}

// ============================================
// Activity Log UI
// ============================================
let _logRenderedCount = 0;

export function addActivityLog(time: string | null, level: string, message: string, indent: number): void {
  const timestamp = time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const indentLevel = indent || 0;
  const entry = { time: timestamp, level: level, msg: message, indent: indentLevel };

  activityLogLines.push(entry);
  let didTrim = false;
  if (activityLogLines.length > maxActivityLines) {
    activityLogLines.shift();
    didTrim = true;
  }

  updateActivityLogUI(didTrim);
}

function _buildLogEntryHtml(entry: any): string {
  let color = cLogDefault;
  if (entry.level === 'ERROR' || entry.level === 'error') color = cLogError;
  else if (entry.level === 'INFO') color = cLogInfo;
  else if (entry.level === 'success') color = cLogSuccess;
  else if (entry.level === 'DEBUG') color = cLogDebug;
  else if (entry.level === 'WARN' || entry.level === 'warn') color = cLogWarn;
  else if (entry.level === 'delegate') color = cLogDelegate;
  else if (entry.level === 'check') color = cLogCheck;

  const indentPx = (entry.indent || 0) * 12;
  let html = '<div style="font-size:' + tFontSm + ';font-family:' + tFont + ';padding:2px 0;color:' + color + ';margin-left:' + indentPx + 'px;">';
  if (entry.indent && entry.indent > 0) {
    html += '<span style="color:' + cLogTimestamp + ';">' + entry.time + '</span> ';
  } else {
    html += '<span style="color:' + cLogTimestamp + ';">[' + entry.time + ']</span> ';
    html += '<span style="color:' + cLogDefault + ';">[' + entry.level + ']</span> ';
  }
  html += entry.msg;
  html += '</div>';
  return html;
}

export function updateActivityLogUI(didTrim: boolean): void {
  const logContainer = document.getElementById('loop-activity-log-content');
  if (!logContainer) return;

  const total = activityLogLines.length;
  if (total === 0) {
    logContainer.innerHTML = '<div style="color:' + cLogTimestamp + ';font-size:' + tFontSm + ';padding:8px;">No activity logs yet</div>';
    _logRenderedCount = 0;
    return;
  }

  if (didTrim || _logRenderedCount > total) {
    let html = '';
    for (let i = total - 1; i >= 0; i--) {
      html += _buildLogEntryHtml(activityLogLines[i]);
    }
    logContainer.innerHTML = html;
    _logRenderedCount = total;
    return;
  }

  const newCount = total - _logRenderedCount;
  if (newCount <= 0) return;

  const frag = document.createDocumentFragment();
  for (let j = total - 1; j >= total - newCount; j--) {
    const div = document.createElement('div');
    div.innerHTML = _buildLogEntryHtml(activityLogLines[j]);
    if (div.firstChild) frag.appendChild(div.firstChild);
  }
  logContainer.insertBefore(frag, logContainer.firstChild);
  _logRenderedCount = total;
}

export function toggleActivityLog(): void {
  setActivityLogVisible(!activityLogVisible);
  const logPanel = document.getElementById('loop-activity-log-panel');
  if (logPanel) {
    logPanel.style.display = activityLogVisible ? 'block' : 'none';
  }
}

// ============================================
// Main Log Functions
// ============================================
export function log(msg: string, type?: string): void {
  if (!shouldLog(type || 'info')) return;

  if (shouldConsole()) {
    const prefix = '[MacroLoop v' + VERSION + '] ';
    let style = 'color: ' + cLogDefault + ';';
    if (type === 'success') style = 'color: ' + cLogSuccess + ';';
    if (type === 'error') style = 'color: ' + cLogError + '; font-weight: bold;';
    if (type === 'warn') style = 'color: ' + cLogWarn + ';';
    if (type === 'delegate') style = 'color: ' + cLogDelegate + ';';
    if (type === 'check') style = 'color: ' + cLogCheck + ';';
    if (type === 'skip') style = 'color: ' + cLogSkip + '; font-style: italic;';
    console.log('%c' + prefix + msg, style);
  }

  if (shouldActivityUi()) {
    addActivityLog(null, type || 'INFO', msg, 0);
  }
  if (shouldPersist()) {
    persistLog(type || 'INFO', msg);
  }
}

export function logSub(msg: string, indent?: number): void {
  if (!shouldLog('sub')) return;

  const level = indent || 1;
  let pad = '';
  for (let p = 0; p < level; p++) pad += '  ';

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
