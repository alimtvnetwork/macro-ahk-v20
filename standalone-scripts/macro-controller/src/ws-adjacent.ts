/**
 * Workspace Adjacent Navigation — Move to adjacent workspace with fresh fetch and skip logic.
 *
 * Extracted from workspace-management.ts (module splitting).
 * Contains: moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached.
 *
 * v7.40: Migrated from raw fetch() to httpRequest() (XMLHttpRequest + Promise).
 * v7.50: Migrated to marco.api centralized SDK (Axios + registry).
 *
 * @see memory/architecture/networking/centralized-api-registry
 */

import { MacroController } from './core/MacroController';
import { log, logSub } from './logging';
import { resolveToken, invalidateSessionBridgeKey, recoverAuthOnce } from './auth';
import { parseLoopApiResponse } from './credit-fetch';
import { showToast } from './toast';
import { CREDIT_API_BASE, loopCreditState, state } from './shared-state';
import { moveToWorkspace, updateLoopMoveStatus } from './ws-move';
import { logError } from './error-utils';

function mc() { return MacroController.getInstance(); }

// ============================================
// Helper — auth failure check
// ============================================

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

// ============================================
// Delegation state reset helper
// ============================================

function clearDelegationState(): void {
  state.isDelegating = false;
  state.forceDirection = null;
  state.delegateStartTime = 0;
}

// ============================================
// Token failure handler
// ============================================

function handleNoTokenFailure(): void {
  logError('moveToAdjacentWorkspace', 'no bearer token available — request blocked');
  updateLoopMoveStatus('error', 'Auth token missing');
  showToast('Cannot fetch workspaces: bearer token is missing.', 'error', { noStop: true });
  clearDelegationState();
}

// ============================================
// Find current workspace index
// ============================================

function findCurrentWorkspaceIndex(
  workspaces: ReadonlyArray<{ fullName?: string; name: string }>,
  currentName: string,
): number {
  for (const [wsIdx, ws] of workspaces.entries()) {
    if (ws.fullName === currentName || ws.name === currentName) {
      return wsIdx;
    }
  }

  if (!currentName) {
    return 0;
  }

  // Partial match fallback
  const lowerName = currentName.toLowerCase();

  for (const [wsIdx, ws] of workspaces.entries()) {
    const fullNameLower = (ws.fullName || '').toLowerCase();
    const isPartialMatch = fullNameLower.indexOf(lowerName) !== -1
      || lowerName.indexOf(fullNameLower) !== -1;

    if (isPartialMatch) {
      log('Workspace partial match: "' + currentName + '" ~ "' + ws.fullName + '"', 'warn');

      return wsIdx;
    }
  }

  log('Current workspace "' + currentName + '" not found — using idx 0', 'warn');

  return 0;
}

// ============================================
// Find target workspace with free credits
// ============================================

function findTargetWorkspaceIndex(
  workspaces: ReadonlyArray<{ fullName?: string; dailyFree?: number }>,
  currentIdx: number,
  direction: string,
): number {
  const len = workspaces.length;
  const step = direction === 'up' ? -1 : 1;
  let targetIdx = -1;
  let fallbackIdx = -1;

  for (let s = 1; s <= len; s++) {
    const candidateIdx = ((currentIdx + step * s) % len + len) % len;

    if (candidateIdx === currentIdx) {
      continue;
    }

    if (fallbackIdx === -1) {
      fallbackIdx = candidateIdx;
    }

    const candidate = workspaces[candidateIdx];
    const candidateDailyFree = candidate.dailyFree || 0;
    logSub('Checking ' + direction + ' #' + s + ': "' + candidate.fullName + '" dailyFree=' + candidateDailyFree, 1);

    if (candidateDailyFree > 0) {
      targetIdx = candidateIdx;
      log('Found workspace with free credit: "' + candidate.fullName + '" (dailyFree=' + candidateDailyFree + ', ' + s + ' step(s) ' + direction + ')', 'success');

      break;
    }
  }

  if (targetIdx !== -1) {
    return targetIdx;
  }

  log('⚠️ No workspace has dailyFree > 0 — falling back to immediate ' + direction + ' neighbor', 'warn');

  return fallbackIdx !== -1 ? fallbackIdx : ((currentIdx + step) % len + len) % len;
}

// ============================================
// Process fresh workspace data and perform move
// ============================================

function processWorkspacesAndMove(
  direction: string,
  workspaces: ReadonlyArray<{ id: string; name: string; fullName?: string; dailyFree?: number; raw?: { id?: string } }>,
): void {
  const currentName = state.workspaceName || '';
  const currentIdx = findCurrentWorkspaceIndex(workspaces, currentName);
  const targetIdx = findTargetWorkspaceIndex(workspaces, currentIdx, direction);
  const target = workspaces[targetIdx];
  const targetId = String((target.raw && target.raw.id) || target.id || '');
  const len = workspaces.length;

  let skipped = Math.abs(targetIdx - currentIdx);

  if (skipped < 0) {
    skipped += len;
  }

  log(
    'API Move ' + direction.toUpperCase() + ': "' + currentName + '" (#' + currentIdx + ') -> "' +
    target.fullName + '" (#' + targetIdx + ') dailyFree=' + (target.dailyFree || 0) +
    (skipped > 1 ? ' (skipped ' + (skipped - 1) + ' depleted)' : ''),
    'delegate',
  );

  moveToWorkspace(targetId, target.fullName || target.name);
  mc().credits.sync();
  mc().updateUI();
}

// ============================================
// Handle auth failure during workspace fetch
// ============================================

async function handleAdjacentAuthFailure(
  token: string,
  status: number,
): Promise<void> {
  const invalidatedKey = invalidateSessionBridgeKey(token);
  log('moveToAdjacentWorkspace: Auth ' + status + ' — invalidated "' + invalidatedKey + '", retrying with fallback', 'warn');
  showToast('Workspace fetch auth ' + status + ' — token "' + invalidatedKey + '" expired, retrying...', 'warn', { noStop: true });

  const fallbackToken = resolveToken();

  if (fallbackToken) {
    await doFetchWorkspacesForMove(false, true);

    return;
  }

  const recoveredToken = await recoverAuthOnce();
  const refreshedToken = recoveredToken || resolveToken();

  if (!refreshedToken) {
    handleNoTokenFailure();

    return;
  }

  await doFetchWorkspacesForMove(false, true);
}

// ============================================
// Core fetch + parse for adjacent workspace move (via SDK)
// ============================================

async function doFetchWorkspacesForMove(
  _unused: boolean,
  isRetry: boolean,
): Promise<void> {
  const token = resolveToken();

  if (!token) {
    if (isRetry) {
      handleNoTokenFailure();

      return;
    }

    log('moveToAdjacentWorkspace: no token — recovering before request', 'warn');
    const recoveredToken = await recoverAuthOnce();
    const refreshedToken = recoveredToken || resolveToken();

    if (!refreshedToken) {
      handleNoTokenFailure();

      return;
    }

    return doFetchWorkspacesForMove(false, true);
  }

  const resp = await window.marco!.api!.credits.fetchWorkspaces({ baseUrl: CREDIT_API_BASE });

  if (isAuthFailure(resp.status) && !isRetry) {
    await handleAdjacentAuthFailure(token, resp.status);

    return;
  }

  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status);
  }

  const data = resp.data as Record<string, unknown>;
  const isParseOk = parseLoopApiResponse(data);

  if (!isParseOk) {
    logError('moveToAdjacentWorkspace', 'Failed to parse workspace data');
    updateLoopMoveStatus('error', 'Failed to parse workspaces');
    clearDelegationState();

    return;
  }

  const workspaces = loopCreditState.perWorkspace || [];

  if (workspaces.length === 0) {
    logError('unknown', 'No workspaces loaded from API');
    updateLoopMoveStatus('error', 'No workspaces found');
    clearDelegationState();

    return;
  }

  log('moveToAdjacentWorkspace: Fresh data loaded — ' + workspaces.length + ' workspaces', 'success');

  return;
}

// ============================================
// moveToAdjacentWorkspaceCached — Fallback using cached data
// ============================================

export function moveToAdjacentWorkspaceCached(direction: string): void {
  const workspaces = loopCreditState.perWorkspace || [];

  if (workspaces.length === 0) {
    logError('unknown', 'No cached workspaces — click 💳 first');
    updateLoopMoveStatus('error', 'Load workspaces first (💳)');
    clearDelegationState();

    return;
  }

  const currentName = state.workspaceName || '';
  const currentIdx = findCurrentWorkspaceIndex(workspaces, currentName);
  const len = workspaces.length;
  const step = direction === 'up' ? -1 : 1;
  const targetIdx = ((currentIdx + step) % len + len) % len;
  const target = workspaces[targetIdx];
  const targetId = String((target.raw && target.raw.id) || target.id || '');

  log('API Move (cached fallback) ' + direction.toUpperCase() + ': -> "' + target.fullName + '"', 'delegate');
  moveToWorkspace(targetId, target.fullName || target.name);
}

// ============================================
// moveToAdjacentWorkspace — Fresh fetch + smart skip
// ============================================

export async function moveToAdjacentWorkspace(direction: string): Promise<void> {
  log('moveToAdjacentWorkspace(' + direction + '): Fetching fresh workspace data before move...', 'delegate');
  updateLoopMoveStatus('loading', 'Fetching workspaces...');

  let token = resolveToken();

  if (!token) {
    log('moveToAdjacentWorkspace: no token — recovering before initial fetch', 'warn');

    try {
      const recoveredToken = await recoverAuthOnce();
      token = recoveredToken || resolveToken();
    } catch {
      handleNoTokenFailure();

      return;
    }

    if (!token) {
      handleNoTokenFailure();

      return;
    }
  }

  try {
    await doFetchWorkspacesForMove(false, false);

    const workspaces = loopCreditState.perWorkspace || [];

    if (workspaces.length > 0) {
      processWorkspacesAndMove(direction, workspaces);
    }
  } catch (err) {
    logError('moveToAdjacentWorkspace', 'Fetch failed — \' + (err as Error).message + \'. Falling back to cached data.');
    moveToAdjacentWorkspaceCached(direction);
  }
}
