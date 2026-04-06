/**
 * Panel Builder — createUI extracted from macro-looping.ts (Step 2f)
 *
 * Constructs the main MacroLoop Controller panel: title bar, status,
 * button row, workspace dropdown, tools section, and keyboard handlers.
 * All external dependencies are injected via PanelBuilderDeps.
 */

import {
  VERSION, IDS, CONFIG,
  cPanelBg, cPanelBorder, cPanelFg,
  cPrimary, cPrimaryLight, cPrimaryGlowS, cPrimaryGlowSub,
  cNeutral400, cNeutral500,
  cBtnStartGrad, cBtnStartGlow, cBtnStopGrad, cBtnStopGlow,
  cBtnCreditGrad, cBtnCreditGlow,
  cBtnPromptGrad, cBtnPromptGlow,
  cWarningLight,
  cSectionBg,
  lPanelRadius, lPanelPadding, lPanelMinW, lPanelFloatW, lPanelShadow, lPanelFloatSh,
  lDropdownRadius, lDropdownShadow,
  tFont, tFontSize, tFontSm, tFontTiny, tFontMicro,
  trFast, trNormal,
  state, loopCreditState, loopWsCheckedIds,
} from '../shared-state';
import { log, getDisplayProjectName } from '../logging';
import { getByXPath } from '../xpath-utils';
import {
  resolveToken, refreshBearerTokenFromBestSource, updateAuthBadge, LAST_TOKEN_SOURCE,
  getSessionCookieNames, getLastBridgeOutcome,
} from '../auth';
import { recoverAuthOnce } from '../auth';
import { setRecordRefreshOutcome } from '../auth';
import { showToast } from '../toast';
import { dualWrite } from '../api-namespace';
import {
  createPanelLayoutCtx, enableFloating, setupDragListeners,
  startDragHandler, createResizeHandle, setupResizeListeners,
  toggleMinimize, restorePanel,
} from './panel-layout';
import { buildHamburgerMenu } from './menu-builder';
import { registerKeyboardHandlers } from './keyboard-handlers';
import { createCheckButton } from './check-button';
import { buildWsDropdownSection } from './ws-dropdown-builder';
import { buildToolsSections } from './tools-sections-builder';
import { createCountdownCtx, updateStartStopBtn } from './countdown';
import {
  PromptContext, sendToExtension, loadPromptsFromJson, getPromptsConfig,
  renderPromptsDropdown, openPromptCreationModal, setRevalidateContext,
  isPromptsCached,
} from './prompt-manager';
import {
  taskNextState, loadTaskNextSettings, saveTaskNextSettings,
  setupTaskNextCancelHandler,
} from './task-next-ui';
import { injectSavePromptButton } from './save-prompt';
import { createCollapsibleSection, createWsHistorySection, createAuthDiagRow, recordRefreshOutcome } from './sections';
import { showSettingsDialog } from './settings-ui';
import { buildHotReloadSection, checkAndRestoreReinjectState } from './hot-reload-section';
import { showAboutModal } from './about-modal';
import {
  updateUI, attachButtonHoverFx, destroyPanel,
} from './ui-updaters';
import {
  getWorkspaceHistory,
} from '../workspace-observer';
import { getWsHistoryKey } from '../logging';

// ============================================
// Dependencies interface — injected by macro-looping.ts
// ============================================

export interface PanelBuilderDeps {
  startLoop: (direction: string) => void;
  stopLoop: () => void;
  forceSwitch: (direction: string) => void;
  fetchLoopCreditsWithDetect: (isRetry?: boolean) => void;
  autoDetectLoopCurrentWorkspace: (token: string) => Promise<void>;
  updateProjectButtonXPath: (val: string) => void;
  updateProgressXPath: (val: string) => void;
  updateWorkspaceXPath: (val: string) => void;
  executeJs: () => void;
  navigateLoopJsHistory: (dir: string) => void;
  populateLoopWorkspaceDropdown: () => void;
  updateWsSelectionUI: () => void;
  renderBulkRenameDialog: () => void;
  getRenameHistory: () => any[];
  undoLastRename: (cb: (r: any, done: boolean) => void) => void;
  updateUndoBtnVisibility: () => void;
  getLoopWsFreeOnly: () => boolean;
  setLoopWsFreeOnly: (v: boolean) => void;
  getLoopWsCompactMode: () => boolean;
  setLoopWsCompactMode: (v: boolean) => void;
  getLoopWsNavIndex: () => number;
  setLoopWsNavIndex: (v: number) => void;
  triggerLoopMoveFromSelection: () => void;
}

// ============================================
// ============================================
// Helper: check if a JWT token is expired
// ============================================
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return (payload.exp * 1000) < Date.now();
  } catch (_e) {
    return true;
  }
}

// ============================================
// Helper: focus the current workspace in the workspace list after credit refresh
// See: spec/02-app-issues/credit-refresh/overview.md
// ============================================
function focusCurrentWorkspaceInList(): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const currentName = state.workspaceName;
  if (!currentName) {
    log('Credits: no current workspace name to focus', 'warn');
    return;
  }
  const currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
  if (currentItem) {
    currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (currentItem as HTMLElement).style.outline = '2px solid #F59E0B';
    setTimeout(function() { (currentItem as HTMLElement).style.outline = ''; }, 2000);
    log('Credits: ✅ Focused current workspace: ' + currentName, 'success');
  } else {
    log('Credits: current workspace item not found in list for "' + currentName + '"', 'warn');
  }
}

// ============================================
// createUI — main panel construction
// ============================================

let createUIRetryCount = 0;
const CREATE_UI_MAX_RETRIES = 5;

export function createUI(deps: PanelBuilderDeps): void {
  let container = getByXPath(CONFIG.CONTROLS_XPATH);
  if (!container) {
    createUIRetryCount++;
    log('UI container not found at XPath: ' + CONFIG.CONTROLS_XPATH + ' (attempt ' + createUIRetryCount + '/' + CREATE_UI_MAX_RETRIES + ')', 'warn');
    if (createUIRetryCount < CREATE_UI_MAX_RETRIES) {
      log('Retrying in 2 seconds...', 'warn');
      setTimeout(function() { createUI(deps); }, 2000);
      return;
    }
    log('XPath container not found after ' + CREATE_UI_MAX_RETRIES + ' retries — using BODY fallback (floating panel)', 'warn');
    container = document.body;
  }

  if (document.getElementById(IDS.CONTAINER)) {
    log('UI already exists in DOM');
    return;
  }

  // Inject keyframe animations
  const style = document.createElement('style');
  style.textContent = ''
    + '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}.loop-pulse{animation:pulse 1s infinite}'
    + '@keyframes marcoFadeIn{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}'
    + '@keyframes marcoScaleIn{0%{transform:scale(0.95);opacity:0}100%{transform:scale(1);opacity:1}}'
    + '@keyframes marcoSlideIn{0%{transform:translateX(100%)}100%{transform:translateX(0)}}'
    + '@keyframes marcoGlow{0%,100%{box-shadow:0 0 8px ' + cPrimaryGlowSub + '}50%{box-shadow:0 0 18px ' + cPrimaryGlowS + '}}'
    + '.marco-fade-in{animation:marcoFadeIn 0.3s ease-out}'
    + '.marco-scale-in{animation:marcoScaleIn 0.2s ease-out}'
    + '.marco-enter{animation:marcoFadeIn 0.3s ease-out,marcoScaleIn 0.2s ease-out}'
    + '.marco-glow{animation:marcoGlow 2s cubic-bezier(0.4,0,0.6,1) infinite}'
    + '.marco-hover-scale{transition:filter 150ms ease,background-color 150ms ease}'
    + '.marco-hover-scale:hover{filter:brightness(1.12)}'
    + '.marco-transition{transition:color ' + trFast + ',background-color ' + trFast + ',border-color ' + trFast + ',box-shadow ' + trFast + '}';
  document.head.appendChild(style);

  // Main UI container
  const ui = document.createElement('div');
  ui.id = IDS.CONTAINER;
  ui.style.cssText = 'background:' + cPanelBg + ';border:1px solid ' + cPanelBorder + ';border-radius:' + lPanelRadius + ';padding:' + lPanelPadding + ';margin:8px 0;font-family:' + tFont + ';font-size:' + tFontSize + ';color:' + cPanelFg + ';min-width:' + lPanelMinW + ';box-shadow:' + lPanelShadow + ';';
  ui.className = 'marco-enter';

  // Panel layout — drag, resize, minimize
  const plCtx = createPanelLayoutCtx(ui, lPanelFloatW, lPanelFloatSh, cPrimary);
  setupDragListeners(plCtx);
  setupResizeListeners(plCtx);

  ui.style.position = ui.style.position || 'relative';
  const cornerHandle = createResizeHandle(plCtx, 'corner');
  const bottomHandle = createResizeHandle(plCtx, 'bottom');
  ui.appendChild(cornerHandle);
  ui.appendChild(bottomHandle);

  let bodyElements: HTMLElement[] = plCtx.bodyElements;

  // ── Title Row ──
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:grab;user-select:none;padding:0 0 2px 0;';
  titleRow.title = 'Drag to move, click to minimize/expand';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;color:#E0E0E0;font-size:14px;flex-shrink:0;white-space:nowrap;transform:translateY(-2px);';
  title.textContent = 'TS Macro';

  const projectNameEl = document.createElement('div');
  projectNameEl.id = 'loop-project-name';
  projectNameEl.style.cssText = 'font-size:' + tFontTiny + ';color:#ffffff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;';
  projectNameEl.title = 'Project name (from DOM XPath)';
  projectNameEl.textContent = getDisplayProjectName();

  // Workspace name badge — auto-updates, click to re-detect
  const wsNameEl = document.createElement('div');
  wsNameEl.id = 'loop-title-ws-name';
  wsNameEl.style.cssText = 'font-size:' + tFontTiny + ';color:#fbbf24;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;cursor:pointer;border-bottom:1px dotted rgba(251,191,36,0.4);transition:color 0.15s;';
  wsNameEl.title = 'Current workspace — click to re-detect';
  wsNameEl.textContent = state.workspaceName || '⟳ detecting…';
  wsNameEl.onmouseenter = function() { wsNameEl.style.color = '#fde68a'; };
  wsNameEl.onmouseleave = function() { wsNameEl.style.color = '#fbbf24'; };
  wsNameEl.onclick = function(e: Event) {
    e.stopPropagation();
    wsNameEl.textContent = '⏳ detecting…';
    wsNameEl.style.color = '#9ca3af';
    const token = resolveToken();
    state.workspaceFromApi = false;
    deps.autoDetectLoopCurrentWorkspace(token).then(function() {
      wsNameEl.style.color = '#fbbf24';
      wsNameEl.textContent = state.workspaceName || '❌ unknown';
      if (state.workspaceName) {
        log('Title bar: ✅ Workspace re-detected: "' + state.workspaceName + '"', 'success');
        showToast('Workspace: ' + state.workspaceName, 'success');
      } else {
        log('Title bar: ❌ Workspace re-detection failed', 'warn');
      }
      updateUI();
    }).catch(function() {
      wsNameEl.style.color = '#f87171';
      wsNameEl.textContent = '❌ failed';
      setTimeout(function() {
        wsNameEl.style.color = '#fbbf24';
        wsNameEl.textContent = state.workspaceName || '⟳ detecting…';
      }, 2000);
    });
  };

  const versionSpan = document.createElement('span');
  versionSpan.style.cssText = 'font-size:' + tFontTiny + ';color:' + cPrimaryLight + ';margin-right:4px;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;';
  versionSpan.textContent = 'v' + VERSION;
  versionSpan.title = 'Click to see About info';
  versionSpan.onclick = function(e: Event) {
    e.stopPropagation();
    showAboutModal();
  };

  // Auth badge
  const authBadge = document.createElement('span');
  authBadge.id = 'loop-auth-badge';
  authBadge.style.cssText = 'font-size:8px;margin-right:8px;cursor:pointer;vertical-align:middle;transition:opacity 0.2s;';
  authBadge.textContent = '🔴';
  authBadge.title = 'Auth: no token — click to refresh';
  authBadge.addEventListener('click', function() {
    authBadge.style.opacity = '0.4';
    authBadge.title = 'Refreshing token…';
    log('Auth badge clicked — triggering manual token refresh', 'check');
    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      authBadge.style.opacity = '1';
      if (token) {
        log('Auth badge refresh: ✅ Token resolved from ' + source, 'success');
        updateAuthBadge(true, source);
        showToast('🟢 Token refreshed (' + source + ')', 'success');
      } else {
        log('Auth badge refresh: ❌ No token found', 'error');
        updateAuthBadge(false, 'none');
        showToast('🔴 Token refresh failed — please log in', 'warn');
      }
    });
  });
  const currentToken = resolveToken();
  if (currentToken) {
    authBadge.textContent = '🟢';
    authBadge.title = 'Auth: token available (' + (LAST_TOKEN_SOURCE || 'cached') + ') — click to refresh';
  }

  // Panel toggle (minimize)
  const panelToggleSpan = document.createElement('span');
  panelToggleSpan.style.cssText = 'font-size:' + tFontTiny + ';color:' + cNeutral500 + ';cursor:pointer;margin-right:4px;';
  panelToggleSpan.textContent = plCtx.panelState === 'minimized' ? '[ + ]' : '[ - ]';
  panelToggleSpan.title = 'Minimize / Expand panel';
  panelToggleSpan.onclick = function(e: Event) {
    e.stopPropagation();
    toggleMinimize(plCtx);
  };
  plCtx.panelToggleSpan = panelToggleSpan;

  // Close button
  const hideBtn = document.createElement('span');
  hideBtn.style.cssText = 'font-size:' + tFontTiny + ';color:' + cNeutral500 + ';cursor:pointer;';
  hideBtn.textContent = '[ x ]';
  hideBtn.title = 'Close and fully remove controller (re-inject to restore)';
  hideBtn.onclick = function(e: Event) {
    e.stopPropagation();
    destroyPanel();
  };

  // Drag handlers on title row
  titleRow.onpointerdown = function(e: PointerEvent) {
    if (e.target === hideBtn || e.target === panelToggleSpan) return;
    startDragHandler(plCtx, e);
  };
  titleRow.onpointerup = function(e: PointerEvent) {
    if (e.target === hideBtn || e.target === panelToggleSpan) return;
    const dx = Math.abs(e.clientX - plCtx.dragStartPos.x);
    const dy = Math.abs(e.clientY - plCtx.dragStartPos.y);
    if (dx < 5 && dy < 5) {
      toggleMinimize(plCtx);
    }
  };

  titleRow.appendChild(title);
  const titleSpacer = document.createElement('div');
  titleSpacer.style.cssText = 'flex:1;';
  titleRow.appendChild(titleSpacer);
  titleRow.appendChild(wsNameEl);
  const titleSep = document.createElement('span');
  titleSep.style.cssText = 'font-size:' + tFontTiny + ';color:' + cNeutral500 + ';margin:0 2px;user-select:none;';
  titleSep.textContent = '·';
  titleRow.appendChild(titleSep);
  titleRow.appendChild(projectNameEl);
  titleRow.appendChild(versionSpan);
  titleRow.appendChild(authBadge);
  titleRow.appendChild(panelToggleSpan);
  titleRow.appendChild(hideBtn);

  // ── Status bar ──
  const status = document.createElement('div');
  status.id = IDS.STATUS;
  status.style.cssText = 'font-family:' + tFont + ';font-size:' + tFontSm + ';padding:4px 6px;background:' + cSectionBg + ';border-radius:4px;color:' + cNeutral400 + ';';
  status.innerHTML = '<span style="color:' + cWarningLight + ';">⟳</span> Initializing... checking workspace &amp; credit status';

  // ── Info row ──
  const infoRow = document.createElement('div');
  infoRow.style.cssText = 'font-size:' + tFontMicro + ';color:' + cPrimaryLight + ';padding:2px 6px;background:' + cSectionBg + ';border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  infoRow.textContent = '1. Open Dialog -> 2. Check Credit -> 3. Double-Confirm -> 4. Delegate | Ctrl+Alt+Up/Down | Ctrl+Up/Down (Move) | Ctrl+Alt+H to hide';

  // ── Button row ──
  // See: spec/02-app-issues/63-button-layout-collapse-reload.md (RCA-3: enforce min-width)
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;padding:8px 4px;min-width:460px;';

  const btnStyle = 'padding:6px 14px;border:none;border-radius:8px;font-weight:600;font-size:' + tFontSm + ';cursor:pointer;transition:all ' + trNormal + ';line-height:1;height:34px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;';

  // Check button
  const checkResult = createCheckButton({ btnStyle, updateAuthBadge });
  const checkBtn = checkResult.checkBtn;

  // Start/Stop toggle
  const startStopWrap = document.createElement('div');
  startStopWrap.style.cssText = 'display:inline-flex;align-items:center;position:relative;';

  const startStopBtn = document.createElement('button');
  startStopBtn.id = IDS.START_BTN;
  startStopBtn.textContent = '▶';
  startStopBtn.title = 'Start loop';
  startStopBtn.style.cssText = btnStyle + 'background:' + cBtnStartGrad + ';color:#fff;border-radius:8px;min-width:36px;width:36px;font-size:14px;text-align:center;padding:6px 0;box-shadow:' + cBtnStartGlow + ';border:1px solid rgba(255,255,255,0.08);';
  startStopBtn.onmouseenter = function() { startStopBtn.style.filter = 'brightness(1.12)'; startStopBtn.style.boxShadow = '0 2px 8px rgba(0,200,83,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; };
  startStopBtn.onmouseleave = function() { startStopBtn.style.filter = ''; startStopBtn.style.boxShadow = cBtnStartGlow; };
  startStopBtn.onclick = function() {
    if (state.running) {
      deps.stopLoop();
    } else {
      deps.startLoop(state.direction);
    }
  };

  // Countdown badge
  const countdownBadge = document.createElement('span');
  countdownBadge.id = 'loop-countdown-badge';
  countdownBadge.style.cssText = 'display:none;align-items:center;justify-content:center;font-size:9px;font-family:' + tFont + ';font-weight:700;color:#fbbf24;background:rgba(0,0,0,0.6);padding:2px 6px;height:34px;border-radius:0 8px 8px 0;border-left:1px solid rgba(251,191,36,0.3);min-width:28px;text-align:center;pointer-events:none;';
  countdownBadge.textContent = '';

  startStopWrap.appendChild(startStopBtn);
  startStopWrap.appendChild(countdownBadge);

  const cdCtx = createCountdownCtx(startStopBtn, countdownBadge, function(d: string) { deps.startLoop(d); }, deps.stopLoop);
  dualWrite('__loopUpdateStartStopBtn', '_internal.updateStartStopBtn', function(running: boolean) { updateStartStopBtn(cdCtx, running); });
  updateStartStopBtn(cdCtx, !!state.running);

  // Credits button — with loading state, pre-flight auth validation, and workspace focus
  // See: spec/02-app-issues/credit-refresh/overview.md
  const creditBtn = document.createElement('button');
  creditBtn.textContent = '💰 Credits';
  creditBtn.title = 'Fetch credit status via API and refresh workspace bars';
  creditBtn.style.cssText = btnStyle + 'background:' + cBtnCreditGrad + ';color:#1a1a2e;font-size:' + tFontTiny + ';padding:6px 12px;box-shadow:' + cBtnCreditGlow + ';border:1px solid rgba(255,255,255,0.08);';
  creditBtn.onmouseenter = function() { creditBtn.style.filter = 'brightness(1.12)'; creditBtn.style.boxShadow = '0 2px 8px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; };
  creditBtn.onmouseleave = function() { creditBtn.style.filter = ''; creditBtn.style.boxShadow = cBtnCreditGlow; };

  let creditInFlight = false;
  creditBtn.onclick = function() {
    if (creditInFlight) {
      log('Credits: already in flight — ignoring duplicate click', 'warn');
      return;
    }
    creditInFlight = true;
    creditBtn.textContent = '⏳ Loading…';
    creditBtn.style.opacity = '0.7';
    creditBtn.style.pointerEvents = 'none';

    // Pre-flight: validate token before making the API call
    const existingToken = resolveToken();
    const tokenValid = existingToken && !isTokenExpired(existingToken);

    function proceedWithFetch() {
      deps.fetchLoopCreditsWithDetect(false);
      // Poll for completion — loopCreditState.lastCheckedAt updates on success
      const startedAt = Date.now();
      const pollTimer = setInterval(function() {
        const elapsed = Date.now() - startedAt;
        if (loopCreditState.lastCheckedAt > startedAt || elapsed > 15000) {
          clearInterval(pollTimer);
          creditInFlight = false;
          creditBtn.textContent = '💰 Credits';
          creditBtn.style.opacity = '1';
          creditBtn.style.pointerEvents = 'auto';
          // Focus current workspace in the list
          focusCurrentWorkspaceInList();
        }
      }, 500);
    }

    if (tokenValid) {
      log('Credits: ✅ Token valid — proceeding with fetch', 'success');
      proceedWithFetch();
    } else {
      // Silent auth recovery before fetch
      log('Credits: ⚠️ Token missing or expired — recovering silently…', 'warn');
      recoverAuthOnce().then(function(newToken: string) {
        if (newToken) {
          log('Credits: ✅ Auth recovered silently — proceeding', 'success');
        } else {
          log('Credits: ⚠️ Auth recovery returned no token — proceeding anyway (cookies may work)', 'warn');
        }
        proceedWithFetch();
      });
    }
  };

  // Prompts dropdown
  const promptsContainer = document.createElement('div');
  promptsContainer.style.cssText = 'position:relative;display:inline-block;';
  const promptsBtn = document.createElement('button');
  promptsBtn.textContent = '📋 Prompts';
  promptsBtn.title = 'Select a prompt to paste or copy';
  promptsBtn.style.cssText = btnStyle + 'background:' + cBtnPromptGrad + ';color:#fff;font-size:' + tFontTiny + ';padding:6px 12px;box-shadow:' + cBtnPromptGlow + ';border:1px solid rgba(255,255,255,0.08);';
  promptsBtn.onmouseenter = function() { promptsBtn.style.filter = 'brightness(1.15)'; promptsBtn.style.boxShadow = '0 0 20px rgba(0,198,255,0.55)'; };
  promptsBtn.onmouseleave = function() { promptsBtn.style.filter = ''; promptsBtn.style.boxShadow = cBtnPromptGlow; };
  const promptsDropdown = document.createElement('div');
  promptsDropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;min-width:220px;max-width:340px;max-height:280px;overflow-y:auto;background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:' + lDropdownRadius + ';z-index:100001;box-shadow:' + lDropdownShadow + ';margin-top:2px;';

  const promptCtx: PromptContext = { promptsDropdown: promptsDropdown };
  const taskNextDeps = { sendToExtension: sendToExtension, getPromptsConfig: getPromptsConfig, getByXPath: ((xpath: string) => getByXPath(xpath) as Element | null) as (xpath: string) => Element | null };
  loadTaskNextSettings(taskNextDeps);
  setupTaskNextCancelHandler();
  setRevalidateContext(promptCtx, taskNextDeps);

  // Pre-load prompts on injection so they're warm by first click
  // See: spec/02-app-issues/64-prompts-loading-when-cached.md
  loadPromptsFromJson(function() {
    log('Prompts pre-loaded on injection', 'success');
  });

  promptsBtn.onclick = function(e: Event) {
    e.stopPropagation();
    const isOpen = promptsDropdown.style.display !== 'none';
    promptsDropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      loadTaskNextSettings(taskNextDeps);
      if (isPromptsCached()) {
        // Prompts already in memory — render instantly, no loading indicator
        renderPromptsDropdown(promptCtx, taskNextDeps);
      } else {
        // Cold load — show loading indicator
        promptsDropdown.innerHTML = '';
        const loadingItem = document.createElement('div');
        loadingItem.style.cssText = 'padding:10px 16px;color:#9ca3af;font-size:13px;text-align:center;';
        loadingItem.textContent = '⏳ Loading prompts…';
        promptsDropdown.appendChild(loadingItem);
        loadPromptsFromJson(function(loaded: any) {
          renderPromptsDropdown(promptCtx, taskNextDeps);
        });
      }
    }
  };
  document.addEventListener('click', function() { promptsDropdown.style.display = 'none'; const sub = document.querySelector('[data-task-next-sub]') as HTMLElement | null; if (sub) sub.style.display = 'none'; });
  promptsContainer.appendChild(promptsBtn);
  promptsContainer.appendChild(promptsDropdown);

  // Hamburger menu
  const menuResult = buildHamburgerMenu({
    btnStyle: btnStyle,
    startLoop: deps.startLoop,
    stopLoop: deps.stopLoop,
  });
  const menuContainer = menuResult.menuContainer;
  const menuBtn = menuResult.menuBtn;

  // Save Prompt button
  const savePromptDeps = {
    getPromptsConfig: getPromptsConfig,
    getByXPath: ((xpath: string) => getByXPath(xpath) as Element | null) as (xpath: string) => Element | null,
    openPromptCreationModal: function(data: any) { openPromptCreationModal(promptCtx, taskNextDeps, null, data); },
    taskNextDeps: taskNextDeps,
  };
  injectSavePromptButton(savePromptDeps);

  // Assemble button row (Trace button moved to hamburger menu — Issue 82)
  btnRow.appendChild(checkBtn);
  btnRow.appendChild(startStopWrap);
  btnRow.appendChild(creditBtn);
  btnRow.appendChild(promptsContainer);
  btnRow.appendChild(menuContainer);

  [checkBtn, startStopBtn, creditBtn, promptsBtn, menuBtn].forEach(attachButtonHoverFx);

  // Tool sections
  const toolsSections = buildToolsSections({
    btnStyle, updateProjectButtonXPath: deps.updateProjectButtonXPath,
    updateProgressXPath: deps.updateProgressXPath,
    updateWorkspaceXPath: deps.updateWorkspaceXPath,
    executeJs: deps.executeJs, navigateLoopJsHistory: deps.navigateLoopJsHistory,
  });
  const jsBody = toolsSections.jsBody;

  // Workspace History
  const wsHistoryResult = createWsHistorySection({
    getWorkspaceHistory: getWorkspaceHistory,
    getDisplayProjectName: getDisplayProjectName,
    getWsHistoryKey: getWsHistoryKey,
  });
  const wsHistorySection = wsHistoryResult.section;

  // Auth Diagnostic Row
  const authDiagResult = createAuthDiagRow({
    getLastTokenSource: function() { return LAST_TOKEN_SOURCE; },
    resolveToken: resolveToken,
    recoverAuthOnce: recoverAuthOnce,
    getSessionCookieNames: getSessionCookieNames,
    getLastBridgeOutcome: getLastBridgeOutcome,
    refreshFromBestSource: refreshBearerTokenFromBestSource,
  });
  const authDiagRow = authDiagResult.row;
  dualWrite('__loopUpdateAuthDiag', '_internal.updateAuthDiag', authDiagResult.updateAuthDiagRow);
  setRecordRefreshOutcome(recordRefreshOutcome);

  // Workspace Dropdown
  const wsDropResult = buildWsDropdownSection({
    populateLoopWorkspaceDropdown: deps.populateLoopWorkspaceDropdown,
    updateWsSelectionUI: deps.updateWsSelectionUI,
    renderBulkRenameDialog: deps.renderBulkRenameDialog,
    getRenameHistory: deps.getRenameHistory,
    undoLastRename: deps.undoLastRename,
    updateUndoBtnVisibility: deps.updateUndoBtnVisibility,
    fetchLoopCreditsWithDetect: deps.fetchLoopCreditsWithDetect,
    autoDetectLoopCurrentWorkspace: deps.autoDetectLoopCurrentWorkspace,
    getLoopWsFreeOnly: deps.getLoopWsFreeOnly,
    setLoopWsFreeOnly: deps.setLoopWsFreeOnly,
    getLoopWsCompactMode: deps.getLoopWsCompactMode,
    setLoopWsCompactMode: deps.setLoopWsCompactMode,
    getLoopWsNavIndex: deps.getLoopWsNavIndex,
    setLoopWsNavIndex: deps.setLoopWsNavIndex,
    triggerLoopMoveFromSelection: deps.triggerLoopMoveFromSelection,
  });
  const wsDropSection = wsDropResult.wsDropSection;

  // Master collapsible: Tools & Logs
  const toolsCol = createCollapsibleSection('🔧 Tools & Logs', 'ml_collapse_tools_master');
  const toolsMasterBody = toolsCol.body;
  toolsMasterBody.style.cssText = 'margin-top:4px;display:flex;flex-direction:column;gap:4px;';
  toolsMasterBody.style.display = 'none';
  toolsCol.toggle.textContent = '[+]';

  // Settings gear button
  const settingsGearBtn = document.createElement('span');
  settingsGearBtn.textContent = '⚙️';
  settingsGearBtn.title = 'Open Settings';
  settingsGearBtn.style.cssText = 'font-size:12px;cursor:pointer;margin-left:auto;padding:2px 6px;border-radius:4px;transition:background 0.15s;';
  settingsGearBtn.onmouseenter = function() { settingsGearBtn.style.background = 'rgba(255,255,255,0.1)'; };
  settingsGearBtn.onmouseleave = function() { settingsGearBtn.style.background = 'none'; };
  const settingsDeps = { btnStyle: btnStyle, taskNextDeps: taskNextDeps, getPromptsConfig: getPromptsConfig, showToast: showToast, log: log, sendToExtension: sendToExtension };
  settingsGearBtn.onclick = function(e: Event) { e.stopPropagation(); showSettingsDialog(settingsDeps); };
  toolsCol.header.style.cssText += 'display:flex;align-items:center;';
  toolsCol.header.appendChild(settingsGearBtn);

  // Version mismatch badge (hidden by default, shown by hot-reload check)
  let _reinjectSection: HTMLElement | null = null;
  const versionBadge = document.createElement('span');
  versionBadge.style.cssText = 'display:none;font-size:9px;background:#e94560;color:#fff;padding:1px 5px;border-radius:8px;margin-left:6px;font-weight:700;line-height:1.2;animation:pulse 2s ease-in-out infinite;cursor:pointer;';
  versionBadge.onclick = function(e: Event) {
    e.stopPropagation();
    if (toolsMasterBody.style.display === 'none') {
      toolsMasterBody.style.display = '';
      toolsCol.toggle.textContent = '[-]';
      try { localStorage.setItem('ml_collapse_tools_master', 'expanded'); } catch(_e) {}
    }
    if (_reinjectSection) {
      setTimeout(function() { _reinjectSection!.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
    }
  };
  toolsCol.header.insertBefore(versionBadge, settingsGearBtn);

  toolsMasterBody.appendChild(wsHistorySection);
  toolsMasterBody.appendChild(toolsSections.xpathSection);
  toolsMasterBody.appendChild(toolsSections.activitySection);
  toolsMasterBody.appendChild(toolsSections.logSection);
  toolsMasterBody.appendChild(toolsSections.recentErrorsSection);
  toolsMasterBody.appendChild(toolsSections.jsSection);

  // Script Re-Inject section (Issue 77)
  const hotReloadResult = buildHotReloadSection(function(availVer: string) {
    versionBadge.textContent = 'v' + availVer;
    versionBadge.title = 'Click to jump to Script Re-Inject';
    versionBadge.style.display = '';
  });
  _reinjectSection = hotReloadResult.section;
  toolsMasterBody.appendChild(hotReloadResult.section);

  // Restore state if this is a re-inject recovery
  checkAndRestoreReinjectState();

  // Assembly
  plCtx.bodyElements = [status, infoRow, btnRow, authDiagRow, wsDropSection, toolsCol.section];

  ui.appendChild(titleRow);
  ui.appendChild(status);
  ui.appendChild(infoRow);
  ui.appendChild(btnRow);
  ui.appendChild(authDiagRow);
  ui.appendChild(wsDropSection);
  ui.appendChild(toolsCol.section);

  container.appendChild(ui);

  // Auto-float if body fallback
  if (container === document.body) {
    enableFloating(plCtx);
  }

  // Restore minimized state from localStorage on initial load
  // See: spec/02-app-issues/63-button-layout-collapse-reload.md
  if (plCtx.panelState === 'minimized') {
    for (let i = 0; i < plCtx.bodyElements.length; i++) {
      plCtx.bodyElements[i].style.display = 'none';
    }
    log('Panel restored in minimized state from localStorage', 'info');
  }

  // Record indicator (fixed position)
  const record = document.createElement('div');
  record.id = IDS.RECORD_INDICATOR;
  record.className = 'loop-pulse';
  record.style.cssText = 'display:none;position:fixed;top:15px;right:15px;padding:8px 12px;background:#dc2626;border-radius:20px;color:#fff;font-size:12px;font-weight:bold;z-index:99999;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(220,38,38,.4);';
  record.innerHTML = '<span style="width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;"></span> LOOP';
  document.body.appendChild(record);

  // Keyboard handlers (with Task Next deps for Ctrl+Shift+1..9 shortcuts)
  const kbTaskNextDeps = (deps as any).taskNextDeps ?? undefined;
  registerKeyboardHandlers({
    jsBody, plCtx, settingsDeps, ui, startLoop: deps.startLoop, stopLoop: deps.stopLoop, forceSwitch: deps.forceSwitch, restorePanel, taskNextDeps: kbTaskNextDeps,
  });

  log('UI created successfully with drag, hide/minimize, and keyboard shortcuts', 'success');
}
