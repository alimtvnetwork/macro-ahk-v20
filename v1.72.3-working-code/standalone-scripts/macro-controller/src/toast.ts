/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Toast Notification System
 * Step 2j: Extracted from macro-looping.ts
 *
 * Non-blocking dismissible toasts with copy support.
 * NEVER blocks UI — no modal overlays, no pointer-events:none on body.
 *
 * v7.39: Added toast deduplication to prevent toast storms (RCA-3 fix).
 * v1.56: Version in log prefix, reduced max visible toasts to prevent UI freeze.
 */

import {
  cError, cWarning, cWarningPale, cPrimaryDark, cInfo, cInfoLight,
  cSuccess, cSuccessLight,
  toastContainerId, toastQueue, TOAST_MAX_VISIBLE,
  TOAST_AUTO_DISMISS_MS, TOAST_ERROR_AUTO_DISMISS_MS,
  toastErrorStopTriggered, setToastErrorStopTriggered,
  state, VERSION,
} from './shared-state';
import { log } from './logging';

// Theme status colors (need raw access for bg variants)
let TSt_errorBg: string, TSt_errorPale: string, TSt_warningBg: string, TSt_successBg: string, TC_toast: Record<string, Record<string, string>>;
try {
  const themeRoot = window.__MARCO_THEME__ || {};
  let activeThemeKey = 'dark';
  try { const saved = localStorage.getItem('marco_theme_preset'); if (saved) activeThemeKey = saved; } catch(_e) { /* ignore */ }
  const theme = (themeRoot.presets && themeRoot.presets[activeThemeKey]) || themeRoot || {};
  const TC = theme.colors || {};
  const TSt = TC.status || {};
  TSt_errorBg = TSt.errorBg || '#4a1515';
  TSt_errorPale = TSt.errorPale || '#fca5a5';
  TSt_warningBg = TSt.warningBg || '#3d3d1e';
  TSt_successBg = TSt.successBg || '#1a3d33';
  TC_toast = TC.toast || {};
} catch(_e) {
  TSt_errorBg = '#4a1515'; TSt_errorPale = '#fca5a5';
  TSt_warningBg = '#3d3d1e'; TSt_successBg = '#1a3d33';
  TC_toast = {};
}

// Late-binding for stopLoop (set by macro-looping.ts after defining stopLoop)
let _stopLoopFn: (() => void) | null = null;
export function setStopLoopCallback(fn: () => void) { _stopLoopFn = fn; }

interface ToastColors {
  bg: string;
  border: string;
  icon: string;
  text: string;
}

export interface RequestDetail {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  status?: number;
  statusText?: string;
  responseBody?: string;
}

export interface ToastOpts {
  stack?: string;
  noStop?: boolean;
  requestDetail?: RequestDetail;
}

// ============================================
// Recent Errors Store (for Recent Errors panel)
// ============================================
export interface RecentError {
  timestamp: string;
  level: string;
  message: string;
  stack?: string;
  requestDetail?: RequestDetail;
}

const RECENT_ERRORS_MAX = 50;
export const recentErrors: RecentError[] = [];
let _recentErrorsChangeListeners: Array<() => void> = [];

export function onRecentErrorsChange(fn: () => void): void {
  _recentErrorsChangeListeners.push(fn);
}

function _pushRecentError(entry: RecentError): void {
  recentErrors.unshift(entry); // newest first
  if (recentErrors.length > RECENT_ERRORS_MAX) recentErrors.pop();
  for (let i = 0; i < _recentErrorsChangeListeners.length; i++) {
    try { _recentErrorsChangeListeners[i](); } catch(_e) { /* ignore */ }
  }
}

export function formatRequestDetail(rd: RequestDetail): string {
  const lines: string[] = [];
  if (rd.method || rd.url) lines.push('Request: ' + (rd.method || '?') + ' ' + (rd.url || '?'));
  if (rd.headers) {
    const hKeys = Object.keys(rd.headers);
    for (let i = 0; i < hKeys.length; i++) {
      const val = hKeys[i].toLowerCase() === 'authorization'
        ? rd.headers[hKeys[i]].substring(0, 20) + '...REDACTED'
        : rd.headers[hKeys[i]];
      lines.push('  ' + hKeys[i] + ': ' + val);
    }
  }
  if (rd.body) lines.push('Body: ' + rd.body.substring(0, 500));
  if (rd.status != null) lines.push('Response: HTTP ' + rd.status + (rd.statusText ? ' ' + rd.statusText : ''));
  if (rd.responseBody) lines.push('Response Body: ' + rd.responseBody.substring(0, 500));
  return lines.join('\n');
}

// ============================================
// Toast Deduplication (RCA-3 fix)
// Prevents duplicate toasts within a 5-second window
// See: spec/02-app-issues/authentication-freeze-and-retry-loop.md (RCA-3)
// ============================================
const _recentToasts: Map<string, number> = new Map();
const TOAST_DEDUP_MS = 5000;

// Cleanup old entries periodically (every 30s) to prevent memory leak
let _dedupCleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureDedupCleanup() {
  if (_dedupCleanupTimer) return;
  _dedupCleanupTimer = setInterval(function() {
    const now = Date.now();
    _recentToasts.forEach(function(timestamp, key) {
      if (now - timestamp > TOAST_DEDUP_MS * 2) {
        _recentToasts.delete(key);
      }
    });
    if (_recentToasts.size === 0 && _dedupCleanupTimer) {
      clearInterval(_dedupCleanupTimer);
      _dedupCleanupTimer = null;
    }
  }, 30000);
}

export function showToast(message: string, level?: string, opts?: ToastOpts): void {
  level = level || 'error';
  opts = opts || {};

  // v7.39: Deduplication — suppress identical toasts within TOAST_DEDUP_MS window
  const dedupKey = level + ':' + message;
  const lastShown = _recentToasts.get(dedupKey) || 0;
  if (Date.now() - lastShown < TOAST_DEDUP_MS) {
    log('[Toast/dedup] Suppressed duplicate: ' + message, 'debug');
    return;
  }
  _recentToasts.set(dedupKey, Date.now());
  ensureDedupCleanup();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const colors: Record<string, ToastColors> = {
    error:   { bg: TSt_errorBg, border: cError, icon: '❌', text: TSt_errorPale },
    warn:    { bg: TSt_warningBg, border: cWarning, icon: '⚠️', text: cWarningPale },
    info:    { bg: TC_toast.info ? (TC_toast.info.bg || cPrimaryDark) : cPrimaryDark, border: cInfo, icon: 'ℹ️', text: cInfoLight },
    success: { bg: TSt_successBg, border: cSuccess, icon: '✅', text: cSuccessLight }
  };
  const c = colors[level] || colors.error;

  let container = document.getElementById(toastContainerId);
  if (!container) {
    container = document.createElement('div');
    container.id = toastContainerId;
    container.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;display:flex;flex-direction:column;gap:6px;max-width:400px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div') as HTMLDivElement & {
    _rawMessage: string;
    _level: string;
    _time: string;
    _dismissTimer: ReturnType<typeof setTimeout>;
    _dismissed: boolean;
  };
  toast.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;font-family:monospace;font-size:11px;color:' + c.text + ';background:' + c.bg + ';border:1px solid ' + c.border + ';box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:auto;opacity:0;transform:translateX(20px);transition:all 0.3s ease;position:relative;';

  toast._rawMessage = message;
  toast._level = level;
  toast._time = timeStr;

  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'font-size:14px;flex-shrink:0;line-height:1;';
  iconSpan.textContent = c.icon;

  const bodyDiv = document.createElement('div');
  bodyDiv.style.cssText = 'flex:1;min-width:0;';

  const msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'word-break:break-word;padding-right:40px;';
  msgDiv.textContent = message;

  const timeDiv = document.createElement('div');
  timeDiv.style.cssText = 'font-size:9px;opacity:0.6;margin-top:2px;';
  timeDiv.textContent = 'v' + VERSION + ' @ ' + timeStr;

  bodyDiv.appendChild(msgDiv);
  bodyDiv.appendChild(timeDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'position:absolute;top:6px;right:6px;display:flex;gap:4px;align-items:center;';

  const copyBtn = document.createElement('button');
  copyBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:' + c.text + ';font-size:10px;padding:2px 6px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;line-height:1.2;';
  copyBtn.textContent = '📋';
  copyBtn.title = 'Copy error details';
  copyBtn.onmouseenter = function() { copyBtn.style.opacity = '1'; };
  copyBtn.onmouseleave = function() { copyBtn.style.opacity = '0.7'; };
  copyBtn.onclick = function(e: MouseEvent) {
    e.stopPropagation();
    let copyText = '[MacroLoop v' + VERSION + ' ' + (level || 'error').toUpperCase() + ' @ ' + timeStr + ']\n' + message;
    if (opts?.requestDetail) copyText += '\n\n' + formatRequestDetail(opts.requestDetail);
    if (opts?.stack) copyText += '\n\nStack:\n' + opts.stack;
    navigator.clipboard.writeText(copyText).then(function() {
      copyBtn.textContent = '✓';
      setTimeout(function() { copyBtn.textContent = '📋'; }, 1500);
    }).catch(function() {
      const ta = document.createElement('textarea');
      ta.value = copyText;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copyBtn.textContent = '✓'; } catch(_ex) { /* ignore */ }
      document.body.removeChild(ta);
      setTimeout(function() { copyBtn.textContent = '📋'; }, 1500);
    });
  };

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:' + c.text + ';font-size:12px;padding:1px 5px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;line-height:1.2;font-weight:bold;';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Dismiss';
  closeBtn.onmouseenter = function() { closeBtn.style.opacity = '1'; };
  closeBtn.onmouseleave = function() { closeBtn.style.opacity = '0.7'; };
  closeBtn.onclick = function(e: MouseEvent) {
    e.stopPropagation();
    dismissToast(toast);
  };

  actionsDiv.appendChild(copyBtn);
  actionsDiv.appendChild(closeBtn);

  toast.appendChild(iconSpan);
  toast.appendChild(bodyDiv);
  toast.appendChild(actionsDiv);

  container.appendChild(toast);
  toastQueue.push(toast);

  requestAnimationFrame(function() {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  const overflowCount = toastQueue.length - TOAST_MAX_VISIBLE;
  for (let i = 0; i < overflowCount; i++) {
    const oldestToast = toastQueue[0];
    if (!oldestToast) break;
    dismissToast(oldestToast);
  }

  const dismissMs = level === 'error' ? TOAST_ERROR_AUTO_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
  const dismissTimer = setTimeout(function() { dismissToast(toast); }, dismissMs);
  toast._dismissTimer = dismissTimer;

  // v7.38: On error-level toast, stop loop to prevent cascading failures
  if (level === 'error' && state.running && !toastErrorStopTriggered && !opts.noStop) {
    setToastErrorStopTriggered(true);
    log('[ErrorGuard] Error detected while loop running — stopping loop to prevent cascade', 'error');
    if (_stopLoopFn) _stopLoopFn();
    setTimeout(function() { setToastErrorStopTriggered(false); }, 5000);
  }

  // Push to recent errors store for the Recent Errors panel
  if (level === 'error' || level === 'warn') {
    _pushRecentError({
      timestamp: timeStr,
      level: level,
      message: message,
      stack: opts.stack,
      requestDetail: opts.requestDetail,
    });
  }

  log('[Toast/' + level + '] ' + message.substring(0, 150), level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'check'));
}

export function dismissToast(toast: HTMLElement & { _dismissed?: boolean; _dismissTimer?: ReturnType<typeof setTimeout> }): void {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  if (toast._dismissTimer) clearTimeout(toast._dismissTimer);

  // Remove from queue immediately to prevent overflow loops from spinning.
  const idx = toastQueue.indexOf(toast);
  if (idx !== -1) toastQueue.splice(idx, 1);

  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

export function dismissAllToasts(): void {
  const queue = toastQueue.slice();
  for (let i = 0; i < queue.length; i++) {
    dismissToast(queue[i]);
  }
}
