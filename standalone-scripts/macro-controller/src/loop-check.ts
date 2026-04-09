/**
 * Loop Check — Manual workspace + credit detection (runCheck)
 *
 * Phase 5 split from loop-controls.ts.
 * Contains: runCheck flow (3-step dialog-based detection),
 *   workspace matching helpers, progress bar detection.
 *
 * Spec: spec/05-chrome-extension/60-check-button-spec.md
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log } from './logging';
import { logError } from './error-utils';
import { type WorkspaceCredit } from './types';
import { findElement, ML_ELEMENTS } from './xpath-utils';
import { fetchLoopCreditsAsync, syncCreditStateFromApi } from './credit-fetch';
import { MacroController } from './core/MacroController';
import { highlightElement } from './dom-helpers';
import { CONFIG, IDS, loopCreditState, state } from './shared-state';
import { closeProjectDialogSafe, detectWorkspaceViaProjectDialog } from './workspace-detection';

/** Shorthand for MacroController singleton */
function mc() { return MacroController.getInstance(); }

// ============================================
// CQ4: Extracted helpers for workspace matching
// ============================================

function normalizeWorkspaceName(name: string): string {
  return (name || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findExactWorkspaceMatch(name: string, wsList: WorkspaceCredit[]): WorkspaceCredit | null {
  const normalized = normalizeWorkspaceName(name);
  if (!normalized || !wsList || wsList.length === 0) return null;

  for (const ws of wsList) {
    const wsName = (ws.fullName || ws.name || '') as string;
    if (normalizeWorkspaceName(wsName) === normalized) { return ws; }
  }

  return null;
}

function restoreOnFailure(
  previousWsName: string,
  previousCurrentWs: WorkspaceCredit | null,
  wsList?: WorkspaceCredit[],
): void {
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

function syncCurrentWsFromName(wsList: WorkspaceCredit[]): void {
  if (!state.workspaceName || !wsList || wsList.length === 0) return;
  const matched = findExactWorkspaceMatch(state.workspaceName, wsList);
  if (matched) { loopCreditState.currentWs = matched; }
}

function doXPathDetect(
  wsList: WorkspaceCredit[],
  previousWsName: string,
  previousCurrentWs: WorkspaceCredit | null,
): Promise<Element | null> {
  log('Step 1: Clicking Project Button → opening dialog...', 'check');
  log('  XPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 'check');

  return detectWorkspaceViaProjectDialog('runCheck', wsList, true).then(function(dialogBtn: Element | null) {
    restoreOnFailure(previousWsName, previousCurrentWs, wsList);
    syncCurrentWsFromName(wsList);
    logDetectionResult();
    state.workspaceFromApi = false;
    return dialogBtn;
  });
}

function logDetectionResult(): void {
  if (state.workspaceName) {
    log('Step 2: ✅ Workspace detected = "' + state.workspaceName + '"', 'success');
  } else {
    logError('Step 2', '❌ No workspace matched from XPath = ' + CONFIG.WORKSPACE_XPATH);
  }
}

function runCheckInitialState(): { statusEl: HTMLElement | null; previousWsName: string; previousCurrentWs: WorkspaceCredit | null } {
  log('=== MANUAL CHECK START ===', 'check');
  log('Spec: spec/05-chrome-extension/60-check-button-spec.md', 'check');

  const statusEl = document.getElementById(IDS.STATUS);
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Checking...';
  }

  const previousWsName = state.workspaceName || '';
  const previousCurrentWs = loopCreditState.currentWs;
  state.workspaceFromApi = false;
  state.isManualCheck = true;

  return { statusEl, previousWsName, previousCurrentWs };
}

function buildDetectPromise(
  statusEl: HTMLElement | null,
  previousWsName: string,
  previousCurrentWs: WorkspaceCredit | null,
): Promise<Element | null> {
  const perWs = loopCreditState.perWorkspace || [];

  if (perWs.length > 0) {
    return doXPathDetect(perWs, previousWsName, previousCurrentWs);
  }

  log('No workspaces loaded — fetching credits first, then detecting via XPath...', 'warn');
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Fetching workspaces...';
  }

  return fetchLoopCreditsAsync().then(function() {
    const freshPerWs = loopCreditState.perWorkspace || [];
    if (freshPerWs.length === 0) {
      log('Credit fetch returned 0 workspaces — will try raw XPath text as workspace name', 'warn');
    }
    return doXPathDetect(freshPerWs, previousWsName, previousCurrentWs);
  }).catch(function(err: Error) {
    log('Credit fetch failed: ' + err.message + ' — detecting via XPath without workspace list', 'warn');
    return doXPathDetect([], previousWsName, previousCurrentWs);
  });
}

function processProgressBar(dialogBtn: Element | null): void {
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

  if (dialogBtn) {
    log('  Closing project dialog after Step 3...', 'check');
    closeProjectDialogSafe(dialogBtn);
  }

  syncCreditStateFromApi();
  state.workspaceFromApi = false;
  state.isManualCheck = false;
  mc().updateUI();
  log('=== MANUAL CHECK COMPLETE ===', 'check');
}

// ============================================
// Manual check (runCheck)
// ============================================
export function runCheck(): Promise<void> | undefined {
  const { statusEl, previousWsName, previousCurrentWs } = runCheckInitialState();
  const detectPromise = buildDetectPromise(statusEl, previousWsName, previousCurrentWs);

  return detectPromise
    .catch(function(err: Error) {
      restoreOnFailure(previousWsName, previousCurrentWs);
      logError('Detection failed', '' + (err && err.message ? err.message : String(err)));
      throw err;
    })
    .then(function(dialogBtn: Element | null) {
      return new Promise<void>(function(resolve) {
        setTimeout(function() {
          processProgressBar(dialogBtn);
          resolve();
        }, 100);
      });
    })
    .catch(function(finalErr: Error) {
      state.workspaceFromApi = false;
      state.isManualCheck = false;
      mc().updateUILight();
      throw finalErr;
    });
}
