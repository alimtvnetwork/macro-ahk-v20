/**
 * MacroLoop Controller — Idempotent Injection Check
 * Extracted from macro-looping.ts (V2 Phase 02).
 *
 * Handles:
 * - Version mismatch teardown and re-injection
 * - Same-version skip (marker + globals + UI all intact)
 * - SPA DOM wipe recovery (marker + globals intact, UI missing)
 * - Stale marker cleanup (marker present, globals missing)
 *
 * @returns 'proceed' to continue full bootstrap, 'abort' to skip injection
 */

import { VERSION, IDS } from './shared-state';
import { logSub } from './logging';
import { nsWrite, nsCallTyped, nsReadTyped } from './api-namespace';
import { UIManager } from './core/UIManager';

const LOG_MACROLOOP_V = '[MacroLoop v';

type IdempotentResult = 'proceed' | 'abort';

/**
 * Run idempotent injection check.
 * Handles teardown/recovery as needed.
 * @returns 'proceed' to continue with full bootstrap, 'abort' to exit IIFE
 */
export function runIdempotentCheck(): IdempotentResult {
  // v7.25: Clear destroyed flag on fresh injection
  nsWrite('_internal.destroyed', false);

  const existingMarker = document.getElementById(IDS.SCRIPT_MARKER);
  if (!existingMarker) return 'proceed';

  const existingVersion = existingMarker.getAttribute('data-version') || '';
  const isVersionMismatch = existingVersion !== VERSION;

  if (isVersionMismatch) {
    return handleVersionMismatch(existingMarker, existingVersion);
  }

  if (nsReadTyped('api.loop.start')) {
    return handleGlobalsIntact(existingMarker);
  }

  // Marker exists but globals missing — stale marker from crashed injection
  return handleStaleMarker(existingMarker);
}

function handleVersionMismatch(marker: HTMLElement, existingVersion: string): IdempotentResult {
  console.warn(LOG_MACROLOOP_V + VERSION + '] VERSION MISMATCH: existing=' + existingVersion + ' new=' + VERSION + ' — forcing re-injection');
  try { nsCallTyped('api.loop.stop'); } catch (e) { logSub('Version mismatch teardown: loop stop failed — ' + (e instanceof Error ? e.message : String(e)), 1); }
  marker.remove();
  const staleContainer = document.getElementById(IDS.CONTAINER);
  if (staleContainer) staleContainer.remove();
  return 'proceed';
}

function handleGlobalsIntact(marker: HTMLElement): IdempotentResult {
  const existingContainer = document.getElementById(IDS.CONTAINER);
  if (existingContainer) {
    console.log('%c[MacroLoop v' + VERSION + '] Already embedded (marker=' + IDS.SCRIPT_MARKER + ') — skipping injection, UI and state intact', 'color: #10b981; font-weight: bold;');
    return 'abort';
  }

  // Same version + globals intact, but UI container missing (SPA DOM wipe/race)
  console.warn(LOG_MACROLOOP_V + VERSION + '] Marker+globals present but UI missing — attempting controller UI recovery');
  return attemptUiRecovery(marker);
}

function attemptUiRecovery(marker: HTMLElement): IdempotentResult {
  try {
    const existingController = nsReadTyped('api.mc') as {
      ui?: { create?: () => void; update?: () => void } | null;
      hasUI?: boolean;
      registerUI?: (ui: unknown) => void;
      registerAuth?: (a: unknown) => void;
      registerCredits?: (c: unknown) => void;
      registerLoop?: (l: unknown) => void;
      registerWorkspaces?: (ws: unknown) => void;
      auth?: unknown;
      credits?: unknown;
      loop?: unknown;
      workspaces?: unknown;
    } | null;

    healAllManagers(existingController);

    if (existingController?.ui && typeof existingController.ui.create === 'function') {
      existingController.ui.create();
      if (typeof existingController.ui.update === 'function') {
        existingController.ui.update();
      }
    } else {
      console.warn(LOG_MACROLOOP_V + VERSION + '] UI recovery skipped — UIManager not available on existing controller');
    }
  } catch (e) {
    console.warn(LOG_MACROLOOP_V + VERSION + '] UI recovery via existing controller failed: ' + String(e));
  }

  if (document.getElementById(IDS.CONTAINER)) {
    console.log('%c[MacroLoop v' + VERSION + '] UI recovered without full re-bootstrap', 'color: #10b981; font-weight: bold;');
    return 'abort';
  }

  // Recovery failed — force full re-bootstrap
  console.warn(LOG_MACROLOOP_V + VERSION + '] UI recovery failed — forcing full re-bootstrap');
  try { nsCallTyped('api.loop.stop'); } catch (_e) { logSub('UI recovery fallback: loop stop failed — ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
  marker.remove();
  return 'proceed';
}


function healAllManagers(existingController: MacroControllerFacade): void {
  if (!existingController) return;

  // Self-heal UIManager
  if (!existingController.ui) {
    const savedUIFactory = nsRead('__createUIManager', '_internal.createUIManager') as (() => unknown) | null;
    if (savedUIFactory && typeof existingController.registerUI === 'function') {
      console.warn(LOG_MACROLOOP_V + VERSION + '] Self-healing: auto-registering UIManager from persisted factory');
      existingController.registerUI(savedUIFactory());
    } else {
      const savedCreateFn = nsRead('__createUIWrapper', '_internal.createUIWrapper') as (() => void) | null;
      if (savedCreateFn && typeof existingController.registerUI === 'function') {
        console.warn(LOG_MACROLOOP_V + VERSION + '] Self-healing: auto-registering UIManager from persisted createFn (legacy)');
        const healedUI = new UIManager();
        healedUI.setCreateFn(savedCreateFn);
        existingController.registerUI(healedUI);
      }
    }
  }

  // Self-heal other managers
  healManager(existingController, 'AuthManager', '_internal.createAuthManager', '__createAuthManager',
    () => existingController?.auth, existingController?.registerAuth);
  healManager(existingController, 'CreditManager', '_internal.createCreditManager', '__createCreditManager',
    () => existingController?.credits, existingController?.registerCredits);
  healManager(existingController, 'LoopEngine', '_internal.createLoopEngine', '__createLoopEngine',
    () => existingController?.loop, existingController?.registerLoop);
  healManager(existingController, 'WorkspaceManager', '_internal.createWorkspaceManager', '__createWorkspaceManager',
    () => existingController?.workspaces, existingController?.registerWorkspaces);
}

function healManager(
  _controller: unknown,
  label: string,
  nsKey: string,
  winKey: string,
  getter: () => unknown,
  register: ((m: unknown) => void) | undefined,
): void {
  if (typeof register !== 'function') return;
  let has = false;
  try { has = !!getter(); } catch (_e) { logSub('Self-heal getter threw for ' + label + ': ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
  if (!has) {
    const factory = nsRead(winKey, nsKey) as (() => unknown) | null;
    if (factory) {
      console.warn(LOG_MACROLOOP_V + VERSION + '] Self-healing: auto-registering ' + label + ' from persisted factory');
      register(factory());
    }
  }
}

function handleStaleMarker(marker: HTMLElement): IdempotentResult {
  console.warn(LOG_MACROLOOP_V + VERSION + '] Stale marker found (globals missing) — removing marker and re-initializing');
  marker.remove();
  const staleContainer = document.getElementById(IDS.CONTAINER);
  if (staleContainer) staleContainer.remove();
  return 'proceed';
}
