/**
 * MacroLoop Controller — Toast Notification System
 * Phase 6: Refactored to class-based encapsulation (CQ11–CQ18)
 *
 * Thin delegation layer to `window.marco.notify` (SDK).
 * All toast rendering, deduplication, and stacking is handled by the SDK.
 * This module preserves the original export signatures so all existing
 * consumers continue to work without changes.
 *
 * @see spec/17-app-issues/85-sdk-notifier-config-seeding-database-overhaul.md
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md
 *
 * Conversion (CQ10):
 *   Before: 6 module-level `let` vars, C-style for loops, inline .push()/.shift()/.pop() on globals.
 *   After:  `ToastManager` class with private state, `for-of` loops, no mutable module-level state.
 */

import { pushOverlayError } from './ui/error-overlay';
import { logDebug } from './error-utils';

import { VERSION } from './shared-state';
import { log } from './logging';

// ============================================
// Types (re-exported for consumer compatibility)
// ============================================

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

export interface RecentError {
  timestamp: string;
  level: string;
  message: string;
  stack?: string;
  requestDetail?: RequestDetail;
}

// ============================================
// SDK notify accessor
// ============================================

interface MarcoNotify {
  toast(message: string, level?: string, opts?: ToastOpts): void;
  dismissAll(): void;
  onError(callback: (error: RecentError) => void): void;
  getRecentErrors(): RecentError[];
  _setStopLoopCallback(fn: () => void): void;
  _setVersion(v: string): void;
}

function getNotify(): MarcoNotify | null {
  try {
    const m = window.marco;
    const notify = m?.notify as MarcoNotify | undefined;
    const hasToast = notify !== undefined && typeof notify.toast === 'function';

    if (hasToast) {
      return notify!;
    }
  } catch {
    /* SDK not loaded */
  }

  return null;
}

// ============================================
// QueuedToast type
// ============================================

interface QueuedToast {
  readonly message: string;
  readonly level: string;
  readonly opts?: ToastOpts;
  readonly queuedAt: number;
}

// ============================================
// ToastManager — All mutable state encapsulated
// ============================================

import { RECENT_ERRORS_MAX, TOAST_QUEUE_MAX, TOAST_QUEUE_POLL_MS, TOAST_QUEUE_TTL_MS } from './constants';

class ToastManager {
  private isVersionSeeded = false;
  private pendingStopLoopFn: (() => void) | null = null;
  private queueDrainTimer: ReturnType<typeof setInterval> | null = null;
  private readonly toastQueue: QueuedToast[] = [];
  private readonly errorChangeListeners: Array<() => void> = [];

  /**
   * Publicly accessible recent errors array.
   * Kept as a mutable array for backward compatibility with consumers
   * that read `recentErrors` directly (e.g., tools-sections-builder.ts).
   */
  readonly recentErrors: RecentError[] = [];

  // ── Version seeding ──

  private ensureVersion(): void {
    if (this.isVersionSeeded) {
      return;
    }

    const notify = getNotify();
    const hasSetVersion = notify !== null && notify._setVersion !== undefined;

    if (hasSetVersion) {
      notify!._setVersion(VERSION);
      this.isVersionSeeded = true;
    }
  }

  // ── Recent errors management ──

  onRecentErrorsChange(fn: () => void): void {
    this.errorChangeListeners.push(fn);

    const notify = getNotify();
    const hasNotify = notify !== null;

    if (hasNotify) {
      notify!.onError(() => {
        this.syncRecentErrors();
        fn();
      });
    }
  }

  private syncRecentErrors(): void {
    const notify = getNotify();
    const hasNoNotify = notify === null;

    if (hasNoNotify) {
      return;
    }

    const sdkErrors = notify!.getRecentErrors();
    this.recentErrors.length = 0;

    for (const error of sdkErrors) {
      this.recentErrors.push(error);
    }
  }

  private pushRecentError(entry: RecentError): void {
    this.recentErrors.unshift(entry);

    const isOverLimit = this.recentErrors.length > RECENT_ERRORS_MAX;

    if (isOverLimit) {
      this.recentErrors.pop();
    }

    for (const listener of this.errorChangeListeners) {
      try {
        listener();
      } catch (_e) {
        logDebug('ToastManager', 'Error change listener threw: ' + (_e instanceof Error ? _e.message : String(_e)));
      }
    }
  }

  // ── Stop loop callback ──

  setStopLoopCallback(fn: () => void): void {
    this.pendingStopLoopFn = fn;

    const notify = getNotify();
    const hasCallback = notify !== null && notify._setStopLoopCallback !== undefined;

    if (hasCallback) {
      notify!._setStopLoopCallback(fn);
    }
  }

  // ── Toast queue (buffers while SDK loads) ──

  private enqueueToast(message: string, level: string, opts?: ToastOpts): void {
    const isQueueFull = this.toastQueue.length >= TOAST_QUEUE_MAX;

    if (isQueueFull) {
      this.toastQueue.shift();
    }

    this.toastQueue.push({ message, level, opts, queuedAt: Date.now() });
    this.startQueueDrain();
  }

  private startQueueDrain(): void {
    const isAlreadyDraining = this.queueDrainTimer !== null;

    if (isAlreadyDraining) {
      return;
    }

    this.queueDrainTimer = setInterval(() => this.drainQueue(), TOAST_QUEUE_POLL_MS);
  }

  private drainQueue(): void {
    const notify = getNotify();
    const hasNoNotify = notify === null;

    if (hasNoNotify) {
      return;
    }

    this.ensureVersion();
    this.flushPendingStopLoop(notify!);

    const now = Date.now();

    while (this.toastQueue.length > 0) {
      const item = this.toastQueue.shift()!;
      const isExpired = (now - item.queuedAt) > TOAST_QUEUE_TTL_MS;

      if (isExpired) {
        log('[Toast/queue] Dropped expired toast: ' + item.message.substring(0, 80), 'warn');
        continue;
      }

      notify!.toast(item.message, item.level, item.opts);
      log('[Toast/' + item.level + '] (queued) ' + item.message.substring(0, 150), resolveLogLevel(item.level));
    }

    this.stopQueueDrain();
  }

  private stopQueueDrain(): void {
    const hasTimer = this.queueDrainTimer !== null;

    if (hasTimer) {
      clearInterval(this.queueDrainTimer!);
      this.queueDrainTimer = null;
    }
  }

  private flushPendingStopLoop(notify: MarcoNotify): void {
    const hasPending = this.pendingStopLoopFn !== null && notify._setStopLoopCallback !== undefined;

    if (hasPending) {
      notify._setStopLoopCallback(this.pendingStopLoopFn!);
      this.pendingStopLoopFn = null;
    }
  }

  // ── Show toast ──

  show(message: string, level?: string, opts?: ToastOpts): void {
    const resolvedLevel = level || 'error';
    this.ensureVersion();

    const notify = getNotify();
    const hasNotify = notify !== null;

    if (hasNotify) {
      this.drainQueuedToasts(notify!);
      this.flushPendingStopLoop(notify!);
      notify!.toast(message, resolvedLevel, opts);
      log('[Toast/' + resolvedLevel + '] ' + message.substring(0, 150), resolveLogLevel(resolvedLevel));

      const isOverlayLevel = resolvedLevel === 'error';

      if (isOverlayLevel) {
        pushOverlayError('error', message, opts?.stack, 'toast');
      }

      return;
    }

    this.enqueueToast(message, resolvedLevel, opts);
    log('[Toast/' + resolvedLevel + '] (queued, SDK pending) ' + message.substring(0, 150), resolveLogLevel(resolvedLevel));

    const isOverlayLevelQueued = resolvedLevel === 'error';

    if (isOverlayLevelQueued) {
      pushOverlayError('error', message, opts?.stack, 'toast');
    }

    const isTrackable = resolvedLevel === 'error' || resolvedLevel === 'warn';

    if (isTrackable) {
      const timeStr = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      this.pushRecentError({
        timestamp: timeStr,
        level: resolvedLevel,
        message: message,
        stack: opts?.stack,
        requestDetail: opts?.requestDetail,
      });
    }
  }

  private drainQueuedToasts(_notify: MarcoNotify): void {
    const hasQueued = this.toastQueue.length > 0;

    if (hasQueued) {
      this.drainQueue();
    }
  }

  // ── Dismiss ──

  dismissAll(): void {
    const notify = getNotify();
    const hasNotify = notify !== null;

    if (hasNotify) {
      notify!.dismissAll();
    }
  }
}

// ============================================
// Helper
// ============================================

function resolveLogLevel(level: string): string {
  if (level === 'error') {
    return 'error';
  }

  if (level === 'warn') {
    return 'warn';
  }

  return 'check';
}

// ============================================
// Singleton instance
// ============================================

const toastManager = new ToastManager();

// ============================================
// Public API (backward-compatible exports)
// ============================================

/** Recent errors array — used by tools-sections-builder.ts */
export const recentErrors = toastManager.recentErrors;

export function onRecentErrorsChange(fn: () => void): void {
  toastManager.onRecentErrorsChange(fn);
}

export function formatRequestDetail(rd: RequestDetail): string {
  const lines: string[] = [];

  if (rd.method || rd.url) {
    lines.push('Request: ' + (rd.method || '?') + ' ' + (rd.url || '?'));
  }

  if (rd.headers) {
    for (const headerKey of Object.keys(rd.headers)) {
      const isAuthHeader = headerKey.toLowerCase() === 'authorization';
      const headerValue = isAuthHeader
        ? rd.headers[headerKey].substring(0, 20) + '...REDACTED'
        : rd.headers[headerKey];
      lines.push('  ' + headerKey + ': ' + headerValue);
    }
  }

  if (rd.body) {
    lines.push('Body: ' + rd.body.substring(0, 500));
  }

  if (rd.status != null) {
    lines.push('Response: HTTP ' + rd.status + (rd.statusText ? ' ' + rd.statusText : ''));
  }

  if (rd.responseBody) {
    lines.push('Response Body: ' + rd.responseBody.substring(0, 500));
  }

  return lines.join('\n');
}

export function setStopLoopCallback(fn: () => void): void {
  toastManager.setStopLoopCallback(fn);
}

export function showToast(message: string, level?: string, opts?: ToastOpts): void {
  toastManager.show(message, level, opts);
}

export function dismissToast(toast: HTMLElement & { _dismissed?: boolean; _dismissTimer?: ReturnType<typeof setTimeout> }): void {
  const isAlreadyDismissed = !toast || toast._dismissed === true;

  if (isAlreadyDismissed) {
    return;
  }

  toast._dismissed = true;

  if (toast._dismissTimer) {
    clearTimeout(toast._dismissTimer);
  }

  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  setTimeout(function () {
    const hasParent = toast.parentNode !== null;

    if (hasParent) {
      toast.parentNode!.removeChild(toast);
    }
  }, 300);
}

export function dismissAllToasts(): void {
  toastManager.dismissAll();
}

/** Export the manager for direct use by newer code. */
export { toastManager };
