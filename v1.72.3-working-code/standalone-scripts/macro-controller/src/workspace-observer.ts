/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Workspace Observer Module
 * Step 2a: Extracted from macro-looping.ts
 *
 * Contains: workspace name detection (XPath + auto-discovery + nav element),
 * MutationObserver for live workspace changes, workspace change history,
 * and credit re-check on workspace change.
 *
 * Uses MacroController singleton for cross-module calls.
 */

import { log, logSub, safeSetItem, getWsHistoryKey, getProjectIdFromUrl, getDisplayProjectName } from './logging';
import { getByXPath } from './xpath-utils';
import {
  state, loopCreditState, CONFIG,
  WS_HISTORY_MAX_ENTRIES,
} from './shared-state';

import { MacroController } from './core/MacroController';

function mc() { return MacroController.getInstance(); }
import {
  isUserTypingInPrompt, checkSystemBusy,
  pollForDialogReady, closeProjectDialog, ensureProjectDialogOpen,
} from './dom-helpers';

// ============================================
// Workspace Name Validation
// ============================================

/**
 * v7.9.16: Validate a name against known workspace list.
 * Prevents DOM observer from setting project name as workspace name.
 * v7.39: Tightened matching — exact match on fullName only, no loose partial match.
 * See: spec/02-app-issues/workspace-name-binding-bug.md (RCA-3)
 */
export function isKnownWorkspaceName(name: string): boolean {
  if (!name) return false;
  const perWs = loopCreditState.perWorkspace || [];
  // Issue 84 Fix 1: When workspace list is not yet loaded, allow the name through
  // so that fetchWorkspaceNameFromNav() and the observer can set an early workspace
  // name. Previously this returned false, blocking ALL name detection until credits loaded.
  if (perWs.length === 0) return true;
  for (let i = 0; i < perWs.length; i++) {
    const ws = perWs[i];
    if (ws.fullName === name) return true;
    if (ws.name === name) return true;
    if (ws.fullName && ws.fullName.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}

// ============================================
// Workspace Name — XPath-based
// ============================================

export function fetchWorkspaceName(): void {
  const wsXpath = CONFIG.WORKSPACE_XPATH;
  if (!wsXpath || wsXpath.indexOf('__') === 0) {
    log('Workspace XPath not configured (placeholder not replaced)', 'warn');
    return;
  }
  try {
    log('Fetching workspace name from XPath: ' + wsXpath, 'check');
    let el = getByXPath(wsXpath);
    if (el) {
      let name = (el.textContent || '').trim();
      if (name) {
        if (!isKnownWorkspaceName(name)) {
          logSub('Workspace XPath returned "' + name + '" — not a known workspace, skipping', 1);
        } else if (state.workspaceFromApi) {
          logSub('Workspace XPath returned "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
        } else if (name !== state.workspaceName) {
          const oldName = state.workspaceName;
          state.workspaceName = name;
          log('Workspace name: ' + name, 'success');
          if (oldName && oldName !== name) {
            addWorkspaceChangeEntry(oldName, name);
          }
        } else {
          logSub('Workspace unchanged: ' + name, 1);
        }
      } else {
        log('Workspace element found but text is empty', 'warn');
      }
    } else {
      log('Workspace element NOT FOUND at XPath: ' + wsXpath, 'warn');
    }
    mc().ui.update();
  } catch (e) {
    log('fetchWorkspaceName error: ' + (e as Error).message, 'error');
  }
}

// ============================================
// v7.1: Auto-discover workspace name element via CSS selectors
// ============================================

export function autoDiscoverWorkspaceNavElement(): Element | null {
  const candidates: Array<{ el: Element; text: string; y: number; x: number }> = [];

  // Strategy 1: nav area buttons/links
  const navButtons = document.querySelectorAll('nav button, nav a, nav span, [role="navigation"] button');
  for (let i = 0; i < navButtons.length; i++) {
    let el = navButtons[i];
    let text = (el.textContent || '').trim();
    if (!text || text.length < 2 || text.length > 60) continue;
    if (/^(Projects?|Settings|Home|Menu|Sign|Log|Help|Docs|\+|×|☰|⋮)$/i.test(text)) continue;
    if (text.length <= 2 && /[^a-zA-Z0-9]/.test(text)) continue;
    let rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < 80) {
      candidates.push({ el: el, text: text, y: rect.top, x: rect.left });
    }
  }

  // Strategy 2: top-left nav area text elements
  if (candidates.length === 0) {
    const topNavEls = document.querySelectorAll('nav div span, nav div p, nav div a, header span, header a');
    for (let j = 0; j < topNavEls.length; j++) {
      const el2 = topNavEls[j];
      const text2 = (el2.textContent || '').trim();
      if (!text2 || text2.length < 3 || text2.length > 60) continue;
      const rect2 = el2.getBoundingClientRect();
      if (rect2.width > 0 && rect2.height > 0 && rect2.top < 80 && rect2.left < 400) {
        if (el2.children.length === 0 || el2.children.length === 1) {
          candidates.push({ el: el2, text: text2, y: rect2.top, x: rect2.left });
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    const best = candidates[0];
    log('Auto-discovered workspace nav element: "' + best.text + '" <' + best.el.tagName.toLowerCase() + '> at (' + Math.round(best.x) + ',' + Math.round(best.y) + ')', 'success');
    return best.el;
  }

  return null;
}

// ============================================
// v6.55: Fetch workspace name from nav element
// ============================================

export function fetchWorkspaceNameFromNav(): boolean {
  const navXpath = CONFIG.WORKSPACE_NAV_XPATH;
  const hasXpath = navXpath && navXpath.indexOf('__') !== 0 && navXpath !== '';
  try {
    let el: Node | null = null;
    if (hasXpath) {
      el = getByXPath(navXpath);
    }
    if (!el) {
      el = autoDiscoverWorkspaceNavElement();
    }
    if (el) {
      let name = (el.textContent || '').trim();
      if (name) {
        if (!isKnownWorkspaceName(name)) {
          logSub('Nav returned "' + name + '" — not a known workspace, skipping', 1);
          return false;
        }
        if (state.workspaceFromApi) {
          logSub('Nav returned "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
          return true;
        }
        if (name !== state.workspaceName) {
          const oldName = state.workspaceName;
          state.workspaceName = name;
          log('Workspace name (from nav): ' + name, 'success');
          if (oldName && oldName !== name) {
            addWorkspaceChangeEntry(oldName, name);
          }
        } else {
          logSub('Workspace unchanged (nav): ' + name, 1);
        }
        mc().ui.update();
        return true;
      }
    }
    logSub('Nav workspace element not found or empty', 1);
    return false;
  } catch (e) {
    log('fetchWorkspaceNameFromNav error: ' + (e as Error).message, 'error');
    return false;
  }
}

// ============================================
// v6.56: Workspace MutationObserver
// ============================================

let workspaceObserverInstance: MutationObserver | null = null;
let workspaceObserverRetryCount = 0;
const WORKSPACE_OBSERVER_MAX_RETRIES = 10;

export function startWorkspaceObserver(): void {
  const navXpath = CONFIG.WORKSPACE_NAV_XPATH;
  const hasXpath = navXpath && navXpath.indexOf('__') !== 0 && navXpath !== '';
  let navEl: Node | Element | null = null;

  if (hasXpath) {
    navEl = getByXPath(navXpath);
    if (navEl) {
      logSub('Workspace nav element found via XPath', 1);
    }
  }

  if (!navEl) {
    if (hasXpath) {
      log('WorkspaceNavXPath configured but element not found — trying auto-discovery', 'warn');
    } else {
      logSub('WorkspaceNavXPath not configured — trying auto-discovery', 1);
    }
    navEl = autoDiscoverWorkspaceNavElement();
  }

  if (!navEl) {
    workspaceObserverRetryCount++;
    if (workspaceObserverRetryCount < WORKSPACE_OBSERVER_MAX_RETRIES) {
      const retryDelay = Math.min(workspaceObserverRetryCount * 3000, 15000);
      log('Workspace observer: element not found — retry ' + workspaceObserverRetryCount + '/' + WORKSPACE_OBSERVER_MAX_RETRIES + ' in ' + (retryDelay / 1000) + 's', 'warn');
      setTimeout(startWorkspaceObserver, retryDelay);
    } else {
      log('Workspace observer: gave up after ' + WORKSPACE_OBSERVER_MAX_RETRIES + ' retries. Set WorkspaceNavXPath in config.ini.', 'error');
    }
    return;
  }

  workspaceObserverRetryCount = 0;

  if (workspaceObserverInstance) {
    workspaceObserverInstance.disconnect();
    logSub('Previous workspace observer disconnected', 1);
  }

  // Initial read
  let name = (navEl.textContent || '').trim();
  if (name && name !== state.workspaceName) {
    if (!isKnownWorkspaceName(name)) {
      logSub('Observer init: "' + name + '" not a known workspace — skipping (API will detect)', 1);
    } else if (state.workspaceFromApi) {
      logSub('Observer init: "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
    } else {
      const oldName = state.workspaceName;
      state.workspaceName = name;
      log('Workspace name (observer init): ' + name, 'success');
      if (oldName && oldName !== name) {
        addWorkspaceChangeEntry(oldName, name);
      }
      mc().ui.update();
    }
  } else if (name) {
    logSub('Workspace name already set: ' + name, 1);
  }

  // Install MutationObserver
  workspaceObserverInstance = new MutationObserver(function (mutations: MutationRecord[]) {
    if (!document.contains(navEl)) {
      log('Workspace nav element removed from DOM — restarting observer', 'warn');
      workspaceObserverInstance!.disconnect();
      state.workspaceObserverActive = false;
      setTimeout(startWorkspaceObserver, 2000);
      return;
    }

    const newName = (navEl!.textContent || '').trim();
    if (!isKnownWorkspaceName(newName)) {
      logSub('Observer mutation: "' + newName + '" not a known workspace — ignoring', 1);
      return;
    }
    if (state.workspaceFromApi) {
      logSub('Observer mutation: "' + newName + '" — ignoring, API already set: ' + state.workspaceName, 1);
      return;
    }
    if (newName && newName !== state.workspaceName) {
      const oldName = state.workspaceName;
      state.workspaceName = newName;
      log('⚡ Workspace changed (observer): "' + oldName + '" → "' + newName + '"', 'success');
      if (oldName) addWorkspaceChangeEntry(oldName, newName);

      state.workspaceJustChanged = true;
      if (state.workspaceChangedTimer) clearTimeout(state.workspaceChangedTimer);
      state.workspaceChangedTimer = setTimeout(function () {
        state.workspaceJustChanged = false;
        mc().ui.update();
      }, 10000);

      mc().ui.update();
      triggerCreditCheckOnWorkspaceChange();
    }
  });

  workspaceObserverInstance.observe(navEl, { childList: true, characterData: true, subtree: true });
  state.workspaceObserverActive = true;
  log('✅ Workspace MutationObserver installed on nav element', 'success');
}

// ============================================
// v6.56: On workspace change → check free credit
// ============================================

export function triggerCreditCheckOnWorkspaceChange(): void {
  log('Workspace changed — checking free credit...', 'check');

  if (isUserTypingInPrompt()) {
    log('Skipping credit check — user is typing in prompt', 'skip');
    return;
  }

  const opened = ensureProjectDialogOpen();
  if (!opened) {
    log('Could not open project dialog for credit check', 'warn');
    return;
  }

  pollForDialogReady(function () {
    const hasCredit = checkSystemBusy();
    state.hasFreeCredit = hasCredit;
    state.isIdle = !hasCredit;
    state.lastStatusCheck = Date.now();
    log('Credit check after workspace change: ' + (hasCredit ? 'FREE CREDIT' : 'NO CREDIT'), hasCredit ? 'success' : 'warn');
    closeProjectDialog();
    mc().ui.update();
  });
}

// ============================================
// Workspace Change History (localStorage)
// ============================================

export function addWorkspaceChangeEntry(fromName: string, toName: string): void {
  try {
    let key = getWsHistoryKey();
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    const now = new Date();
    const projectName = getDisplayProjectName();
    const projectId = getProjectIdFromUrl();
    history.push({
      from: fromName,
      to: toName,
      time: now.toISOString(),
      display: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
      projectName: projectName,
      projectId: projectId,
    });
    if (history.length > WS_HISTORY_MAX_ENTRIES) history = history.slice(history.length - WS_HISTORY_MAX_ENTRIES);
    safeSetItem(key, JSON.stringify(history));
    log('Workspace changed: "' + fromName + '" → "' + toName + '" (project=' + projectName + ', key=' + key + ')', 'success');
    mc().ui.update();
  } catch (e) { /* storage error */ }
}

export function getWorkspaceHistory(): Array<Record<string, string>> {
  try {
    let key = getWsHistoryKey();
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) { return []; }
}

export function clearWorkspaceHistory(): void {
  try {
    let key = getWsHistoryKey();
    localStorage.removeItem(key);
  } catch (e) { /* ignore */ }
}
