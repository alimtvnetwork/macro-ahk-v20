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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MacroControllerNamespace {
  meta: {
    version: string;
    displayName: string;
  };
  api: {
    loop: Record<string, any>;
    credits: Record<string, any>;
    auth: Record<string, any>;
    workspace: Record<string, any>;
    ui: Record<string, any>;
    config: Record<string, any>;
    autoAttach: Record<string, any>;
    mc: any;
  };
  _internal: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Namespace resolution                                               */
/* ------------------------------------------------------------------ */

let _ns: MacroControllerNamespace | null = null;

/**
 * Get or create the MacroController namespace on RiseupAsiaMacroExt.
 * Safe to call multiple times — idempotent.
 */
export function getNamespace(): MacroControllerNamespace | null {
  if (_ns) return _ns;

  try {
    const root = (window as any).RiseupAsiaMacroExt;
    if (!root || !root.Projects) return null;

    if (!root.Projects.MacroController) {
      root.Projects.MacroController = {};
    }

    const mc = root.Projects.MacroController;

    // Ensure sub-objects exist
    if (!mc.meta) mc.meta = {};
    if (!mc.api) mc.api = {};
    if (!mc.api.loop) mc.api.loop = {};
    if (!mc.api.credits) mc.api.credits = {};
    if (!mc.api.auth) mc.api.auth = {};
    if (!mc.api.workspace) mc.api.workspace = {};
    if (!mc.api.ui) mc.api.ui = {};
    if (!mc.api.config) mc.api.config = {};
    if (!mc.api.autoAttach) mc.api.autoAttach = {};
    if (!mc._internal) mc._internal = {};

    // Set meta
    mc.meta.version = VERSION;
    mc.meta.displayName = 'Macro Controller';

    _ns = mc as MacroControllerNamespace;
    return _ns;
  } catch (_e) {
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
export function dualWrite(_windowKey: string, nsPath: string, value: any): void {
  // Write to namespace
  const ns = getNamespace();
  if (!ns) return;

  const parts = nsPath.split('.');
  let obj: any = ns;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

/**
 * Batch write from a mapping array.
 * @param entries — Array of [windowKey, nsPath, value]
 */
export function dualWriteAll(entries: Array<[string, string, any]>): void {
  for (let i = 0; i < entries.length; i++) {
    dualWrite(entries[i][0], entries[i][1], entries[i][2]);
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
export function nsRead(_windowKey: string, nsPath: string): any {
  const ns = getNamespace();
  if (ns) {
    const parts = nsPath.split('.');
    let obj: any = ns;
    for (let i = 0; i < parts.length; i++) {
      if (obj == null) break;
      obj = obj[parts[i]];
    }
    if (obj !== undefined) return obj;
  }
  return undefined;
}

/**
 * Call a function from the namespace.
 * No-op if the function doesn't exist.
 */
export function nsCall(_windowKey: string, nsPath: string, ...args: any[]): any {
  const fn = nsRead(_windowKey, nsPath);
  if (typeof fn === 'function') return fn(...args);
}
