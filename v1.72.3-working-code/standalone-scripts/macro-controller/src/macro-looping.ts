/* eslint-disable @typescript-eslint/no-unused-vars */
declare const chrome: any;
/**
 * MacroLoop Controller — TypeScript Migration (Step 2c)
 * IIFE wrapper removed. Vite re-wraps into IIFE at build time.
 * Shared state imported from shared-state.ts.
 * Source: 01-macro-looping.js (v7.38, 9113 lines)
 */


import {
  FILE_NAME, VERSION, creditBarWidthPx, resolvePreset,
  cPanelBg, cPanelBgAlt, cPanelBorder, cPanelFg, cPanelFgMuted, cPanelFgDim, cPanelText,
  cPrimary, cPrimaryLight, cPrimaryLighter, cPrimaryLightest, cPrimaryDark,
  cPrimaryGlow, cPrimaryGlowS, cPrimaryGlowSub, cPrimaryBorderA,
  cPrimaryBgA, cPrimaryBgAL, cPrimaryBgAS, cPrimaryHL,
  cAccPurple, cAccPurpleLight, cAccPink,
  cSuccess, cSuccessLight, cSuccessMuted, cWarning, cWarningLight, cWarningPale,
  cError, cErrorLight, cInfo, cInfoLight,
  cNeutral400, cNeutral500, cNeutral600, cNeutral700, cNeutral950,
  cCbBonus, cCbBilling, cCbRollover, cCbDaily, cCbAvail, cCbEmpty,
  cLogDefault, cLogError, cLogInfo, cLogSuccess, cLogDebug, cLogWarn, cLogDelegate, cLogCheck, cLogSkip, cLogTimestamp,
  cOrange, cCyan, cCyanLight, cSkyLight, cGreenBright,
  cBtnCheckBg, cBtnCheckFg, cBtnCheckGrad, cBtnCheckGlow,
  cBtnCreditBg, cBtnCreditFg, cBtnCreditGrad, cBtnCreditGlow,
  cBtnPromptBg, cBtnPromptFg, cBtnPromptGrad, cBtnPromptGlow,
  cBtnStartGrad, cBtnStartGlow, cBtnStopGrad, cBtnStopGlow,
  cBtnMenuBg, cBtnMenuFg, cBtnMenuHover, cBtnUtilBg, cBtnUtilBorder,
  cInputBg, cInputBorder, cInputFg, cModalBg, cModalBorder,
  cSectionBg, cSectionHeader, cSectionToggle, cSeparator,
  lPanelRadius, lPanelPadding, lPanelMinW, lPanelFloatW, lPanelShadow, lPanelFloatSh,
  lDropdownRadius, lDropdownShadow, lModalRadius, lModalShadow, lAboutGradient,
  tFont, tFontSystem, tFontSize, tFontSm, tFontTiny, tFontMicro,
  trFast, trNormal, trSlow,
  IDS, TIMING, CONFIG,
  autoAttachCfg, autoAttachTiming, autoAttachGroups,
  LOG_STORAGE_KEY, WS_HISTORY_KEY, WS_SHARED_KEY, LOG_MAX_ENTRIES, WS_HISTORY_MAX_ENTRIES, BLOATED_KEY_PATTERNS,
  activityLogVisible, activityLogLines, maxActivityLines, setActivityLogVisible,
  CREDIT_API_BASE, CREDIT_CACHE_TTL_S, loopCreditState,
  loopWsCheckedIds, loopWsLastCheckedIdx, setLoopWsCheckedIds, setLoopWsLastCheckedIdx,
  SESSION_BRIDGE_KEYS, LAST_SESSION_BRIDGE_SOURCE, setLastSessionBridgeSource,
  TOAST_MAX_VISIBLE, TOAST_AUTO_DISMISS_MS, TOAST_ERROR_AUTO_DISMISS_MS,
  toastQueue, toastContainerId, toastErrorStopTriggered, setToastErrorStopTriggered,
  state,
} from './shared-state';

import {
  log, logSub, safeSetItem, persistLog, getAllLogs, clearAllLogs,
  formatLogsForExport, copyLogsToClipboard, downloadLogs,
  exportWorkspacesAsCsv, exportAvailableWorkspacesAsCsv,
  addActivityLog, updateActivityLogUI, toggleActivityLog,
  getProjectIdFromUrl, getWsHistoryKey, getProjectNameFromDom, getDisplayProjectName, getLogStorageKey,
} from './logging';

import {
  hasXPathUtils, initXPathUtils, reactClick,
  getByXPath, getAllByXPath, findElement, ML_ELEMENTS,
  updateProjectButtonXPath, updateProgressXPath, updateWorkspaceXPath,
} from './xpath-utils';
import {
  resolveToken, refreshBearerTokenFromBestSource, updateAuthBadge,
  getBearerTokenFromSessionBridge, getBearerTokenFromCookie,
  requestTokenFromExtension, persistResolvedBearerToken, LAST_TOKEN_SOURCE,
  extractTokenFromAuthBridgeResponse, setLastTokenSource, markBearerTokenExpired, invalidateSessionBridgeKey,
} from './auth';
import {
  calcTotalCredits, calcAvailableCredits, calcFreeCreditAvailable,
  calcSegmentPercents, renderCreditBar,
} from './credit-api';
import {
  parseLoopApiResponse, fetchLoopCredits, fetchLoopCreditsAsync, syncCreditStateFromApi,
} from './credit-fetch';
import {
  autoDetectLoopCurrentWorkspace, detectWorkspaceViaProjectDialog,
  extractProjectIdFromUrl, closeProjectDialogSafe, detectWorkspaceFromDom,
} from './workspace-detection';
import { showToast, dismissToast, dismissAllToasts, setStopLoopCallback } from './toast';
import { createUI, PanelBuilderDeps } from './ui/panel-builder';
import {
  addLoopJsHistoryEntry, renderLoopJsHistory, navigateLoopJsHistory, executeJs,
} from './ui/js-executor';
import {
  renameWorkspace, applyRenameTemplate, bulkRenameWorkspaces,
  undoLastRename, updateUndoBtnVisibility, getRenameDelayMs,
  setRenameDelayMs, cancelRename, getRenameAvgOpMs, getRenameHistory,
  isRenameCancelled,
} from './workspace-rename';
import {
  startLoop, stopLoop, runCycle, runCycleDomFallback,
  performDirectMove, forceSwitch, delegateComplete, dispatchDelegateSignal,
  runCheck, refreshStatus, startStatusRefresh, stopStatusRefresh,
} from './loop-engine';
import {
  moveToWorkspace, moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached,
  updateLoopMoveStatus, verifyWorkspaceSessionAfterFailure,
} from './workspace-management';
import {
  isKnownWorkspaceName, fetchWorkspaceName, fetchWorkspaceNameFromNav,
  autoDiscoverWorkspaceNavElement, startWorkspaceObserver,
  triggerCreditCheckOnWorkspaceChange, addWorkspaceChangeEntry,
  getWorkspaceHistory, clearWorkspaceHistory,
} from './workspace-observer';
import {
  updateUI, updateProjectNameDisplay, updateStatus, updateButtons,
  updateRecordIndicator, animateBtn, attachButtonHoverFx, setLoopInterval, destroyPanel,
} from './ui/ui-updaters';
import { bootstrap } from './startup';
import { dualWrite, dualWriteAll, nsCall, nsRead } from './api-namespace';
import {
  handleWsCheckboxClick, updateWsSelectionUI, showWsContextMenu,
  removeWsContextMenu, startInlineRename, triggerLoopMoveFromSelection,
  setLoopWsNavIndex, buildLoopTooltipText, renderLoopWorkspaceList,
  populateLoopWorkspaceDropdown, renderBulkRenameDialog, removeBulkRenameDialog,
  getLoopWsCompactMode, setLoopWsCompactMode, getLoopWsFreeOnly, setLoopWsFreeOnly,
  getLoopWsNavIndex,
} from './ws-selection-ui';

(function macroLoopController() {
  'use strict';

  // v1.66: Top-level injection diagnostic — appears in DevTools console regardless of success/failure
  console.log('%c[MacroLoop v' + VERSION + '] IIFE entry — hostname: ' + window.location.hostname + ', href: ' + window.location.href.substring(0, 80), 'color: #a78bfa; font-weight: bold;');
  // Config, theme, constants, and IDs are now imported from shared-state.ts (module-level)

  // === Domain Guard: Prevent injection into DevTools or non-page contexts ===
  const currentHostname = window.location.hostname || '(empty)';
  const currentHref = window.location.href || '(empty)';
  const isPageContext = (
    currentHostname.indexOf('lovable.dev') !== -1 ||
    currentHostname.indexOf('lovable.app') !== -1 ||
    currentHostname.indexOf('lovableproject.com') !== -1 ||
    currentHostname === 'localhost'
  );
  if (!isPageContext && !window.__comboForceInject) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  href: ' + currentHref + '\n' +
      '  expected: *.lovable.dev | *.lovable.app | *.lovableproject.com | localhost\n' +
      '  cause: Script executed in DevTools context instead of page context.\n' +
      '  bypass: Set window.__comboForceInject = true before pasting.\n' +
      '  UI will NOT be injected here.'
    );
    return;
  }

  // IDS, TIMING, CONFIG imported from shared-state.ts (Step 2b)
  // Local aliases removed in Step 04c — use imported constants directly

  // ============================================
  // INIT: Idempotent — skip if already embedded
  // Flow: AHK checks marker first, injects macro-looping.js only if absent,
  //       then calls __loopStart(direction) separately.
  // ============================================
  // v7.25: Clear destroyed flag on fresh injection
  dualWrite('__loopDestroyed', '_internal.destroyed', false);

  const existingMarker = document.getElementById(IDS.SCRIPT_MARKER);
  if (existingMarker) {
    const existingVersion = existingMarker.getAttribute('data-version') || '';
    const isVersionMismatch = existingVersion !== VERSION;

    if (isVersionMismatch) {
      // v7.26: Version differs — force teardown and re-inject
      console.warn('[MacroLoop v' + VERSION + '] VERSION MISMATCH: existing=' + existingVersion + ' new=' + VERSION + ' — forcing re-injection');
      // Teardown: stop loops, remove UI, clear globals
      try { nsCall('__loopStop', 'api.loop.stop'); } catch(e) {}
      existingMarker.remove();
      const staleContainer = document.getElementById(IDS.CONTAINER);
      if (staleContainer) staleContainer.remove();
      // Phase 9D: No window.__* globals to clear — namespace is cleaned up via SDK
    } else if (nsRead('__loopStart', 'api.loop.start')) {
      const existingContainer = document.getElementById(IDS.CONTAINER);
      if (existingContainer) {
        // Same version, globals + UI intact — skip
        console.log('%c[MacroLoop v' + VERSION + '] Already embedded (marker=' + IDS.SCRIPT_MARKER + ') — skipping injection, UI and state intact', 'color: #10b981; font-weight: bold;');
        return; // Exit IIFE — no teardown, no re-creation
      }

      // Same version + globals intact, but UI container is missing (SPA DOM wipe/race)
      // First try lightweight recovery through existing controller instance.
      console.warn('[MacroLoop v' + VERSION + '] Marker+globals present but UI missing — attempting controller UI recovery');
      try {
        const existingController = nsRead('__mc', 'api.mc') as {
          ui?: { create?: () => void; update?: () => void };
        } | null;

        if (existingController && existingController.ui && typeof existingController.ui.create === 'function') {
          existingController.ui.create();
          if (typeof existingController.ui.update === 'function') {
            existingController.ui.update();
          }
        }
      } catch (e) {
        console.warn('[MacroLoop v' + VERSION + '] UI recovery via existing controller failed: ' + String(e));
      }

      if (document.getElementById(IDS.CONTAINER)) {
        console.log('%c[MacroLoop v' + VERSION + '] UI recovered without full re-bootstrap', 'color: #10b981; font-weight: bold;');
        return;
      }

      // Recovery failed — force full re-bootstrap.
      console.warn('[MacroLoop v' + VERSION + '] UI recovery failed — forcing full re-bootstrap');
      try { nsCall('__loopStop', 'api.loop.stop'); } catch (_e) {}
      existingMarker.remove();
    } else {
      // Marker exists but globals missing — previous injection crashed. Remove stale marker and re-init.
      console.warn('[MacroLoop v' + VERSION + '] Stale marker found (globals missing) — removing marker and re-initializing');
      existingMarker.remove();
      const staleContainer2 = document.getElementById(IDS.CONTAINER);
      if (staleContainer2) staleContainer2.remove();
    }
  }

  // ============================================
  // Logging module — imported from logging.ts (Step 2d)
  // Functions available: log, logSub, safeSetItem, persistLog, getAllLogs,
  //   clearAllLogs, formatLogsForExport, copyLogsToClipboard, downloadLogs,
  //   exportWorkspacesAsCsv, exportAvailableWorkspacesAsCsv,
  //   addActivityLog, updateActivityLogUI, toggleActivityLog,
  //   getProjectIdFromUrl, getWsHistoryKey, getProjectNameFromDom, getDisplayProjectName
  // ============================================

  // ============================================
  // XPathUtils integration: delegate reactClick to shared module
  // XPathUtils.js MUST be injected by AHK before macro-looping.js
  // ============================================
  // ============================================
  // Auth module — imported from auth.ts (Step 2g)
  // Functions: resolveToken, refreshBearerTokenFromBestSource, updateAuthBadge,
  //   getBearerTokenFromSessionBridge, getBearerTokenFromCookie,
  //   requestTokenFromExtension, persistResolvedBearerToken, LAST_TOKEN_SOURCE
  // ============================================

  // Expose for future API integration
  dualWrite('__loopGetBearerToken', 'api.auth.getToken', resolveToken);

  // ============================================
  // Credit API Config — reads from combo.js shared localStorage or uses defaults
  // Uses same API endpoint as combo.js for consistent credit data
  // ============================================
  // Credit API state, workspace rename state imported from shared-state.ts


  // ============================================
  // Credit fetch & parse — imported from credit-fetch.ts (Step 2, registry pattern)
  // Functions: parseLoopApiResponse, fetchLoopCredits, fetchLoopCreditsAsync, syncCreditStateFromApi
  // ============================================

  // Wrap fetchLoopCredits to pass autoDetectLoopCurrentWorkspace as callback
  function fetchLoopCreditsWithDetect(isRetry?: boolean) {
    fetchLoopCredits(isRetry, autoDetectLoopCurrentWorkspace);
  }
  dualWrite('__loopFetchCredits', 'api.credits.fetch', fetchLoopCreditsWithDetect);

  // ============================================
  // Workspace detection — imported from workspace-detection.ts (Step 2i)
  // Functions: autoDetectLoopCurrentWorkspace, detectWorkspaceViaProjectDialog,
  //   extractProjectIdFromUrl, closeProjectDialogSafe, detectWorkspaceFromDom
  // ============================================


  // ============================================
  // Workspace Move — imported from workspace-management.ts (Step 05c, registry pattern)
  // Functions: moveToWorkspace, moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached,
  //   updateLoopMoveStatus, verifyWorkspaceSessionAfterFailure
  // ============================================
  dualWrite('__loopMoveToWorkspace', 'api.workspace.moveTo', moveToWorkspace);

  dualWriteAll([
    ['__loopGetRenameDelay', 'api.workspace.getRenameDelay', function() { return getRenameDelayMs(); }],
    ['__loopSetRenameDelay', 'api.workspace.setRenameDelay', function(ms: number) { setRenameDelayMs(ms); }],
    ['__loopCancelRename', 'api.workspace.cancelRename', function() { cancelRename(); }],
    ['__loopUndoRename', 'api.workspace.undoRename', function() { undoLastRename(function(r: any, done: boolean) { if (done) populateLoopWorkspaceDropdown(); }); }],
    ['__loopRenameHistory', 'api.workspace.renameHistory', function() { return getRenameHistory(); }],
  ]);

  // Global API for bulk rename of checked workspaces
  // v7.31: Updated to pass startNums object for multi-variable support
  const _bulkRenameFn = function(template: string, prefix: string, suffix: string, startNum?: number | Record<string, number>) {
    const checkedIds = Object.keys(loopWsCheckedIds);
    if (checkedIds.length === 0) {
      log('[Rename] No workspaces checked — select some first', 'warn');
      return;
    }
    let perWs = loopCreditState.perWorkspace || [];
    let entries = [];
    let seqIdx = 0;
    const starts = (typeof startNum === 'object' && startNum !== null)
      ? startNum
      : { dollar: startNum || 1, hash: startNum || 1, star: startNum || 1 };
    for (let i = 0; i < perWs.length; i++) {
      if (loopWsCheckedIds[perWs[i].id]) {
        const newName = applyRenameTemplate(template || '', prefix || '', suffix || '', starts, seqIdx, perWs[i].fullName || perWs[i].name);
        entries.push({ wsId: perWs[i].id, oldName: perWs[i].fullName || perWs[i].name, newName: newName });
        seqIdx++;
      }
    }
    bulkRenameWorkspaces(entries, function(results: any, done: boolean) {
      if (done) {
        log('[Rename] Bulk rename finished: ' + results.success + '/' + results.total + ' success', results.failed > 0 ? 'warn' : 'success');
        populateLoopWorkspaceDropdown();
      }
    });
  };
  dualWrite('__loopBulkRename', 'api.workspace.bulkRename', _bulkRenameFn);
  // Workspace selection UI — moved to ws-selection-ui.ts (Step 2c)
  // Functions: handleWsCheckboxClick, updateWsSelectionUI, showWsContextMenu,
  //   removeWsContextMenu, startInlineRename, triggerLoopMoveFromSelection,
  //   setLoopWsNavIndex, buildLoopTooltipText, renderLoopWorkspaceList,
  //   populateLoopWorkspaceDropdown
  // XPathUtils init + reactClick imported from xpath-utils.ts (Step 2e)
  initXPathUtils();

  // v7.20: Mark bearer token as expired — log-only, no UI injection (cookie is auto-resolved)
  // markBearerTokenExpired now imported from auth.ts (Step 2i)
  // ============================================
  // Loop State
  // ============================================
  // state object now imported from shared-state.ts (Step 2i)

  // ============================================
  // Toast system — imported from toast.ts (Step 2j)
  // Functions: showToast, dismissToast, dismissAllToasts
  // ============================================

  // Workspace observer functions — imported from workspace-observer.ts (Step 2a)
  // Functions: isKnownWorkspaceName, fetchWorkspaceName, fetchWorkspaceNameFromNav,
  //   autoDiscoverWorkspaceNavElement, startWorkspaceObserver,
  //   triggerCreditCheckOnWorkspaceChange, addWorkspaceChangeEntry,
  //   getWorkspaceHistory, clearWorkspaceHistory

  // ============================================
  // XPath Utility Functions — imported from xpath-utils.ts (Step 2e)
  // Functions: getByXPath, getAllByXPath, findElement, ML_ELEMENTS
  // ============================================

  // isOnProjectPage, isUserTypingInPrompt, checkSystemBusy — moved to dom-helpers.ts (Step 2)


  // checkSystemBusy, pollForDialogReady, closeProjectDialog, ensureProjectDialogOpen,
  // clickProjectButton, highlightElement — moved to dom-helpers.ts (Step 2)


  // ============================================
  // ============================================
  // Loop engine — imported from loop-engine.ts (Step 2, registry pattern)
  // Functions: runCheck, dispatchDelegateSignal, performDirectMove,
  //   startLoop, stopLoop, runCycle, runCycleDomFallback, forceSwitch,
  //   delegateComplete, refreshStatus, startStatusRefresh, stopStatusRefresh
  // ============================================
  // ============================================
  // UI Update Functions — moved to ui/ui-updaters.ts (Step 2b)
  // ============================================

  // Loop control, force switch, status refresh — dual-write (Issue 79)
  dualWriteAll([
    ['__forceSwitch', 'api.workspace.forceSwitch', forceSwitch],
    ['__refreshStatus', 'api.ui.refreshStatus', refreshStatus],
    ['__startStatusRefresh', 'api.ui.startStatusRefresh', startStatusRefresh],
    ['__stopStatusRefresh', 'api.ui.stopStatusRefresh', stopStatusRefresh],
    ['__loopDestroy', 'api.ui.destroy', destroyPanel],
  ]);

  // ============================================
  // createUI — delegated to ui/panel-builder.ts (Step 2f)
  // ============================================
  const panelBuilderDeps: PanelBuilderDeps = {
    startLoop, stopLoop, forceSwitch,
    fetchLoopCreditsWithDetect, autoDetectLoopCurrentWorkspace,
    updateProjectButtonXPath, updateProgressXPath, updateWorkspaceXPath,
    executeJs, navigateLoopJsHistory,
    populateLoopWorkspaceDropdown, updateWsSelectionUI, renderBulkRenameDialog,
    getRenameHistory, undoLastRename, updateUndoBtnVisibility,
    getLoopWsFreeOnly, setLoopWsFreeOnly,
    getLoopWsCompactMode, setLoopWsCompactMode,
    getLoopWsNavIndex, setLoopWsNavIndex,
    triggerLoopMoveFromSelection,
  };

  function createUIWrapper() {
    createUI(panelBuilderDeps);
  }

   // (Registry registrations removed — all consumers use MacroController directly)
  // ============================================
  // Initialize — delegated to startup.ts (Step 2h)
  // ============================================
  bootstrap({
    createUI: createUIWrapper,
    fetchLoopCreditsWithDetect: fetchLoopCreditsWithDetect,
    setLoopInterval: setLoopInterval,
    forceSwitch: forceSwitch,
    runCheck: runCheck,
    delegateComplete: delegateComplete,
    updateProjectButtonXPath: updateProjectButtonXPath,
    updateProgressXPath: updateProgressXPath,
    destroyPanel: destroyPanel,
    hasXPathUtils: hasXPathUtils,
  });
})();
// IIFE wrapper removed from outer scope — Vite re-wraps at build time
//# sourceURL=macro-looping-v7.41.js
