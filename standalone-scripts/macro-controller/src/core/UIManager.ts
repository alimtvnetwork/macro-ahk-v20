/**
 * UIManager — Wraps UI lifecycle into a class (V2 Phase 02, Step 6)
 *
 * Implements UIManagerInterface from MacroController.
 * Uses callback injection for createUI (defined in macro-looping.ts IIFE)
 * and delegates to ui-updaters.ts for update/destroy.
 *
 * See: spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import type { UIManagerInterface } from './MacroController';
import { updateUI, updateUILight, destroyPanel } from '../ui/ui-updaters';
import { populateLoopWorkspaceDropdown } from '../ws-selection-ui';
import { log } from '../logging';
import { logError } from '../error-utils';

export class UIManager implements UIManagerInterface {

  private _createFn: (() => void) | null = null;

  /**
   * Set the create callback — called from macro-looping.ts after createUI is defined.
   * This is necessary because createUI is defined inside the IIFE and cannot be imported.
   */
  setCreateFn(fn: () => void): void {
    this._createFn = fn;
    log('[UIManager] createUI callback registered', 'sub');
  }

  /** Create the controller UI panel */
  create(): void {
    if (this._createFn) {
      this._createFn();
    } else {
      logError('UIManager', 'createUI not registered — cannot create UI');
    }
  }

  /** Destroy the controller UI panel and clean up */
  destroy(): void {
    destroyPanel();
  }

  /** Refresh all UI elements (status, buttons, workspace dropdown) */
  update(): void {
    updateUI();
  }

  /** Lightweight refresh — status, buttons, record indicator only (no workspace list rebuild) */
  updateLight(): void {
    updateUILight();
  }

  /** Rebuild the workspace dropdown list */
  populateDropdown(): void {
    populateLoopWorkspaceDropdown();
  }
}
