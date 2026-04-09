/**
 * MacroLoop Controller — API Namespace (Issue 79, Phase 9A–9D)
 *
 * Builds the structured namespace on RiseupAsiaMacroExt.Projects.MacroController
 * and provides write/read helpers. Phase 9D: window.__* globals are NO LONGER
 * written — the namespace is the single source of truth.
 *
 * Namespace structure:
 *   .meta       — version, displayName
 *   .api        — public console API (loop, credits, auth, workspace, ui, config, autoAttach)
 *   ._internal  — internal callbacks NOT for external use
 */

import { VERSION } from './shared-state';
import { log } from './logging';
import { logError } from './error-utils';
import { showToast } from './toast';

import type { MacroController } from './core/MacroController';
import type { ControllerState } from './types/config-types';
import type { DiagnosticDump } from './types/credit-types';
import type { RenameHistoryEntry } from './types/workspace-types';
import type { AutoAttachGroupRuntime } from './types/ui-types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Functions exposed on `api.loop` — loop lifecycle and diagnostics. */
export interface LoopApi {
  start: (direction?: string) => boolean;
  stop: () => boolean;
  check: () => void;
  state: () => ControllerState;
  setInterval: (ms: number) => void;
  diagnostics: () => DiagnosticDump;
}

/** Functions exposed on `api.credits` — credit fetch operations. */
export interface CreditsApi {
  fetch: (isRetry?: boolean) => void;
}

/** Functions exposed on `api.auth` — authentication token access. */
export interface AuthApi {
  getToken: () => string;
}

/** Functions exposed on `api.workspace` — workspace navigation and rename. */
export interface WorkspaceApi {
  moveTo: (wsId: string, wsName: string) => Promise<void>;
  forceSwitch: (direction: string) => void;
  bulkRename: (template: string, prefix: string, suffix: string, startNum?: number | Record<string, number>) => void;
  getRenameDelay: () => number;
  setRenameDelay: (ms: number) => void;
  cancelRename: () => void;
  undoRename: () => void;
  renameHistory: () => RenameHistoryEntry[];
}

/** Functions exposed on `api.ui` — UI lifecycle and refresh. */
export interface UiApi {
  refreshStatus: () => void;
  startStatusRefresh: () => void;
  stopStatusRefresh: () => void;
  destroy: () => void;
  toast: (message: string, level?: string) => void;
}

/** Functions exposed on `api.config` — runtime configuration setters. */
export interface ConfigApi {
  setProjectButtonXPath: (xpath: string) => void;
  setProgressXPath: (xpath: string) => void;
}

/** Functions exposed on `api.autoAttach` — auto-attach group runner. */
export interface AutoAttachApi {
  runGroup: (group: AutoAttachGroupRuntime) => void;
}

/** The public console API surface of the MacroController namespace. */
export interface MacroControllerApi {
  loop: LoopApi;
  credits: CreditsApi;
  auth: AuthApi;
  workspace: WorkspaceApi;
  ui: UiApi;
  config: ConfigApi;
  autoAttach: AutoAttachApi;
  mc: MacroController;
  [key: string]: unknown;
}

/** Internal callbacks NOT for external use. */
export interface MacroControllerInternal {
  resolvedToken?: string;
  destroyed?: boolean;
  exportBundle?: string;
  delegateComplete?: () => void;
  updateStartStopBtn?: (running: boolean) => void;
  updateAuthDiag?: () => void;
  createUIWrapper?: () => void;
  createUIManager?: () => object;
  createWorkspaceManager?: () => object;
  createAuthManager?: () => object;
  createCreditManager?: () => object;
  createLoopEngine?: () => object;
  [key: string]: unknown;
}

/** Full namespace shape on RiseupAsiaMacroExt.Projects.MacroController. */
export interface MacroControllerNamespace {
  meta: {
    version: string;
    displayName: string;
  };
  api: MacroControllerApi;
  _internal: MacroControllerInternal;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Typed path map — every valid namespace path with its value type     */
/* ------------------------------------------------------------------ */

/**
 * NsPathMap enumerates every known namespace path and its concrete type.
 * Used by nsWrite / nsReadTyped / nsCallTyped for compile-time safety
 * instead of dynamic `split('.')` traversal.
 */
export interface NsPathMap {
  // _internal
  '_internal.resolvedToken': string;
  '_internal.destroyed': boolean;
  '_internal.exportBundle': string | undefined;
  '_internal.delegateComplete': (() => void) | undefined;
  '_internal.updateStartStopBtn': ((running: boolean) => void) | undefined;
  '_internal.updateAuthDiag': (() => void) | undefined;
  '_internal.createUIWrapper': (() => void) | undefined;
  '_internal.createUIManager': (() => object) | undefined;
  '_internal.createWorkspaceManager': (() => object) | undefined;
  '_internal.createAuthManager': (() => object) | undefined;
  '_internal.createCreditManager': (() => object) | undefined;
  '_internal.createLoopEngine': (() => object) | undefined;
  // api (top-level)
  'api.mc': MacroController;
  // api.loop
  'api.loop.start': LoopApi['start'];
  'api.loop.stop': LoopApi['stop'];
  'api.loop.check': LoopApi['check'];
  'api.loop.state': LoopApi['state'];
  'api.loop.setInterval': LoopApi['setInterval'];
  'api.loop.diagnostics': LoopApi['diagnostics'];
  // api.credits
  'api.credits.fetch': CreditsApi['fetch'];
  // api.auth
  'api.auth.getToken': AuthApi['getToken'];
  // api.workspace
  'api.workspace.moveTo': WorkspaceApi['moveTo'];
  'api.workspace.forceSwitch': WorkspaceApi['forceSwitch'];
  'api.workspace.bulkRename': WorkspaceApi['bulkRename'];
  'api.workspace.getRenameDelay': WorkspaceApi['getRenameDelay'];
  'api.workspace.setRenameDelay': WorkspaceApi['setRenameDelay'];
  'api.workspace.cancelRename': WorkspaceApi['cancelRename'];
  'api.workspace.undoRename': WorkspaceApi['undoRename'];
  'api.workspace.renameHistory': WorkspaceApi['renameHistory'];
  // api.ui
  'api.ui.refreshStatus': UiApi['refreshStatus'];
  'api.ui.startStatusRefresh': UiApi['startStatusRefresh'];
  'api.ui.stopStatusRefresh': UiApi['stopStatusRefresh'];
  'api.ui.destroy': UiApi['destroy'];
  'api.ui.toast': UiApi['toast'];
  // api.config
  'api.config.setProjectButtonXPath': ConfigApi['setProjectButtonXPath'];
  'api.config.setProgressXPath': ConfigApi['setProgressXPath'];
  // api.autoAttach
  'api.autoAttach.runGroup': AutoAttachApi['runGroup'];
}

/* ------------------------------------------------------------------ */
/*  Namespace resolution                                               */
/* ------------------------------------------------------------------ */

// CQ11: Singleton for cached namespace reference
class NamespaceCache {
  private _ns: MacroControllerNamespace | null = null;

  get ns(): MacroControllerNamespace | null {
    return this._ns;
  }

  set ns(v: MacroControllerNamespace | null) {
    this._ns = v;
  }
}

const nsCache = new NamespaceCache();

/**
 * Get or create the MacroController namespace on RiseupAsiaMacroExt.
 * Safe to call multiple times — idempotent.
 */
export function getNamespace(): MacroControllerNamespace | null {
  if (nsCache.ns) return nsCache.ns;

  try {
    const root = RiseupAsiaMacroExt;
    if (!root || !root.Projects) return null;

    if (!root.Projects.MacroController) {
      root.Projects.MacroController = {};
    }

    const mc = root.Projects.MacroController as MacroControllerNamespace;

    // Ensure sub-objects exist
    if (!mc.meta) mc.meta = { version: '', displayName: '' };
    if (!mc.api) mc.api = {} as MacroControllerApi;
    const api = mc.api;
    if (!api.loop) api.loop = {} as LoopApi;
    if (!api.credits) api.credits = {} as CreditsApi;
    if (!api.auth) api.auth = {} as AuthApi;
    if (!api.workspace) api.workspace = {} as WorkspaceApi;
    if (!api.ui) api.ui = {} as UiApi;
    if (!api.config) api.config = {} as ConfigApi;
    if (!api.autoAttach) api.autoAttach = {} as AutoAttachApi;
    if (!mc._internal) mc._internal = {} as MacroControllerInternal;

    // Set meta
    mc.meta.version = VERSION;
    mc.meta.displayName = 'Macro Controller';

    nsCache.ns = mc;
    return nsCache.ns;
  } catch (e) {
    logError('getNamespace', 'Failed to access MacroController namespace', e);
    showToast('❌ Failed to access MacroController namespace', 'error');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Write helpers (Phase 9D — namespace only, NO window globals)       */
/* ------------------------------------------------------------------ */

/**
 * Write a value to the namespace path only.
 * Phase 9D: window.__* globals are no longer set.
 * @param _windowKey — legacy key (kept for callsite readability / grep-ability)
 * @param nsPath     — namespace path, e.g. 'api.loop.start'
 * @param value      — the value to set
 */
export function dualWrite(_windowKey: string, nsPath: string, value: unknown): void {
  // Write to namespace
  const ns = getNamespace();
  if (!ns) return;

  const parts = nsPath.split('.');
  let obj: Record<string, unknown> = ns;

  for (const part of parts.slice(0, -1)) {
    if (!obj[part]) {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, unknown>;
  }

  obj[parts[parts.length - 1]] = value;
}

/**
 * Batch write from a mapping array.
 * @param entries — Array of [windowKey, nsPath, value]
 */
export function dualWriteAll(entries: Array<[string, string, unknown]>): void {
  for (const [windowKey, nsPath, value] of entries) {
    dualWrite(windowKey, nsPath, value);
  }
}

/* ------------------------------------------------------------------ */
/*  Initialize namespace (call after SDK registration)                 */
/* ------------------------------------------------------------------ */

export function initNamespace(): MacroControllerNamespace | null {
  const ns = getNamespace();
  if (ns) {
    log('[Namespace] MacroController API namespace initialized (v' + VERSION + ')', 'sub');
  } else {
    log('[Namespace] SDK namespace not available — functions accessible via MacroController singleton only', 'sub');
  }
  return ns;
}

/* ------------------------------------------------------------------ */
/*  Read helpers (Phase 9B)                                            */
/* ------------------------------------------------------------------ */

/**
 * Read a value from the namespace path.
 * Phase 9D: window fallback removed — namespace is the single source.
 * @param _windowKey — legacy key (kept for grep-ability)
 * @param nsPath     — namespace path, e.g. '_internal.updateStartStopBtn'
 */
export function nsRead(_windowKey: string, nsPath: string): unknown {
  const ns = getNamespace();
  if (ns) {
    const parts = nsPath.split('.');
    let obj: unknown = ns;

    for (const part of parts) {
      if (obj == null) {
        break;
      }
      obj = (obj as Record<string, unknown>)[part];
    }

    if (obj !== undefined) {
      return obj;
    }
  }
  return undefined;
}

/**
 * Call a function from the namespace.
 * No-op if the function doesn't exist.
 */
export function nsCall(_windowKey: string, nsPath: string, ...args: unknown[]): unknown {
  const fn = nsRead(_windowKey, nsPath);
  if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
}
