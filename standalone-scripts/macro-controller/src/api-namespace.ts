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
import type { MacroControllerNamespaceShape, MacroControllerApiShape } from './types/api-data-types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MacroControllerNamespace {
  meta: {
    version: string;
    displayName: string;
  };
  api: {
    loop: Record<string, NamespaceValue>;
    credits: Record<string, NamespaceValue>;
    auth: Record<string, NamespaceValue>;
    workspace: Record<string, NamespaceValue>;
    ui: Record<string, NamespaceValue>;
    config: Record<string, NamespaceValue>;
    autoAttach: Record<string, NamespaceValue>;
    mc: NamespaceValue;
    [key: string]: NamespaceValue;
  };
  _internal: Record<string, NamespaceValue>;
  [key: string]: NamespaceValue;
}

/** Generic namespace value — replaces explicit `unknown` across namespace operations. */
export type NamespaceValue = string | number | boolean | null | undefined | object | NamespaceFunction | Record<string, NamespaceValue>;

/** Callable namespace function signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NamespaceFunction = (...args: any[]) => any;

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
// eslint-disable-next-line max-lines-per-function -- namespace bootstrapper: initializes 8 sub-objects idempotently
export function getNamespace(): MacroControllerNamespace | null {
  if (nsCache.ns) {
    return nsCache.ns;
  }

  try {
    const root = RiseupAsiaMacroExt;
    if (!root || !root.Projects) {
      return null;
    }

    if (!root.Projects.MacroController) {
      root.Projects.MacroController = {};
    }

    const mc = root.Projects.MacroController as MacroControllerNamespaceShape;

    // Ensure sub-objects exist
    if (!mc.meta) {
      mc.meta = {}
    }
    if (!mc.api) {
      mc.api = {}
    }
    const api = mc.api as MacroControllerApiShape;
    if (!api.loop) {
      api.loop = {}
    }
    if (!api.credits) {
      api.credits = {}
    }
    if (!api.auth) {
      api.auth = {}
    }
    if (!api.workspace) {
      api.workspace = {}
    }
    if (!api.ui) {
      api.ui = {}
    }
    if (!api.config) {
      api.config = {}
    }
    if (!api.autoAttach) {
      api.autoAttach = {}
    }
    if (!mc._internal) {
      mc._internal = {}
    }

    // Set meta
    (mc.meta as Record<string, string>).version = VERSION;
    (mc.meta as Record<string, string>).displayName = 'Macro Controller';

    nsCache.ns = mc as MacroControllerNamespace;
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
export function dualWrite(_windowKey: string, nsPath: string, value: NamespaceValue): void {
  // Write to namespace
  const ns = getNamespace();
  if (!ns) {
    return;
  }

  const parts = nsPath.split('.');
  let obj: Record<string, NamespaceValue> = ns;

  for (const part of parts.slice(0, -1)) {
    if (!obj[part]) {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, NamespaceValue>;
  }

  obj[parts[parts.length - 1]] = value;
}

/**
 * Batch write from a mapping array.
 * @param entries — Array of [windowKey, nsPath, value]
 */
export function dualWriteAll(entries: Array<[string, string, NamespaceValue]>): void {
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
export function nsRead(_windowKey: string, nsPath: string): NamespaceValue {
  const ns = getNamespace();
  if (ns) {
    const parts = nsPath.split('.');
    let obj: NamespaceValue = ns;

    for (const part of parts) {
      if (obj == null) {
        break;
      }
      obj = (obj as Record<string, NamespaceValue>)[part];
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
export function nsCall(_windowKey: string, nsPath: string, ...args: NamespaceValue[]): NamespaceValue {
  const fn = nsRead(_windowKey, nsPath);
  if (typeof fn === 'function') {
    return (fn as NamespaceFunction)(...args);
  }
}
