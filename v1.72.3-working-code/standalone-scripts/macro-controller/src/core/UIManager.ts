/**
 * UIManager — Wraps UI lifecycle into a class (V2 Phase 02, Step 6)
 *
 * Implements UIManagerInterface from MacroController.
 * Uses callback injection for createUI (defined in macro-looping.ts IIFE)
 * and delegates to ui-updaters.ts for update/destroy.
 *
 * See: spec/01-app/macrocontroller-ts-migration-v2/02-class-architecture.md
 */

import type { UIManagerInterface } from './MacroController';
import { updateUI, destroyPanel } from '../ui/ui-updaters';
import { populateLoopWorkspaceDropdown } from '../ws-selection-ui';
import { log } from '../logging';

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
      log('[UIManager] createUI not registered — cannot create UI', 'error');
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

  /** Rebuild the workspace dropdown list */
  populateDropdown(): void {
    populateLoopWorkspaceDropdown();
  }
}
