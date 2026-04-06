/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Workspace Detection Module
 * Step 2i: Extracted from macro-looping.ts
 *
 * Contains: autoDetectLoopCurrentWorkspace (Tier 1 API + Tier 2 XPath + Tier 3 default),
 * detectWorkspaceViaProjectDialog, findProjectButtonWithRetry, openDialogAndPoll,
 * pollForWorkspaceName, findWorkspaceNameViaCss, closeDialogAndDefault,
 * closeProjectDialogSafe, extractProjectIdFromUrl.
 */

import { CONFIG, CREDIT_API_BASE, loopCreditState, state, TIMING } from './shared-state';
import { log, logSub } from './logging';
import { resolveToken, markBearerTokenExpired } from './auth';
import { reactClick, getByXPath, getAllByXPath, findElement, ML_ELEMENTS } from './xpath-utils';

// ============================================
// Workspace name normalization and matching helpers
// ============================================
const SELECTED_WS_SELECTOR = '[aria-current="page"], [aria-selected="true"], [data-state="checked"], [data-state="active"], [data-selected="true"]';

function normalizeWorkspaceName(name: string): string {
  return (name || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchWorkspaceByName(rawName: string, perWs: any[]): any {
  const normalizedRaw = normalizeWorkspaceName(rawName);
  if (!normalizedRaw || !perWs || perWs.length === 0) return null;

  for (let i = 0; i < perWs.length; i++) {
    const fullName = (perWs[i].fullName || perWs[i].name || '') as string;
    if (normalizeWorkspaceName(fullName) === normalizedRaw) {
      return perWs[i];
    }
  }
  return null;
}

function pushWorkspaceNameCandidate(target: Array<{ name: string; selected: boolean }>, name: string, selected: boolean): void {
  const cleaned = (name || '').replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return;
  const normalized = normalizeWorkspaceName(cleaned);
  if (!normalized) return;

  for (let i = 0; i < target.length; i++) {
    if (normalizeWorkspaceName(target[i].name) === normalized) {
      if (selected) target[i].selected = true;
      return;
    }
  }
  target.push({ name: cleaned, selected: selected });
}

function expandWorkspaceNameCandidates(rawText: string, selected: boolean, target: Array<{ name: string; selected: boolean }>): void {
  const base = (rawText || '').replace(/\u00a0/g, ' ').trim();
  if (!base) return;

  pushWorkspaceNameCandidate(target, base, selected);

  const lines = base.split(/\r?\n+/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    pushWorkspaceNameCandidate(target, line, selected);

    const stripped = line.replace(/^(workspace|current workspace|selected workspace|project)\s*[:\-]\s*/i, '').trim();
    if (stripped && stripped !== line) {
      pushWorkspaceNameCandidate(target, stripped, selected);
    }

    const tokens = line.split(/\s*[|•·→]\s*/);
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t].trim();
      if (!token) continue;
      pushWorkspaceNameCandidate(target, token, selected);
    }
  }
}

function isLikelySelectedWorkspaceNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;

  if (
    node.matches(SELECTED_WS_SELECTOR) ||
    !!node.closest(SELECTED_WS_SELECTOR) ||
    !!node.querySelector(SELECTED_WS_SELECTOR)
  ) {
    return true;
  }

  let el: Element | null = node;
  for (let i = 0; i < 4 && el; i++) {
    const className = ((el.className as string) || '').toLowerCase();
    if (/(^|\s)(selected|active|current|checked)(\s|$)/.test(className) || /\bis-(selected|active|current|checked)\b/.test(className)) {
      return true;
    }
    el = el.parentElement;
  }

  return false;
}

function collectWorkspaceNameCandidatesFromNode(node: Node): Array<{ name: string; selected: boolean }> {
  const candidates: Array<{ name: string; selected: boolean }> = [];
  const nodeSelected = isLikelySelectedWorkspaceNode(node);
  const attrKeys = ['aria-label', 'title', 'data-name', 'data-value'];

  if (node instanceof Element) {
    const selectedNodes = node.querySelectorAll(SELECTED_WS_SELECTOR);
    for (let i = 0; i < selectedNodes.length; i++) {
      expandWorkspaceNameCandidates((selectedNodes[i].textContent || '').trim(), true, candidates);
      for (let ak = 0; ak < attrKeys.length; ak++) {
        const attrValue = selectedNodes[i].getAttribute(attrKeys[ak]);
        if (attrValue) {
          expandWorkspaceNameCandidates(attrValue, true, candidates);
        }
      }
    }

    expandWorkspaceNameCandidates((node.textContent || '').trim(), nodeSelected, candidates);
    for (let nk = 0; nk < attrKeys.length; nk++) {
      const nodeAttrValue = node.getAttribute(attrKeys[nk]);
      if (nodeAttrValue) {
        expandWorkspaceNameCandidates(nodeAttrValue, nodeSelected, candidates);
      }
    }

    const childTexts = node.querySelectorAll('span, p, a, button, div');
    const limit = Math.min(childTexts.length, 24);
    for (let ci = 0; ci < limit; ci++) {
      expandWorkspaceNameCandidates((childTexts[ci].textContent || '').trim(), nodeSelected, candidates);
      for (let ck = 0; ck < attrKeys.length; ck++) {
        const childAttrValue = childTexts[ci].getAttribute(attrKeys[ck]);
        if (childAttrValue) {
          expandWorkspaceNameCandidates(childAttrValue, nodeSelected, candidates);
        }
      }
    }
  } else {
    expandWorkspaceNameCandidates((node.textContent || '').trim(), false, candidates);
  }

  return candidates;
}

// ============================================
// Extract project ID from URL
// ============================================
export function extractProjectIdFromUrl() {
  const url = window.location.href;

  // Pattern 1: /projects/{id} editor route
  const pathMatch = url.match(/\/projects\/([^/?#]+)/);
  if (pathMatch) return pathMatch[1];

  try {
    const hostname = new URL(url).hostname;
    const firstLabel = hostname.split('.')[0] || '';

    // Pattern 2: id-preview--{uuid}.{domain}
    const idPreviewMatch = firstLabel.match(/^id-preview--([a-f0-9-]{36})$/i);
    if (idPreviewMatch) return idPreviewMatch[1];

    // Pattern 3: {uuid}--preview.{domain} or {uuid}-preview.{domain}
    const previewSuffixMatch = firstLabel.match(/^([a-f0-9-]{36})(?:--preview|-preview)$/i);
    if (previewSuffixMatch) return previewSuffixMatch[1];

    // Pattern 4: bare UUID subdomain: {uuid}.lovableproject.com
    const bareUuidLabelMatch = firstLabel.match(/^([a-f0-9-]{36})$/i);
    if (bareUuidLabelMatch) return bareUuidLabelMatch[1];
  } catch (_e) {
    // ignore URL parse errors, fall through to legacy regex checks
  }

  // Legacy defensive fallbacks
  const subdomainMatch = url.match(/id-preview--([a-f0-9-]{36})\./i);
  if (subdomainMatch) return subdomainMatch[1];

  const altSubdomainMatch = url.match(/([a-f0-9-]{36})(?:--preview|-preview)\./i);
  if (altSubdomainMatch) return altSubdomainMatch[1];

  const bareUuidSubdomainMatch = url.match(/https?:\/\/([a-f0-9-]{36})\.[^/]+/i);
  if (bareUuidSubdomainMatch) return bareUuidSubdomainMatch[1];

  return null;
}

// ============================================
// v7.19: Auto-detect current workspace
// Tier 1: POST /projects/{id}/mark-viewed → workspace_id → wsById lookup
// Tier 2: XPath detection via Project Dialog
// Tier 3: Default to first workspace (last resort)
// ============================================
export function autoDetectLoopCurrentWorkspace(bearerToken?: string, opts?: { skipDialog?: boolean }): Promise<void> {
  const fn = 'autoDetectLoopWs';
  const skipDialog = opts?.skipDialog ?? false;

  // GUARD: If a manual Check is in progress, do NOT override workspace detection.
  // See: spec/02-app-issues/check-button/08-workspace-detection-race.md (RCA-3)
  if (state.isManualCheck) {
    log(fn + ': ⚠️ GUARD — manual Check in progress (isManualCheck=true) — skipping autoDetect to prevent race', 'warn');
    return Promise.resolve();
  }

  let perWs = loopCreditState.perWorkspace || [];
  if (perWs.length === 0) {
    log(fn + ': No workspaces loaded', 'warn');
    return Promise.resolve();
  }
  if (perWs.length === 1) {
    state.workspaceName = perWs[0].fullName || perWs[0].name;
    state.workspaceFromApi = true;
    loopCreditState.currentWs = perWs[0];
    log(fn + ': Single workspace: ' + state.workspaceName, 'success');
    return Promise.resolve();
  }

  // v7.9.34: GUARD — If workspace was already set authoritatively
  if (state.workspaceFromApi && state.workspaceName) {
    const matched = matchWorkspaceByName(state.workspaceName, perWs);
    if (matched) {
      loopCreditState.currentWs = matched;
      log(fn + ': ✅ GUARD — workspace already set authoritatively: "' + state.workspaceName + '" (skipping detection)', 'success');
      return Promise.resolve();
    }
    log(fn + ': GUARD — workspaceFromApi=true but "' + state.workspaceName + '" not found in list, falling through to Tier 1', 'warn');
    state.workspaceFromApi = false;
  }

  /** Tier 2/3 fallback: if skipDialog, default to first workspace instead of clicking dialog */
  function fallbackDetect(): Promise<void> {
    if (skipDialog) {
      // Tier 3: Default to first workspace — no dialog interaction during startup
      state.workspaceName = perWs[0].fullName || perWs[0].name;
      state.workspaceFromApi = false;
      loopCreditState.currentWs = perWs[0];
      log(fn + ': Tier 3 (skipDialog) — defaulted to first workspace: "' + state.workspaceName + '"', 'warn');
      return Promise.resolve();
    }
    return detectWorkspaceViaProjectDialog(fn, perWs).then(function() { /* discard btn */ });
  }

  // ---- Tier 1: POST /projects/{id}/mark-viewed → workspace_id → wsById O(1) lookup ----
  const projectId = extractProjectIdFromUrl();
  const token = bearerToken || resolveToken();
  if (!projectId) {
    log(fn + ': No projectId in URL — skipping Tier 1, falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2') + ' (XPath)', 'warn');
    return fallbackDetect();
  }
  if (!token) {
    log(fn + ': No bearer token — skipping Tier 1, falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2') + ' (XPath)', 'warn');
    return fallbackDetect();
  }

  const markViewedUrl = CREDIT_API_BASE + '/projects/' + projectId + '/mark-viewed';
  const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  log(fn + ': Tier 1 — POST ' + markViewedUrl, 'check');

  return fetch(markViewedUrl, { method: 'POST', headers: headers, credentials: 'include', body: '{}' })
    .then(function(resp) {
      if (!resp.ok) {
        log(fn + ': Tier 1 FAILED — HTTP ' + resp.status + ' — falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2'), 'warn');
        if (resp.status === 401 || resp.status === 403) {
          markBearerTokenExpired('loop');
        }
        return fallbackDetect();
      }
      return resp.text().then(function(bodyText) {
        let data;
        try { data = JSON.parse(bodyText); } catch(e) {
          log(fn + ': Tier 1 — invalid JSON response — falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2'), 'warn');
          return fallbackDetect();
        }

        const wsId = data.workspace_id
          || (data.project && data.project.workspace_id)
          || data.workspaceId
          || '';

        logSub('Tier 1 response keys: ' + Object.keys(data).join(', '), 1);
        logSub('Extracted workspace_id: "' + wsId + '"', 1);

        if (!wsId) {
          log(fn + ': Tier 1 — no workspace_id in response — falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2'), 'warn');
          logSub('Response (first 400 chars): ' + bodyText.substring(0, 400), 1);
          return fallbackDetect();
        }

        let wsById = loopCreditState.wsById || {};
        const matchedWs = wsById[wsId];
        if (matchedWs) {
          state.workspaceName = matchedWs.fullName || matchedWs.name;
          state.workspaceFromApi = true;
          loopCreditState.currentWs = matchedWs;
          log(fn + ': ✅ Tier 1 MATCHED via wsById: "' + state.workspaceName + '" (id=' + wsId + ')', 'success');
          return;
        }

        log(fn + ': Tier 1 — workspace_id "' + wsId + '" not in wsById (' + Object.keys(wsById).length + ' keys) — trying linear scan', 'warn');
        logSub('wsById keys: ' + Object.keys(wsById).slice(0, 10).join(', '), 1);
        for (let li = 0; li < perWs.length; li++) {
          if (perWs[li].id === wsId) {
            state.workspaceName = perWs[li].fullName || perWs[li].name;
            state.workspaceFromApi = true;
            loopCreditState.currentWs = perWs[li];
            log(fn + ': ✅ Tier 1 MATCHED via linear scan: "' + state.workspaceName + '" (id=' + wsId + ')', 'success');
            return;
          }
        }

        log(fn + ': Tier 1 — workspace_id "' + wsId + '" not found in ' + perWs.length + ' workspaces — falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2'), 'warn');
        return fallbackDetect();
      });
    })
    .catch(function(err: any) {
      log(fn + ': Tier 1 NETWORK ERROR: ' + (err?.message || err) + ' — falling to ' + (skipDialog ? 'Tier 3' : 'Tier 2'), 'warn');
      return fallbackDetect();
    });
}

// ============================================
// Tier 2: Detect workspace via Project Dialog XPath
// keepDialogOpen: if true, dialog is NOT closed after reading workspace name.
//   Caller is responsible for calling closeProjectDialogSafe().
//   Returns the dialog button element for the caller to close.
// ============================================
export function detectWorkspaceViaProjectDialog(callerFn?: string, perWs?: any[], keepDialogOpen?: boolean): Promise<Element | null> {
  const fn = callerFn || 'detectWsViaDialog';
  perWs = perWs || [];

  // V2 Phase 01 Task 01.3: Never override an API-sourced workspace name with DOM detection.
  // Known-Good State Wins principle — see spec/01-app/macrocontroller-ts-migration-v2/01-initialization-fix.md
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

  return findProjectButtonWithRetry(fn, 3, 1000).then(function(btn: any) {
    if (!btn) {
      log(fn + ': Project button NOT found after retries — cannot open dialog. XPath=' + CONFIG.PROJECT_BUTTON_XPATH, 'error');
      log(fn + ': Keeping existing workspace: ' + (state.workspaceName || '(none)'), 'warn');
      return Promise.resolve(null);
    }
    return openDialogAndPoll(fn, btn, perWs, !!keepDialogOpen).then(function() {
      return btn as Element;
    });
  });
}

// ============================================
// Retry finding project button
// ============================================
function findProjectButtonWithRetry(fn: string, maxRetries: number, delayMs: number): Promise<Element | null> {
  return new Promise(function(resolve) {
    let attempt = 0;
    function tryFind() {
      attempt++;
      let btn: Element | null = getByXPath(CONFIG.PROJECT_BUTTON_XPATH) as Element | null;
      if (!btn) {
        btn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
        if (btn) logSub('Project button found via fallback findElement (attempt ' + attempt + ')', 1);
      }
      if (btn) {
        logSub('Project button found on attempt ' + attempt, 1);
        resolve(btn);
        return;
      }
      if (attempt < maxRetries) {
        logSub('Project button not found (attempt ' + attempt + '/' + maxRetries + ') — retrying in ' + delayMs + 'ms...', 1);
        setTimeout(tryFind, delayMs);
      } else {
        logSub('Project button not found after ' + maxRetries + ' attempts', 1);
        resolve(null);
      }
    }
    tryFind();
  });
}

// ============================================
// Open dialog and poll for workspace name
// ============================================
function openDialogAndPoll(fn: string, btn: Element, perWs: any[], keepDialogOpen: boolean): Promise<void> {
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
function pollForWorkspaceName(fn: string, btn: Element, perWs: any[], resolve: () => void, keepDialogOpen?: boolean): void {
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

        const matchedCandidates: Array<{ matched: any; rawName: string; selected: boolean }> = [];

        for (let ni = 0; ni < allNodes.length; ni++) {
          const nodeText = (allNodes[ni].textContent || '').trim();
          logSub('  Node[' + ni + ']: "' + nodeText + '"', 1);

          const nodeCandidates = collectWorkspaceNameCandidatesFromNode(allNodes[ni]);
          for (let ci = 0; ci < nodeCandidates.length; ci++) {
            const matched = matchWorkspaceByName(nodeCandidates[ci].name, perWs);
            if (!matched) continue;
            matchedCandidates.push({
              matched: matched,
              rawName: nodeCandidates[ci].name,
              selected: nodeCandidates[ci].selected
            });
          }
        }

        const uniqueById: Record<string, { matched: any; rawName: string; selected: boolean }> = {};
        for (let ui = 0; ui < matchedCandidates.length; ui++) {
          const key = matchedCandidates[ui].matched.id || normalizeWorkspaceName(matchedCandidates[ui].matched.fullName || matchedCandidates[ui].matched.name || '');
          const existing = uniqueById[key];
          if (!existing || (!existing.selected && matchedCandidates[ui].selected)) {
            uniqueById[key] = matchedCandidates[ui];
          }
        }

        const uniqueMatches = Object.keys(uniqueById).map(function(k) { return uniqueById[k]; });
        let chosen: { matched: any; rawName: string; selected: boolean } | null = null;

        for (let mi = 0; mi < uniqueMatches.length; mi++) {
          if (uniqueMatches[mi].selected) {
            chosen = uniqueMatches[mi];
            break;
          }
        }

        if (!chosen && uniqueMatches.length === 1) {
          chosen = uniqueMatches[0];
        }

        if (!chosen && uniqueMatches.length === 0 && perWs.length === 1) {
          chosen = {
            matched: perWs[0],
            rawName: perWs[0].fullName || perWs[0].name,
            selected: false
          };
          log(fn + ': XPath candidates not cleanly matchable, but only one workspace exists — selecting it', 'warn');
        }

        if (chosen) {
          state.workspaceName = chosen.matched.fullName || chosen.matched.name;
          loopCreditState.currentWs = chosen.matched;
          log(fn + ': ✅ Workspace detected from project dialog: "' + chosen.rawName + '" → ' + state.workspaceName + ' (id=' + chosen.matched.id + ')', 'success');
        } else {
          const firstRaw = (allNodes[0].textContent || '').trim();
          if (perWs.length === 0 && firstRaw) {
            state.workspaceName = firstRaw;
            log(fn + ': ✅ No workspace list — using raw XPath text as workspace name: "' + firstRaw + '"', 'success');
          } else {
            log(fn + ': XPath returned ' + allNodes.length + ' nodes but no unambiguous exact match. First node: "' + firstRaw + '" (checked ' + perWs.length + ' workspaces)', 'warn');
            if (uniqueMatches.length > 1) {
              log(fn + ': Ambiguous workspace detection (' + uniqueMatches.length + ' exact candidates) — preserving existing workspace', 'warn');
            }
            log(fn + ': Keeping existing workspace: ' + (state.workspaceName || '(none)'), 'warn');
          }
        }

      // Only close dialog if keepDialogOpen is NOT set
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
      log(fn + ': WorkspaceNameXPath not found after ' + dialogWaitMs + 'ms — trying CSS selector fallback (S-012)', 'warn');

      const cssFallbackNodes = findWorkspaceNameViaCss(fn, perWs);
      if (cssFallbackNodes.matched) {
        state.workspaceName = cssFallbackNodes.matched.fullName || cssFallbackNodes.matched.name;
        loopCreditState.currentWs = cssFallbackNodes.matched;
        log(fn + ': ⚠️ Workspace detected via CSS fallback: "' + cssFallbackNodes.rawName + '" → ' + state.workspaceName + ' (XPath may be stale — consider updating WorkspaceNameXPath in config.ini)', 'warn');
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
  }, pollInterval);
}

// ============================================
// S-012: CSS selector fallback for workspace name
// ============================================
function findWorkspaceNameViaCss(fn: string, perWs: any[]): { matched: any; rawName: string } {
  const selectors = ML_ELEMENTS.WORKSPACE_NAME.selector as string[];
  const result: { matched: any; rawName: string } = { matched: null, rawName: '' };

  for (let si = 0; si < selectors.length; si++) {
    const sel = selectors[si];
    try {
      const els = document.querySelectorAll(sel);
      logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ' + els.length + ' element(s)', 2);

      for (let ei = 0; ei < els.length; ei++) {
        const nodeCandidates = collectWorkspaceNameCandidatesFromNode(els[ei]);
        for (let ci = 0; ci < nodeCandidates.length; ci++) {
          const matched = matchWorkspaceByName(nodeCandidates[ci].name, perWs);
          if (!matched) continue;

          logSub('CSS fallback ✅ MATCH: selector="' + sel + '", text="' + nodeCandidates[ci].name + '" → ' + (matched.fullName || matched.name), 2);
          result.matched = matched;
          result.rawName = nodeCandidates[ci].name;
          return result;
        }
      }
    } catch (e: any) {
      logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ERROR: ' + (e?.message || e), 2);
    }
  }

  logSub('CSS fallback: no selectors matched a known workspace (' + selectors.length + ' selectors tried, ' + perWs.length + ' workspaces)', 2);
  return result;
}

// ============================================
// Close dialog and default helpers
// ============================================
function closeDialogAndDefault(fn: string, btn: Element, perWs: any[], resolve: () => void): void {
  if (!state.workspaceName) {
    log(fn + ': No reliable workspace match — keeping workspace empty after fallback miss', 'warn');
  } else {
    log(fn + ': Keeping existing workspace: ' + state.workspaceName, 'warn');
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
  } catch (e: any) {
    logSub('Error closing dialog: ' + (e?.message || e), 1);
  }
}

// Legacy alias
export function detectWorkspaceFromDom(callerFn?: string, perWs?: any[]): void {
  detectWorkspaceViaProjectDialog(callerFn, perWs);
}
