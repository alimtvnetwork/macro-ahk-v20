/**
 * MacroLoop Controller — Forbidden Workspace Rename Cache
 *
 * Manages a GroupedKv-backed set of workspace IDs that returned 403
 * on rename attempts. Cached workspaces are skipped in bulk rename
 * unless the user triggers a force-retry.
 *
 * @see spec/17-app-issues/60-grouped-kv-forbidden-rename.md
 */

import { log } from './logging';
import { sendToExtension } from './ui/prompt-manager';
import type { ExtensionResponse } from './types';
import { GKV_FORBIDDEN_GROUP as FORBIDDEN_GROUP } from './constants';
const forbiddenWsIds = new Set<string>();

/** Load forbidden workspace IDs from GroupedKv on controller init. */
export function loadForbiddenRenameCache(): void {
  sendToExtension('GKV_LIST', { group: FORBIDDEN_GROUP }).then(function (resp: ExtensionResponse) {
    const hasEntries = resp !== null && resp !== undefined && resp.entries !== undefined;

    if (hasEntries) {
      forbiddenWsIds.clear();
      for (const entry of resp.entries!) {
        forbiddenWsIds.add(entry.key);
      }
      const hasLoaded = forbiddenWsIds.size > 0;
      if (hasLoaded) {
        log('[Rename] Loaded ' + forbiddenWsIds.size + ' forbidden workspace(s) from cache', 'info');
      }
    }
  });
}

/** Check if a workspace is in the forbidden cache. */
export function isRenameForbidden(wsId: string): boolean {
  return forbiddenWsIds.has(wsId);
}

/** Get count of forbidden workspaces. */
export function getForbiddenCount(): number {
  return forbiddenWsIds.size;
}

/** Clear entire forbidden cache. */
export function clearForbiddenRenameCache(): void {
  forbiddenWsIds.clear();
  sendToExtension('GKV_CLEAR_GROUP', { group: FORBIDDEN_GROUP }).then(function () {
    log('[Rename] Forbidden rename cache cleared', 'success');
  });
}

/** Add a workspace to the forbidden cache. */
export function addForbidden(wsId: string, message: string): void {
  forbiddenWsIds.add(wsId);
  sendToExtension('GKV_SET', {
    group: FORBIDDEN_GROUP,
    key: wsId,
    value: JSON.stringify({ message: message, timestamp: new Date().toISOString() }),
  });
  log('[Rename] Cached workspace ' + wsId + ' as forbidden', 'warn');
}

/** Remove a workspace from the forbidden cache. */
export function removeForbidden(wsId: string): void {
  forbiddenWsIds.delete(wsId);
  sendToExtension('GKV_DELETE', { group: FORBIDDEN_GROUP, key: wsId });
  log('[Rename] Removed workspace ' + wsId + ' from forbidden cache', 'info');
}

/** Direct access to the forbidden set (for bulk checks). */
export function hasForbidden(wsId: string): boolean {
  return forbiddenWsIds.has(wsId);
}
