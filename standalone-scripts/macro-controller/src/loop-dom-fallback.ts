/**
 * Loop DOM Fallback — DOM-based fallback strategies, direct moves, deprecated delegation
 *
 * Phase 5C split from loop-engine.ts.
 * See: spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log, logSub } from './logging';
import { LoopDirection } from './types';
import { MacroController } from './core/MacroController';
import { checkSystemBusy, closeProjectDialog, ensureProjectDialogOpen, isUserTypingInPrompt, pollForDialogReady } from './dom-helpers';
import { TIMING, state } from './shared-state';
import { logError } from './error-utils';

/** Shorthand for MacroController singleton */
function mc() { return MacroController.getInstance(); }

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
    navigator.clipboard.writeText(signal).catch(function(err) { logSub('Clipboard write failed: ' + (err instanceof Error ? err.message : String(err)), 1); });
  } catch (e) { logSub('Clipboard API unavailable: ' + (e instanceof Error ? e.message : String(e)), 1); }
}

// ============================================
// performDirectMove — Direct API move
// ============================================
export function performDirectMove(direction: LoopDirection): void {
  log('=== DIRECT API MOVE ' + direction.toUpperCase() + ' ===', 'delegate');
  logSub('v7.9.6: Using moveToAdjacentWorkspace() — no AHK delegation', 1);
  state.isDelegating = true;
  state.forceDirection = direction;
  state.delegateStartTime = Date.now();
  mc().updateUILight();

  try {
    // v1.74.1: moveAdjacent → moveToWorkspace now clears isDelegating on
    // completion (success or failure). No blind timeout needed.
    mc().workspaces.moveAdjacent(direction);
  } catch(err) {
    logError('Direct API move FAILED', '' + (err as Error).message);
    state.isDelegating = false;
    state.forceDirection = null;
    state.delegateStartTime = 0;
    mc().updateUILight();
  }
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
    logError('DOM Fallback', 'project button not found');
    return;
  }

  pollForDialogReady().then(function() {
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
      mc().updateUI();
      return;
    }

    log('DOM Fallback: No credit — moving via API', 'delegate');
    performDirectMove(state.direction);
  });
}

// ============================================
// forceSwitch — Immediate move without waiting
// ============================================
export function forceSwitch(direction: LoopDirection | string): void {
  if (state.isDelegating) {
    log('BLOCKED: Already moving, ignoring force ' + direction.toUpperCase(), 'warn');
    return;
  }
  log('=== FORCE ' + direction.toUpperCase() + ' ===', 'delegate');
  logSub('v7.9.6: Direct API move — no AHK delegation', 1);
  performDirectMove(direction as LoopDirection);
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
  mc().updateUILight();
}
