 
declare const chrome: { runtime: { sendMessage: (msg: unknown, cb?: (resp: unknown) => void) => void } };
/**
 * MacroLoop Controller — Thin Orchestrator (V2 Phase 02)
 *
 * This file is the IIFE entry point. All logic has been extracted into modules:
 * - Domain guard: startup-domain-guard.ts
 * - Idempotent check: startup-idempotent-check.ts
 * - Bootstrap: startup.ts
 * - Sub-managers: core/*.ts
 *
 * macro-looping.ts wires dependencies together and calls bootstrap().
 *
 * @see spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import { VERSION, loopCreditState, getLoopWsCheckedIds } from './shared-state';
import { log } from './logging';
import { initXPathUtils, hasXPathUtils, updateProjectButtonXPath, updateProgressXPath, updateWorkspaceXPath } from './xpath-utils';
import { resolveToken } from './auth';
import { fetchLoopCredits } from './credit-fetch';
import { autoDetectLoopCurrentWorkspace } from './workspace-detection';
import { createUI, PanelBuilderDeps } from './ui/panel-builder';
import { navigateLoopJsHistory, executeJs } from './ui/js-executor';
import { applyRenameTemplate, bulkRenameWorkspaces, undoLastRename, updateUndoBtnVisibility, getRenameDelayMs, setRenameDelayMs, cancelRename, getRenameHistory } from './workspace-rename';
import type { BulkRenameResults } from './types';
import { startLoop, stopLoop, forceSwitch, delegateComplete, runCheck, refreshStatus, startStatusRefresh, stopStatusRefresh } from './loop-engine';
import { moveToWorkspace } from './workspace-management';
import { setLoopInterval, destroyPanel } from './ui/ui-updaters';
import { bootstrap } from './startup';
import { timingStart, timingEnd } from './startup-timing';
import { MacroController, installWindowFacade } from './core/MacroController';
import { AuthManager } from './core/AuthManager';
import { CreditManager } from './core/CreditManager';
import { LoopEngine } from './core/LoopEngine';
import { UIManager } from './core/UIManager';
import { WorkspaceManager } from './core/WorkspaceManager';
import { nsWrite, getNamespace } from './api-namespace';
import { updateWsSelectionUI, triggerLoopMoveFromSelection, setLoopWsNavIndex, populateLoopWorkspaceDropdown, renderBulkRenameDialog, getLoopWsCompactMode, setLoopWsCompactMode, getLoopWsFreeOnly, setLoopWsFreeOnly, getLoopWsExpiredWithCredits, setLoopWsExpiredWithCredits, getLoopWsNavIndex } from './ws-selection-ui';
import { shouldInject } from './startup-domain-guard';
import { runIdempotentCheck } from './startup-idempotent-check';

import { Label } from './types';

(function macroLoopController() {
  'use strict';

  console.log('%c[MacroLoop v' + VERSION + '] IIFE entry — hostname: ' + window.location.hostname + ', href: ' + window.location.href.substring(0, 80), 'color: #a78bfa; font-weight: bold;');

  // ── Domain guard ──
  timingStart(Label.DomainGuard, 'Domain Guard');
  if (!shouldInject()) {
    timingEnd(Label.DomainGuard, 'error', 'Injection blocked');
    return;
  }
  timingEnd(Label.DomainGuard, 'ok');

  // ── Idempotent check (handles re-injection, version mismatch, SPA recovery) ──
  timingStart('idempotent', 'Idempotent Check');
  if (runIdempotentCheck() === 'abort') {
    timingEnd('idempotent', 'warn', 'Aborted (already injected)');
    return;
  }
  timingEnd('idempotent', 'ok');

  // ── Auth global ──
  nsWrite('api.auth.getToken', resolveToken);

  // ── Credit fetch wrapper ──
  const fetchLoopCreditsWithDetect = function(isRetry?: boolean) {
    fetchLoopCredits(isRetry, autoDetectLoopCurrentWorkspace);
  };
  nsWrite('api.credits.fetch', fetchLoopCreditsWithDetect);

  // ── Workspace API globals ──
  nsWrite('api.workspace.moveTo', moveToWorkspace);
  nsWrite('api.workspace.getRenameDelay', function() { return getRenameDelayMs(); });
  nsWrite('api.workspace.setRenameDelay', function(ms: number) { setRenameDelayMs(ms); });
  nsWrite('api.workspace.cancelRename', function() { cancelRename(); });
  nsWrite('api.workspace.undoRename', function() { undoLastRename(function(_r: unknown, done: boolean) { if (done) populateLoopWorkspaceDropdown(); }); });
  nsWrite('api.workspace.renameHistory', function() { return getRenameHistory(); });

  // ── Bulk rename global ──
  nsWrite('api.workspace.bulkRename', buildBulkRenameFn());

  // ── XPath init ──
  initXPathUtils();

  // ── Loop control globals ──
  nsWrite('api.workspace.forceSwitch', forceSwitch);
  nsWrite('api.ui.refreshStatus', refreshStatus);
  nsWrite('api.ui.startStatusRefresh', startStatusRefresh);
  nsWrite('api.ui.stopStatusRefresh', stopStatusRefresh);
  nsWrite('api.ui.destroy', destroyPanel);

  // ── Panel builder deps ──
  const panelBuilderDeps: PanelBuilderDeps = {
    startLoop, stopLoop, forceSwitch,
    fetchLoopCreditsWithDetect, autoDetectLoopCurrentWorkspace,
    updateProjectButtonXPath, updateProgressXPath, updateWorkspaceXPath,
    executeJs, navigateLoopJsHistory,
    populateLoopWorkspaceDropdown, updateWsSelectionUI, renderBulkRenameDialog,
    getRenameHistory, undoLastRename, updateUndoBtnVisibility,
    getLoopWsFreeOnly, setLoopWsFreeOnly,
    getLoopWsCompactMode, setLoopWsCompactMode,
    getLoopWsExpiredWithCredits, setLoopWsExpiredWithCredits,
    getLoopWsNavIndex, setLoopWsNavIndex,
    triggerLoopMoveFromSelection,
  };

  const createUIWrapper = function() { createUI(panelBuilderDeps); };

  // ── Persist factories for self-healing ──
  nsWrite('_internal.createUIWrapper', createUIWrapper);
  nsWrite('_internal.createUIManager', function() { const ui = new UIManager(); ui.setCreateFn(createUIWrapper); return ui; });
  nsWrite('_internal.createWorkspaceManager', function() { return new WorkspaceManager(); });
  nsWrite('_internal.createAuthManager', function() { return new AuthManager(); });
  nsWrite('_internal.createCreditManager', function() { return new CreditManager(); });
  nsWrite('_internal.createLoopEngine', function() { return new LoopEngine(); });

  // ── Wire sub-managers into MacroController singleton ──
  const mc = MacroController.getInstance();
  mc.registerAuth(new AuthManager());
  mc.registerCredits(new CreditManager());
  mc.registerLoop(new LoopEngine());
  mc.registerWorkspaces(new WorkspaceManager());
  const uiManager = new UIManager();
  uiManager.setCreateFn(createUIWrapper);
  mc.registerUI(uiManager);
  getNamespace();
  nsWrite('api.mc', mc);
  installWindowFacade();

  // ── Bootstrap ──
  bootstrap({
    fetchLoopCreditsWithDetect,
    setLoopInterval,
    forceSwitch,
    runCheck,
    delegateComplete,
    updateProjectButtonXPath,
    updateProgressXPath,
    hasXPathUtils: hasXPathUtils(),
  });
})();
//# sourceURL=macro-looping-v7.42.js

// ── Helpers (extracted to stay within function size limits) ──

function buildBulkRenameFn(): (template: string, prefix: string, suffix: string, startNum?: number | Record<string, number>) => void {
  return function(template: string, prefix: string, suffix: string, startNum?: number | Record<string, number>) {
    const checkedIds = Object.keys(getLoopWsCheckedIds());
    if (checkedIds.length === 0) {
      log('[Rename] No workspaces checked — select some first', 'warn');
      return;
    }
    const perWs = loopCreditState.perWorkspace || [];
    const entries = [];
    let seqIdx = 0;
    const starts = (typeof startNum === 'object' && startNum !== null)
      ? startNum
      : { dollar: startNum || 1, hash: startNum || 1, star: startNum || 1 };
    for (const ws of perWs) {
      if (getLoopWsCheckedIds()[ws.id]) {
        const newName = applyRenameTemplate(template || '', prefix || '', suffix || '', starts, seqIdx, ws.fullName || ws.name);
        entries.push({ wsId: ws.id, oldName: ws.fullName || ws.name, newName });
        seqIdx++;
      }
    }
    bulkRenameWorkspaces(entries, function(results: BulkRenameResults, done: boolean) {
      if (done) {
        log('[Rename] Bulk rename finished: ' + results.success + '/' + results.total + ' success', results.failed > 0 ? 'warn' : 'success');
        populateLoopWorkspaceDropdown();
      }
    });
  };
}
