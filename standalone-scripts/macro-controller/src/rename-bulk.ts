/**
 * MacroLoop Controller — Bulk Rename & Undo
 *
 * Encapsulates rename state (delay, cancellation, ETA, history) in a
 * singleton class to eliminate module-level mutable variables (CQ11/CQ17).
 *
 * @see .lovable/memory/features/macro-controller/bulk-rename-system.md
 */

import { log } from './logging';
import { showToast } from './toast';
import { loopCreditState, setLoopWsCheckedIds, setLoopWsLastCheckedIdx } from './shared-state';
import { hasForbidden } from './rename-forbidden-cache';
import { renameWorkspace } from './rename-api';
import type { BulkRenameEntry, BulkRenameResults, RenameStrategy } from './types';

import { MacroController } from './core/MacroController';
import { logError } from './error-utils';

function mc() { return MacroController.getInstance(); }

// ── Types ──

interface RenameHistoryEntry {
  timestamp: number;
  entries: Array<{ wsId: string; oldName: string; newName: string; success?: boolean; strategy?: RenameStrategy }>;
}

// ── Constants ──

const DEFAULT_DELAY_MS = 750;
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 10000;
const RENAME_OP_WINDOW = 5;
const RENAME_HISTORY_MAX = 20;
const MAX_CONSECUTIVE_FAILURES = 3;
const LS_HISTORY_KEY = 'ml_rename_history';

// ── Singleton Manager ──

export class BulkRenameManager {
  private static instance: BulkRenameManager | null = null;

  private delayMs: number = DEFAULT_DELAY_MS;
  private cancelled: boolean = false;
  private authRecoveryExhausted: boolean = false;
  private avgOpMs: number = 0;
  private opTimes: number[] = [];
  private history: RenameHistoryEntry[] = [];

  private constructor() {
    this.restoreHistory();
  }

  static getInstance(): BulkRenameManager {
    if (!BulkRenameManager.instance) {
      BulkRenameManager.instance = new BulkRenameManager();
    }

    return BulkRenameManager.instance;
  }

  // ── Delay ──

  getDelayMs(): number {
    return this.delayMs;
  }

  setDelayMs(ms: number): void {
    this.delayMs = Math.max(MIN_DELAY_MS, Math.min(MAX_DELAY_MS, parseInt(String(ms), 10) || DEFAULT_DELAY_MS));
    log('[Rename] Delay set to ' + this.delayMs + 'ms', 'info');
  }

  // ── Cancellation ──

  cancel(): void {
    this.cancelled = true;
    log('[Rename] Cancellation requested', 'warn');
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  // ── Auth Recovery Flag ──

  getAuthRecoveryExhausted(): boolean {
    return this.authRecoveryExhausted;
  }

  setAuthRecoveryExhausted(value: boolean): void {
    this.authRecoveryExhausted = value;
  }

  // ── Rolling ETA ──

  getAvgOpMs(): number {
    return this.avgOpMs;
  }

  private trackOpTime(startTime: number): void {
    const requestDuration = Date.now() - startTime;
    const updatedTimes = [...this.opTimes, requestDuration + this.delayMs];
    const isOverWindow = updatedTimes.length > RENAME_OP_WINDOW;

    if (isOverWindow) {
      updatedTimes.shift();
    }

    this.opTimes = updatedTimes;
    this.avgOpMs = Math.round(
      this.opTimes.reduce(function (a: number, b: number) { return a + b; }, 0) / this.opTimes.length,
    );
  }

  // ── History ──

  getHistory(): RenameHistoryEntry[] {
    return this.history;
  }

  private restoreHistory(): void {
    try {
      const saved = localStorage.getItem(LS_HISTORY_KEY);
      const hasSaved = saved !== null;

      if (hasSaved) {
        this.history = JSON.parse(saved!);
        log('[Rename] Restored ' + this.history.length + ' undo entries from localStorage', 'success');
      }
    } catch (_e: unknown) {
      log('[Rename] Failed to restore undo history: ' + (_e instanceof Error ? _e.message : String(_e)), 'warn');
    }
  }

  private persistHistory(): void {
    try {
      localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(this.history));
    } catch (_e: unknown) {
      log('[Rename] Failed to persist undo history: ' + (_e instanceof Error ? _e.message : String(_e)), 'warn');
    }
  }

  private saveHistoryEntry(successEntries: BulkRenameResults['successEntries']): void {
    const hasEntries = successEntries.length > 0;

    if (!hasEntries) {
      return;
    }

    const updated = [...this.history, { timestamp: Date.now(), entries: successEntries }];
    const isOverMax = updated.length > RENAME_HISTORY_MAX;

    if (isOverMax) {
      updated.shift();
    }

    this.history = updated;
    this.updateUndoBtnVisibility();
    this.persistHistory();
  }

  // ── Undo Button ──

  updateUndoBtnVisibility(): void {
    const undoBtn = document.getElementById('loop-ws-undo-btn');
    const isPresent = undoBtn !== null;

    if (!isPresent) {
      return;
    }

    const hasHistory = this.history.length > 0;
    undoBtn!.style.display = hasHistory ? 'inline-block' : 'none';

    if (hasHistory) {
      const last = this.history[this.history.length - 1];
      undoBtn!.title = 'Undo last rename (' + last.entries.length + ' workspaces, ' + new Date(last.timestamp).toLocaleTimeString() + ')';
    }
  }

  // ── Bulk Rename (CQ16: doNext converted to private method) ──

  bulkRename(
    entries: BulkRenameEntry[],
    onProgress: (results: BulkRenameResults, done: boolean) => void,
    forceRetry?: boolean,
  ): void {
    const forbiddenSkipped = forceRetry ? 0 : entries.filter(function (e: BulkRenameEntry) { return hasForbidden(e.wsId); }).length;
    const hasForbiddenSkips = forbiddenSkipped > 0;

    if (hasForbiddenSkips) {
      log('[Rename] ⛔ ' + forbiddenSkipped + ' workspace(s) in forbidden cache will be skipped', 'warn');
    }

    log('[Rename] === BULK RENAME START === (' + entries.length + ' workspaces, ' + forbiddenSkipped + ' forbidden, delay=' + this.delayMs + 'ms)', 'delegate');

    const results: BulkRenameResults = {
      success: 0, failed: 0, skipped: 0, total: entries.length,
      successEntries: [], cancelled: false, strategies: {},
    };

    this.cancelled = false;
    this.authRecoveryExhausted = false;
    this.opTimes = [];
    this.avgOpMs = 0;

    this._doNextRename(0, entries, results, onProgress, forceRetry, 0);
  }

  // CQ16: Extracted from bulkRename closure → private method
  // eslint-disable-next-line max-lines-per-function
  private _doNextRename(
    idx: number,
    entries: BulkRenameEntry[],
    results: BulkRenameResults,
    onProgress: (results: BulkRenameResults, done: boolean) => void,
    forceRetry: boolean | undefined,
    consecutiveFailures: number,
  ): void {
    if (this.cancelled) {
      this.handleCancellation(results, idx, entries.length, onProgress);

      return;
    }

    const isComplete = idx >= entries.length;

    if (isComplete) {
      this.handleCompletion(results, onProgress);

      return;
    }

    const entry = entries[idx];
    const isForbidden = !forceRetry && hasForbidden(entry.wsId);

    if (isForbidden) {
      log('[Rename] ⛔ ' + (idx + 1) + '/' + entries.length + ' — "' + entry.oldName + '" SKIPPED (forbidden cache)', 'warn');
      results.skipped++;

      if (onProgress) {
        onProgress(results, false);
      }

      setTimeout(() => { this._doNextRename(idx + 1, entries, results, onProgress, forceRetry, consecutiveFailures); }, 50);

      return;
    }

    log('[Rename] ' + (idx + 1) + '/' + entries.length + ' — "' + entry.oldName + '" → "' + entry.newName + '"', 'check');
    const opStartTime = Date.now();

    renameWorkspace(entry.wsId, entry.newName, forceRetry).then((strategy: RenameStrategy) => {
      results.success++;
      const resetFailures = 0;
      results.strategies[strategy] = (results.strategies[strategy] || 0) + 1;
      results.successEntries.push({ wsId: entry.wsId, oldName: entry.oldName, newName: entry.newName, strategy: strategy });
      updatePerWorkspaceName(entry.wsId, entry.newName);

      const strategyTag = strategy !== 'normal' ? ' [' + strategy + ']' : '';
      log('[Rename] ✅ ' + (idx + 1) + '/' + entries.length + ' renamed: "' + entry.newName + '"' + strategyTag, 'success');
      this.trackOpTime(opStartTime);

      if (onProgress) {
        onProgress(results, false);
      }

      setTimeout(() => { this._doNextRename(idx + 1, entries, results, onProgress, forceRetry, resetFailures); }, this.delayMs);
    }).catch((err: Error) => {
      results.failed++;
      const newFailures = consecutiveFailures + 1;
      logError('Rename', '❌ ' + (idx + 1) + '/' + entries.length + ' failed: ' + err.message);
      this.trackOpTime(opStartTime);

      const isCircuitBroken = newFailures >= MAX_CONSECUTIVE_FAILURES;

      if (isCircuitBroken) {
        logError('Rename', '⚡ Circuit breaker: \' + MAX_CONSECUTIVE_FAILURES + \' consecutive failures — auto-stopping');
        showToast('Bulk rename auto-stopped after ' + MAX_CONSECUTIVE_FAILURES + ' consecutive failures', 'error', { noStop: true });
        this.cancelled = true;
      }

      if (onProgress) {
        onProgress(results, false);
      }

      setTimeout(() => { this._doNextRename(idx + 1, entries, results, onProgress, forceRetry, newFailures); }, this.delayMs);
    });
  }

  private handleCancellation(
    results: BulkRenameResults,
    idx: number,
    total: number,
    onProgress: (results: BulkRenameResults, done: boolean) => void,
  ): void {
    log('[Rename] === CANCELLED === at ' + idx + '/' + total + ' (' + results.success + ' success, ' + results.failed + ' failed)', 'warn');
    this.saveHistoryEntry(results.successEntries);
    results.cancelled = true;

    if (onProgress) {
      onProgress(results, true);
    }
  }

  private handleCompletion(
    results: BulkRenameResults,
    onProgress: (results: BulkRenameResults, done: boolean) => void,
  ): void {
    const strategyParts: string[] = [];

    for (const k in results.strategies) {
      strategyParts.push(k + ':' + results.strategies[k as RenameStrategy]);
    }

    const strategySummary = strategyParts.length > 0 ? ' | strategies: ' + strategyParts.join(', ') : '';
    const logLevel = results.failed > 0 ? 'warn' : 'success';
    log('[Rename] === BULK RENAME COMPLETE === ' + results.success + '/' + results.total + ' success, ' + results.failed + ' failed' + strategySummary, logLevel);

    this.saveHistoryEntry(results.successEntries);
    const hasSuccess = results.successEntries.length > 0;

    if (hasSuccess) {
      log('[Rename] Saved to undo history (' + results.successEntries.length + ' entries, stack depth=' + this.history.length + ')', 'success');
    }

    mc().credits.fetch(false);
    setLoopWsCheckedIds({});
    setLoopWsLastCheckedIdx(-1);

    if (onProgress) {
      onProgress(results, true);
    }
  }

  // ── Undo (CQ16: doNext converted to private method) ──

  undoLastRename(onProgress: (results: { success: number; failed: number; total: number }, done: boolean) => void): void {
    const hasNoHistory = this.history.length === 0;

    if (hasNoHistory) {
      log('[Rename] No rename history to undo', 'warn');

      return;
    }

    const last = this.history[this.history.length - 1];
    const reverseEntries: Array<{ wsId: string; oldName: string; newName: string }> = [];

    for (const entry of last.entries) {
      reverseEntries.push({
        wsId: entry.wsId,
        oldName: entry.newName,
        newName: entry.oldName!,
      });
    }

    log('[Rename] === UNDO RENAME === Reverting ' + reverseEntries.length + ' workspaces (from ' + new Date(last.timestamp).toLocaleTimeString() + ')', 'delegate');
    const results = { success: 0, failed: 0, total: reverseEntries.length };

    this._doNextUndo(0, reverseEntries, results, onProgress);
  }

  // CQ16: Extracted from undoLastRename closure → private method
  private _doNextUndo(
    idx: number,
    reverseEntries: Array<{ wsId: string; oldName: string; newName: string }>,
    results: { success: number; failed: number; total: number },
    onProgress: (results: { success: number; failed: number; total: number }, done: boolean) => void,
  ): void {
    const isComplete = idx >= reverseEntries.length;

    if (isComplete) {
      const logLevel = results.failed > 0 ? 'warn' : 'success';
      log('[Rename] === UNDO COMPLETE === ' + results.success + '/' + results.total + ' reverted', logLevel);
      const hasSuccess = results.success > 0;

      if (hasSuccess) {
        this.history = this.history.slice(0, -1);
        this.persistHistory();
        this.updateUndoBtnVisibility();
      }

      mc().credits.fetch(false);

      if (onProgress) {
        onProgress(results, true);
      }

      return;
    }

    const entry = reverseEntries[idx];
    log('[Rename] Undo ' + (idx + 1) + '/' + reverseEntries.length + ' — "' + entry.oldName + '" → "' + entry.newName + '"', 'check');

    renameWorkspace(entry.wsId, entry.newName).then(() => {
      results.success++;
      updatePerWorkspaceName(entry.wsId, entry.newName);

      if (onProgress) {
        onProgress(results, false);
      }

      this._doNextUndo(idx + 1, reverseEntries, results, onProgress);
    }).catch((err: Error) => {
      results.failed++;
      logError('Rename', 'Undo ❌ ' + (idx + 1) + '/' + reverseEntries.length + ' failed: ' + err.message);

      if (onProgress) {
        onProgress(results, false);
      }

      this._doNextUndo(idx + 1, reverseEntries, results, onProgress);
    });
  }
}

// ── Helper ──

function updatePerWorkspaceName(wsId: string, newName: string): void {
  const perWs = loopCreditState.perWorkspace || [];

  for (const ws of perWs) {
    const isMatch = ws.id === wsId;

    if (isMatch) {
      ws.fullName = newName;
      ws.name = newName;

      break;
    }
  }
}

// ── Facade functions (backward-compatible exports) ──

const mgr = () => BulkRenameManager.getInstance();

export function getRenameDelayMs(): number { return mgr().getDelayMs(); }
export function setRenameDelayMs(ms: number): void { mgr().setDelayMs(ms); }
export function cancelRename(): void { mgr().cancel(); }
export function isRenameCancelled(): boolean { return mgr().isCancelled(); }
export function getAuthRecoveryExhausted(): boolean { return mgr().getAuthRecoveryExhausted(); }
export function setAuthRecoveryExhausted(value: boolean): void { mgr().setAuthRecoveryExhausted(value); }
export function getRenameAvgOpMs(): number { return mgr().getAvgOpMs(); }
export function getRenameHistory(): RenameHistoryEntry[] { return mgr().getHistory(); }
export function updateUndoBtnVisibility(): void { mgr().updateUndoBtnVisibility(); }

export function bulkRenameWorkspaces(
  entries: BulkRenameEntry[],
  onProgress: (results: BulkRenameResults, done: boolean) => void,
  forceRetry?: boolean,
): void {
  mgr().bulkRename(entries, onProgress, forceRetry);
}

export function undoLastRename(onProgress: (results: { success: number; failed: number; total: number }, done: boolean) => void): void {
  mgr().undoLastRename(onProgress);
}
