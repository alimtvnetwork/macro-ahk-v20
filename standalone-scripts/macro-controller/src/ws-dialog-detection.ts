/**
 * Workspace Dialog Detection — Tier 2 XPath-based workspace detection via project dialog.
 *
 * Extracted from workspace-detection.ts (module splitting).
 * Contains: detectWorkspaceViaProjectDialog, findProjectButtonWithRetry, openDialogAndPoll,
 * pollForWorkspaceName, findWorkspaceNameViaCss, closeDialogAndDefault,
 * closeProjectDialogSafe, detectWorkspaceFromDom.
 */

import { toErrorMessage, logError } from './error-utils';
import { CONFIG, TIMING, loopCreditState, state } from './shared-state';
import { log, logSub, getDisplayProjectName } from './logging';
import { reactClick, getByXPath, getAllByXPath, findElement, ML_ELEMENTS } from './xpath-utils';
import { collectWorkspaceNameCandidatesFromNode, matchWorkspaceByName, normalizeWorkspaceName, isInvalidWorkspaceCandidateName } from './ws-name-matching';
import type { WorkspaceCredit, WorkspaceMatchCandidate } from './types';

import { Label } from './types';

// ============================================
// Tier 2: Detect workspace via Project Dialog XPath
// keepDialogOpen: if true, dialog is NOT closed after reading workspace name.
//   Caller is responsible for calling closeProjectDialogSafe().
//   Returns the dialog button element for the caller to close.
// ============================================
export function detectWorkspaceViaProjectDialog(callerFn?: string, perWs?: WorkspaceCredit[], keepDialogOpen?: boolean): Promise<Element | null> {
  const fn = callerFn || 'detectWsViaDialog';
  perWs = perWs || [];

  // Guard: while manual Check runs, only runCheck may use dialog detection.
  if (state.isManualCheck && fn !== 'runCheck') {
    log(fn + ': ⛔ GUARD — manual Check owns dialog interaction; skipping', 'warn');
    return Promise.resolve(null);
  }

  // Issue 82 policy: never auto-open project dialog while loop is stopped.
  // runCheck uses keepDialogOpen=true and is an explicit user action.
  if (!state.running && !keepDialogOpen) {
    log(fn + ': ⛔ GUARD — loop stopped, dialog auto-open blocked (passive mode)', 'warn');
    return Promise.resolve(null);
  }

  // V2 Phase 01 Task 01.3: Never override an API-sourced workspace name with DOM detection.
  if (state.workspaceFromApi && state.workspaceName) {
    log(fn + ': ⛔ GUARD — API-sourced workspace "' + state.workspaceName + '" is authoritative — DOM detection skipped', 'success');
    return Promise.resolve(null);
  }

  const hasWorkspaces = perWs.length > 0;
  if (!hasWorkspaces) {
    log(fn + ': No workspaces loaded — will still try to read workspace name from dialog XPath directly', 'warn');
  }

  log(fn + ': Tier 2 — Opening project dialog to read workspace name...', 'check');
  logSub('ProjectButtonXPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 1);
  logSub('WorkspaceNameXPath: ' + CONFIG.WORKSPACE_XPATH, 1);
  if (keepDialogOpen) logSub('keepDialogOpen=true — caller will close dialog after Step 3', 1);

  return findProjectButtonWithRetry(fn, 3, 1000).then(function(btn: Element | null) {
    if (!btn) {
      logError('ws-dialog-detection', 'Project button NOT found after retries — cannot open dialog. XPath=' + CONFIG.PROJECT_BUTTON_XPATH);
      log(fn + Label.KeepingExistingWs + (state.workspaceName || '(none)'), 'warn');
      return Promise.resolve(null);
    }
    return openDialogAndPoll(fn, btn, perWs!, !!keepDialogOpen).then(function() {
      return btn as Element;
    });
  });
}

// ============================================
// Retry finding project button
// ============================================
// CQ16: Extracted from findProjectButtonWithRetry closure
interface ProjectBtnRetryCtx {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  resolve: (btn: Element | null) => void;
}

function tryFindProjectButton(ctx: ProjectBtnRetryCtx): void {
  ctx.attempt++;
  let btn: Element | null = getByXPath(CONFIG.PROJECT_BUTTON_XPATH) as Element | null;

  if (!btn) {
    btn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
    if (btn) { logSub('Project button found via fallback findElement (attempt ' + ctx.attempt + ')', 1); }
  }

  if (btn) {
    logSub('Project button found on attempt ' + ctx.attempt, 1);
    ctx.resolve(btn);

    return;
  }

  if (ctx.attempt < ctx.maxRetries) {
    logSub('Project button not found (attempt ' + ctx.attempt + '/' + ctx.maxRetries + ') — retrying in ' + ctx.delayMs + 'ms...', 1);
    setTimeout(function() { tryFindProjectButton(ctx); }, ctx.delayMs);
  } else {
    logSub('Project button not found after ' + ctx.maxRetries + ' attempts', 1);
    ctx.resolve(null);
  }
}

function findProjectButtonWithRetry(_fn: string, maxRetries: number, delayMs: number): Promise<Element | null> {
  return new Promise(function(resolve) {
    const ctx: ProjectBtnRetryCtx = { attempt: 0, maxRetries, delayMs, resolve };
    tryFindProjectButton(ctx);
  });
}

// ============================================
// Open dialog and poll for workspace name
// ============================================
function openDialogAndPoll(fn: string, btn: Element, perWs: WorkspaceCredit[], keepDialogOpen: boolean): Promise<void> {
  const isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
  if (isExpanded) {
    logSub('Dialog is already open — closing first for clean re-read', 1);
    reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
    return new Promise(function(resolve) {
      setTimeout(function() {
        logSub('Re-opening dialog for fresh workspace read', 1);
        reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
        pollForWorkspaceName(fn, btn, perWs, resolve, keepDialogOpen);
      }, 400);
    });
  } else {
    logSub('Dialog is closed — clicking project button to open', 1);
    reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
  }

  return new Promise(function(resolve) {
    pollForWorkspaceName(fn, btn, perWs, resolve, keepDialogOpen);
  });
}

// ============================================
// Poll for workspace name in dialog
// keepDialogOpen: if true, do NOT close dialog after reading — caller handles it.
// ============================================
/** Collect, deduplicate, and resolve the best workspace match from XPath nodes. */
function resolveChosenWorkspace(
  fn: string, allNodes: Node[], perWs: WorkspaceCredit[],
): WorkspaceMatchCandidate | null {
  const matchedCandidates: WorkspaceMatchCandidate[] = [];

  for (const [ni, node] of allNodes.entries()) {
    logSub('  Node[' + ni + ']: "' + (node.textContent || '').trim() + '"', 1);
    for (const candidate of collectWorkspaceNameCandidatesFromNode(node)) {
      const matched = matchWorkspaceByName(candidate.name, perWs);
      if (matched) {
        matchedCandidates.push({ matched, rawName: candidate.name, selected: candidate.selected });
      }
    }
  }

  const uniqueById: Record<string, WorkspaceMatchCandidate> = {};
  for (const c of matchedCandidates) {
    const key = c.matched.id || normalizeWorkspaceName(c.matched.fullName || c.matched.name || '');
    const existing = uniqueById[key];
    if (!existing || (!existing.selected && c.selected)) uniqueById[key] = c;
  }

  const uniqueMatches = Object.values(uniqueById);
  const selected = uniqueMatches.find(m => m.selected);
  if (selected) return selected;
  if (uniqueMatches.length === 1) return uniqueMatches[0];

  if (uniqueMatches.length === 0 && perWs.length === 1) {
    log(fn + ': XPath candidates not cleanly matchable, but only one workspace exists — selecting it', 'warn');
    return { matched: perWs[0], rawName: perWs[0].fullName || perWs[0].name, selected: false };
  }
  return null;
}

/** Apply the chosen workspace to state, or log warnings if no match. */
function applyChosenWorkspace(
  fn: string, chosen: WorkspaceMatchCandidate | null,
  allNodes: Node[], perWs: WorkspaceCredit[],
): void {
  if (chosen) {
    state.workspaceName = chosen.matched.fullName || chosen.matched.name;
    loopCreditState.currentWs = chosen.matched;
    log(fn + ': ✅ Workspace detected from project dialog: "' + chosen.rawName + '" → ' + state.workspaceName + ' (id=' + chosen.matched.id + ')', 'success');
    return;
  }
  const firstRaw = (allNodes[0].textContent || '').trim();
  const projectName = getDisplayProjectName();
  const isInvalidRawWorkspace = isInvalidWorkspaceCandidateName(firstRaw, projectName);

  if (perWs.length === 0 && firstRaw && !isInvalidRawWorkspace) {
    state.workspaceName = firstRaw;
    log(fn + ': ✅ No workspace list — using raw XPath text as workspace name: "' + firstRaw + '"', 'success');
  } else if (perWs.length === 0 && firstRaw && isInvalidRawWorkspace) {
    log(fn + ': ⚠️ Ignoring raw XPath workspace candidate "' + firstRaw + '" because it is a generic/project label; preserving existing workspace', 'warn');
  } else {
    log(fn + ': XPath returned ' + allNodes.length + ' nodes but no unambiguous exact match. First node: "' + firstRaw + '" (checked ' + perWs.length + ' workspaces)', 'warn');
    log(fn + Label.KeepingExistingWs + (state.workspaceName || '(none)'), 'warn');
  }
}

/** Handle the timeout fallback (CSS selectors, then give up). */
function handlePollTimeout(
  fn: string, btn: Element, perWs: WorkspaceCredit[],
  keepDialogOpen: boolean | undefined, resolve: () => void,
): void {
  log(fn + ': WorkspaceNameXPath not found — trying CSS selector fallback (S-012)', 'warn');
  const cssFallback = findWorkspaceNameViaCss(fn, perWs);
  if (cssFallback.matched) {
    state.workspaceName = cssFallback.matched.fullName || cssFallback.matched.name;
    loopCreditState.currentWs = cssFallback.matched;
    log(fn + ': ⚠️ Workspace detected via CSS fallback: "' + cssFallback.rawName + '" → ' + state.workspaceName, 'warn');
    if (!keepDialogOpen) closeProjectDialogSafe(btn);
    resolve();
    return;
  }
  log(fn + ': CSS fallback also failed — preserving existing workspace', 'warn');
  if (!keepDialogOpen) {
    closeDialogAndDefault(fn, btn, perWs, resolve);
  } else {
    resolve();
  }
}

function pollForWorkspaceName(fn: string, btn: Element, perWs: WorkspaceCredit[], resolve: () => void, keepDialogOpen?: boolean): void {
  const dialogWaitMs = Math.max(1500, Math.min((TIMING.DIALOG_WAIT || 3000), 5000));
  const pollInterval = 300;
  let elapsed = 0;
  logSub('Waiting up to ' + dialogWaitMs + 'ms for WorkspaceNameXPath to appear...', 1);

  const pollTimer = setInterval(function() {
    elapsed += pollInterval;

    const allNodes = getAllByXPath(CONFIG.WORKSPACE_XPATH);
    if (allNodes.length > 0) {
      clearInterval(pollTimer);
      logSub('WorkspaceNameXPath found ' + allNodes.length + ' node(s) after ' + elapsed + 'ms', 1);

      const chosen = resolveChosenWorkspace(fn, allNodes, perWs);
      applyChosenWorkspace(fn, chosen, allNodes, perWs);

      if (!keepDialogOpen) {
        closeProjectDialogSafe(btn);
      } else {
        logSub('keepDialogOpen=true — leaving dialog open for Step 3 (progress bar)', 1);
      }
      resolve();
      return;
    }

    if (elapsed >= dialogWaitMs) {
      clearInterval(pollTimer);
      handlePollTimeout(fn, btn, perWs, keepDialogOpen, resolve);
    }
  }, pollInterval);
}

// ============================================
// S-012: CSS selector fallback for workspace name
// ============================================
function findWorkspaceNameViaCss(_fn: string, perWs: WorkspaceCredit[]): { matched: WorkspaceCredit | null; rawName: string } {
  const selectors = ML_ELEMENTS.WORKSPACE_NAME.selector as string[];
  const result: { matched: WorkspaceCredit | null; rawName: string } = { matched: null, rawName: '' };

  for (const [si, sel] of selectors.entries()) {
    try {
      const els = document.querySelectorAll(sel);
      logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ' + els.length + ' element(s)', 2);

      for (const el of els) {
        const nodeCandidates = collectWorkspaceNameCandidatesFromNode(el);

        for (const candidate of nodeCandidates) {
          const matched = matchWorkspaceByName(candidate.name, perWs);

          if (!matched) {
            continue;
          }

          logSub('CSS fallback ✅ MATCH: selector="' + sel + '", text="' + candidate.name + '" → ' + (matched.fullName || matched.name), 2);
          result.matched = matched;
          result.rawName = candidate.name;

          return result;
        }
      }
    } catch (e: unknown) {
      logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ERROR: ' + toErrorMessage(e), 2);
    }
  }

  logSub('CSS fallback: no selectors matched a known workspace (' + selectors.length + ' selectors tried, ' + perWs.length + ' workspaces)', 2);
  return result;
}

// ============================================
// Close dialog and default helpers
// ============================================
function closeDialogAndDefault(fn: string, btn: Element, _perWs: WorkspaceCredit[], resolve: () => void): void {
  if (!state.workspaceName) {
    log(fn + ': No reliable workspace match — keeping workspace empty after fallback miss', 'warn');
  } else {
    log(fn + Label.KeepingExistingWs + state.workspaceName, 'warn');
  }
  closeProjectDialogSafe(btn);
  resolve();
}

export function closeProjectDialogSafe(btn: Element): void {
  try {
    const isExpanded = btn && (btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open');
    if (isExpanded) {
      logSub('Closing project dialog after workspace read', 1);
      reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
    }
  } catch (e: unknown) {
    logSub('Error closing dialog: ' + toErrorMessage(e), 1);
  }
}

// Legacy alias
export function detectWorkspaceFromDom(callerFn?: string, perWs?: WorkspaceCredit[]): void {
  detectWorkspaceViaProjectDialog(callerFn, perWs);
}
