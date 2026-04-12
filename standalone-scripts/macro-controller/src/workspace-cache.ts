import { logError } from './error-utils';
/**
 * Workspace Cache — localStorage persistence for instant UI on reload.
 *
 * Caches the last-known workspace name **per project** so the UI-first
 * bootstrap can display it immediately at t=0, before any API call resolves.
 * The cache is scoped by project ID extracted from the URL to prevent
 * stale workspace names from persisting across different projects.
 *
 * Ref: .lovable/memory/features/macro-controller/startup-initialization.md
 * Ref: .lovable/fixes/macro-controller-toast-crash-and-slow-startup.md
 */

const WS_CACHE_PREFIX = 'marco_ws_cache_';
const WS_LAST_PROJECT_KEY = 'marco_last_project_id';

/** Extract project ID from the current URL (lovable.dev/projects/{id} or {id}-preview--{uuid}). */
function resolveProjectId(): string {
  try {
    const href = window.location.href;
    // Pattern 1: /projects/{uuid}
    const projMatch = href.match(/\/projects\/([a-f0-9-]{36})/i);
    if (projMatch) {
      return projMatch[1];
    }
    // Pattern 2: {id}-preview--{uuid}.lovable.app
    const previewMatch = href.match(/([a-f0-9-]{36})\.lovable(?:project)?\.(?:app|com)/i);
    if (previewMatch) {
      return previewMatch[1];
    }
    // Pattern 3: id-preview--{uuid}
    const altMatch = href.match(/id-preview--([a-f0-9-]{36})/i);
    if (altMatch) {
      return altMatch[1];
    }
  } catch (_e) { console.debug('[RiseupAsia] [resolveProjectId] URL parse failed: ' + (_e instanceof Error ? _e.message : String(_e))); }
  return '_default';
}

function cacheKey(projectId: string, suffix: string): string {
  return WS_CACHE_PREFIX + projectId + '_' + suffix;
}

/** Read cached workspace name for the current project (returns '' if missing). */
export function getCachedWorkspaceName(): string {
  try {
    const pid = resolveProjectId();
    return localStorage.getItem(cacheKey(pid, 'name')) || '';
  } catch (e) {
    logError('getCachedWsName', 'Failed to read cached workspace name', e);
    return '';
  }
}

/** Read cached workspace ID for the current project. */
export function getCachedWorkspaceId(): string {
  try {
    const pid = resolveProjectId();
    return localStorage.getItem(cacheKey(pid, 'id')) || '';
  } catch (e) {
    logError('getCachedWsId', 'Failed to read cached workspace ID', e);
    return '';
  }
}

/** Persist workspace name + optional ID to localStorage (scoped to current project). */
export function cacheWorkspaceName(name: string, id?: string): void {
  try {
    const pid = resolveProjectId();
    if (name) {
      localStorage.setItem(cacheKey(pid, 'name'), name);
    } else {
      localStorage.removeItem(cacheKey(pid, 'name'));
    }
    if (id !== undefined) {
      if (id) {
        localStorage.setItem(cacheKey(pid, 'id'), id);
      } else {
        localStorage.removeItem(cacheKey(pid, 'id'));
      }
    }
    // Track last project for cross-project detection
    localStorage.setItem(WS_LAST_PROJECT_KEY, pid);
  } catch (e) {
    logError('setCachedWs', 'Failed to persist workspace cache', e);
    // localStorage unavailable — no-op
  }
}

/**
 * Clear workspace cache if the current project differs from the last cached one.
 * Called during bootstrap to prevent stale workspace names across projects.
 */
export function invalidateCacheOnProjectSwitch(): void {
  try {
    const currentPid = resolveProjectId();
    const lastPid = localStorage.getItem(WS_LAST_PROJECT_KEY) || '';
    if (lastPid && lastPid !== currentPid && currentPid !== '_default') {
      // Different project — clear old project's cache (it stays for that project)
      // Just update the tracker; each project has its own scoped keys
      localStorage.setItem(WS_LAST_PROJECT_KEY, currentPid);
    }
  } catch (_e) { console.warn('[RiseupAsia] [detectProjectSwitch] localStorage write failed: ' + (_e instanceof Error ? _e.message : String(_e))); }
}

/**
 * Clean up stale cache entries from old (non-scoped) format.
 * Safe to call multiple times — removes legacy keys if present.
 */
export function migrateLegacyCache(): void {
  try {
    const oldName = localStorage.getItem('marco_last_workspace_name');
    const oldId = localStorage.getItem('marco_last_workspace_id');
    if (oldName || oldId) {
      // Migrate to scoped format for current project
      const pid = resolveProjectId();
      if (oldName) {
        localStorage.setItem(cacheKey(pid, 'name'), oldName);
        localStorage.removeItem('marco_last_workspace_name');
      }
      if (oldId) {
        localStorage.setItem(cacheKey(pid, 'id'), oldId);
        localStorage.removeItem('marco_last_workspace_id');
      }
    }
  } catch (_e) { console.warn('[RiseupAsia] [migrateLegacyCache] localStorage read/write failed: ' + (_e instanceof Error ? _e.message : String(_e))); }
}
