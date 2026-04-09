 
/**
 * MacroLoop Controller — Workspace Detection Module (barrel)
 *
 * Tier 1 API-based detection + extractProjectIdFromUrl.
 * Re-exports Tier 2 dialog detection from ws-dialog-detection.ts
 * and name matching utilities from ws-name-matching.ts.
 *
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 *
 * @see spec/04-macro-controller/workspace-detection.md — Detection protocol
 * @see spec/04-macro-controller/workspace-name/ — Workspace name spec & samples
 * @see .lovable/memory/features/macro-controller/workspace-detection-protocol.md — Tiered protocol
 */

import { CREDIT_API_BASE, loopCreditState, state } from './shared-state';
import { log, logSub } from './logging';
import { resolveToken, markBearerTokenExpired } from './auth';
import { matchWorkspaceByName } from './ws-name-matching';
import { detectWorkspaceViaProjectDialog } from './ws-dialog-detection';
import { logError } from './error-utils';

// ============================================
// Helper — auth failure check
// ============================================

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// ============================================
// Extract project ID from URL
// ============================================
export function extractProjectIdFromUrl(): string | null {
  const url = window.location.href;

  // Pattern 1: /projects/{id} editor route
  const pathMatch = url.match(/\/projects\/([^/?#]+)/);

  if (pathMatch) {
    return pathMatch[1];
  }

  try {
    const hostname = new URL(url).hostname;
    const firstLabel = hostname.split('.')[0] || '';

    // Pattern 2: id-preview--{uuid}.{domain}
    const idPreviewMatch = firstLabel.match(/^id-preview--([a-f0-9-]{36})$/i);

    if (idPreviewMatch) {
      return idPreviewMatch[1];
    }

    // Pattern 3: {uuid}--preview.{domain} or {uuid}-preview.{domain}
    const previewSuffixMatch = firstLabel.match(/^([a-f0-9-]{36})(?:--preview|-preview)$/i);

    if (previewSuffixMatch) {
      return previewSuffixMatch[1];
    }

    // Pattern 4: bare UUID subdomain: {uuid}.lovableproject.com
    const bareUuidLabelMatch = firstLabel.match(/^([a-f0-9-]{36})$/i);

    if (bareUuidLabelMatch) {
      return bareUuidLabelMatch[1];
    }
  } catch (e) {
    logError('resolveProjectId', 'URL parse error during project ID resolution', e);
    // ignore URL parse errors, fall through to legacy regex checks
  }

  // Legacy defensive fallbacks
  const subdomainMatch = url.match(/id-preview--([a-f0-9-]{36})\./i);

  if (subdomainMatch) {
    return subdomainMatch[1];
  }

  const altSubdomainMatch = url.match(/([a-f0-9-]{36})(?:--preview|-preview)\./i);

  if (altSubdomainMatch) {
    return altSubdomainMatch[1];
  }

  const bareUuidSubdomainMatch = url.match(/https?:\/\/([a-f0-9-]{36})\.[^/]+/i);

  if (bareUuidSubdomainMatch) {
    return bareUuidSubdomainMatch[1];
  }

  return null;
}

// ============================================
// Tier 2/3 fallback — dialog or passive detection
// ============================================

function fallbackDetect(
  fn: string,
  perWs: ReadonlyArray<{ id: string; name: string; fullName?: string }>,
  skipDialog: boolean,
): Promise<void> {
  if (state.isManualCheck) {
    log(fn + ': fallbackDetect blocked — manual Check in progress', 'warn');

    return Promise.resolve();
  }

  const isDialogSkipped = skipDialog || !state.running;

  if (isDialogSkipped) {
    log(fn + ': Tier 3 passive fallback — dialog detection intentionally skipped (skipDialog=' + (skipDialog ? 'true' : 'false') + ', running=' + (state.running ? 'true' : 'false') + ')', 'info');

    return Promise.resolve();
  }

  return detectWorkspaceViaProjectDialog(fn, perWs as Parameters<typeof detectWorkspaceViaProjectDialog>[1]).then(function () { /* discard btn */ });
}

// ============================================
// extractWorkspaceIdFromResponse — parses workspace_id from mark-viewed data
// ============================================

function extractWorkspaceIdFromResponse(data: Record<string, unknown>): string {
  const project = data.project as Record<string, unknown> | undefined;

  return (data.workspace_id as string)
    || (project && (project.workspace_id as string))
    || (data.workspaceId as string)
    || '';
}

// ============================================
// extractProjectNameFromResponse — pulls project name if present
// ============================================

function extractProjectNameFromResponse(fn: string, data: Record<string, unknown>): void {
  const project = data.project as Record<string, unknown> | undefined;
  const apiProjectName = (project && ((project.name as string) || (project.title as string)))
    || (data.name as string) || (data.title as string) || '';

  if (!apiProjectName || state.projectNameFromApi) {
    return;
  }

  state.projectNameFromApi = apiProjectName;
  log(fn + ': 📁 Project name from API: "' + apiProjectName + '"', 'success');
}

// ============================================
// matchWorkspaceById — O(1) lookup then linear scan fallback
// ============================================

function matchWorkspaceById(
  fn: string,
  wsId: string,
  perWs: ReadonlyArray<{ id: string; name: string; fullName?: string }>,
): boolean {
  const wsById = loopCreditState.wsById || {};
  const matchedWs = wsById[wsId];

  if (matchedWs) {
    state.workspaceName = matchedWs.fullName || matchedWs.name;
    state.workspaceFromApi = true;
    loopCreditState.currentWs = matchedWs;
    log(fn + ': ✅ Tier 1 MATCHED via wsById: "' + state.workspaceName + '" (id=' + wsId + ')', 'success');

    return true;
  }

  log(fn + ': Tier 1 — workspace_id "' + wsId + '" not in wsById (' + Object.keys(wsById).length + ' keys) — trying linear scan', 'warn');
  logSub('wsById keys: ' + Object.keys(wsById).slice(0, 10).join(', '), 1);

  for (const ws of perWs) {
    if (ws.id === wsId) {
      state.workspaceName = ws.fullName || ws.name;
      state.workspaceFromApi = true;
      loopCreditState.currentWs = ws as typeof loopCreditState.currentWs;
      log(fn + ': ✅ Tier 1 MATCHED via linear scan: "' + state.workspaceName + '" (id=' + wsId + ')', 'success');

      return true;
    }
  }

  return false;
}

// ============================================
// processTier1Response — handles mark-viewed API response
// ============================================

interface SdkApiResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly data: unknown;
  readonly headers: Record<string, string>;
}

async function processTier1Response(
  fn: string,
  resp: SdkApiResponse,
  perWs: ReadonlyArray<{ id: string; name: string; fullName?: string }>,
  skipDialog: boolean,
): Promise<void> {
  if (state.isManualCheck) {
    log(fn + ': Tier 1 response ignored — manual Check in progress', 'warn');

    return;
  }

  if (!resp.ok) {
    log(fn + ': Tier 1 FAILED — HTTP ' + resp.status + ' — falling to passive fallback', 'warn');

    if (isAuthFailure(resp.status)) {
      markBearerTokenExpired('loop');
    }

    await fallbackDetect(fn, perWs, skipDialog);

    return;
  }

  if (state.isManualCheck) {
    log(fn + ': Tier 1 body ignored — manual Check in progress', 'warn');

    return;
  }

  const data = resp.data as Record<string, unknown> | null;

  if (!data) {
    log(fn + ': Tier 1 — empty response body — falling to passive fallback', 'warn');
    await fallbackDetect(fn, perWs, skipDialog);

    return;
  }

  const wsId = extractWorkspaceIdFromResponse(data);
  extractProjectNameFromResponse(fn, data);

  logSub('Tier 1 response keys: ' + Object.keys(data).join(', '), 1);
  logSub('Extracted workspace_id: "' + wsId + '"', 1);

  if (!wsId) {
    log(fn + ': Tier 1 — no workspace_id in response — falling to passive fallback', 'warn');
    logSub('Response (first 400 chars): ' + JSON.stringify(data).substring(0, 400), 1);
    await fallbackDetect(fn, perWs, skipDialog);

    return;
  }

  const isMatched = matchWorkspaceById(fn, wsId, perWs);

  if (isMatched) {
    return;
  }

  log(fn + ': Tier 1 — workspace_id "' + wsId + '" not found in ' + perWs.length + ' workspaces — falling to passive fallback', 'warn');
  await fallbackDetect(fn, perWs, skipDialog);
}

// ============================================
// v7.19: Auto-detect current workspace
// Tier 1: POST /projects/{id}/mark-viewed → workspace_id → wsById lookup
// Tier 2: XPath detection via Project Dialog (RUNNING loop only)
// Tier 3: Passive no-op fallback (no dialog interaction)
// ============================================
/** Handle single-workspace case. Returns true if resolved. */
function handleSingleWorkspace(fn: string, perWs: import('./types').WorkspaceCredit[]): boolean {
  if (perWs.length !== 1) return false;
  if (!state.workspaceName) {
    state.workspaceName = perWs[0].fullName || perWs[0].name;
    state.workspaceFromApi = true;
    loopCreditState.currentWs = perWs[0];
    log(fn + ': Single workspace: ' + state.workspaceName, 'success');
  } else {
    log(fn + ': Single workspace — keeping existing name: "' + state.workspaceName + '"', 'success');
    loopCreditState.currentWs = perWs[0];
  }
  return true;
}

/** Check if workspace is already authoritatively set. Returns true if resolved. */
function checkAuthoritativeGuard(fn: string, perWs: import('./types').WorkspaceCredit[]): boolean {
  if (!state.workspaceFromApi || !state.workspaceName) return false;
  const matched = matchWorkspaceByName(state.workspaceName, perWs);
  if (matched) {
    loopCreditState.currentWs = matched;
    log(fn + ': ✅ GUARD — workspace already set authoritatively: "' + state.workspaceName + '" (skipping detection)', 'success');
    return true;
  }
  log(fn + ': GUARD — workspaceFromApi=true but "' + state.workspaceName + '" not found in list, falling through to Tier 1', 'warn');
  state.workspaceFromApi = false;
  return false;
}

export async function autoDetectLoopCurrentWorkspace(
  bearerToken?: string,
  opts?: { skipDialog?: boolean },
): Promise<void> {
  const fn = 'autoDetectLoopWs';
  const skipDialog = opts?.skipDialog ?? false;

  if (state.isManualCheck) {
    log(fn + ': ⚠️ GUARD — manual Check in progress (isManualCheck=true) — skipping autoDetect to prevent race', 'warn');
    return;
  }

  const perWs = loopCreditState.perWorkspace || [];
  if (perWs.length === 0) {
    log(fn + ': No workspaces loaded', 'warn');
    return;
  }

  if (checkAuthoritativeGuard(fn, perWs)) return;
  if (handleSingleWorkspace(fn, perWs)) return;

  const projectId = extractProjectIdFromUrl();
  const token = bearerToken || resolveToken();

  if (!projectId) {
    log(fn + ': No projectId in URL — skipping Tier 1, falling to passive fallback', 'info');
    await fallbackDetect(fn, perWs, skipDialog);
    return;
  }

  if (!token) {
    log(fn + ': No bearer token — skipping Tier 1, falling to passive fallback', 'info');
    await fallbackDetect(fn, perWs, skipDialog);
    return;
  }

  log(fn + ': Tier 1 — POST /projects/' + projectId + '/mark-viewed', 'check');

  try {
    const resp = await window.marco!.api!.workspace.markViewed(projectId, { baseUrl: CREDIT_API_BASE });
    await processTier1Response(fn, resp, perWs, skipDialog);
  } catch (err) {
    if (state.isManualCheck) return;
    log(fn + ': Tier 1 NETWORK ERROR: ' + (err instanceof Error ? err.message : String(err)) + ' — falling to passive fallback', 'warn');
    await fallbackDetect(fn, perWs, skipDialog);
  }
}

// ============================================
// Barrel re-exports
// ============================================
export { detectWorkspaceViaProjectDialog, closeProjectDialogSafe, detectWorkspaceFromDom } from './ws-dialog-detection';
export { normalizeWorkspaceName, matchWorkspaceByName, collectWorkspaceNameCandidatesFromNode } from './ws-name-matching';
