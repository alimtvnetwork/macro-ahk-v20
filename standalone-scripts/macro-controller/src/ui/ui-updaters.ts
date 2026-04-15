/**
 * MacroLoop Controller — UI Update Functions
 * Step 2b: Extracted from macro-looping.ts
 *
 * Phase 5 split: Status rendering moved to ui-status-renderer.ts.
 * This file is the orchestrator + barrel re-export.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { MacroController } from '../core/MacroController';
import { nsWrite, nsCallTyped } from '../api-namespace';
import { clearSkeletons } from './skeleton';
import { cacheWorkspaceName } from '../workspace-cache';
import { isInvalidWorkspaceCandidateName } from '../ws-name-matching';
import { getTitleBarDisplayState } from './title-bar-display';

function mc() { return MacroController.getInstance(); }
import { IDS, TIMING, state, loopCreditState } from '../shared-state';
import { log } from '../logging';
import { runCycle } from '../loop-engine';

// Re-export status renderer symbols
export { updateStatus, updateRecordIndicator, statusRenderStats } from './ui-status-renderer';
import { updateStatus, updateRecordIndicator } from './ui-status-renderer';

/**
 * Master UI refresh — calls all sub-updaters and repopulates workspace dropdown.
 * Use this when credit data or workspace identity changes.
 */
export function updateUI(): void {
  updateStatus();
  updateButtons();
  updateRecordIndicator();
  mc().ui?.populateDropdown();
  updateTitleBarWorkspaceName();

  // Persist workspace name to localStorage for instant UI on next load
  if (state.workspaceName && !state.workspaceFromCache && !isInvalidWorkspaceCandidateName(state.workspaceName)) {
    cacheWorkspaceName(
      state.workspaceName,
      loopCreditState.currentWs ? loopCreditState.currentWs.id : undefined,
    );
  }
  // Clear the "from cache" flag once real data arrives
  if (state.workspaceFromApi) {
    state.workspaceFromCache = false;
  }
}

/**
 * Lightweight UI refresh — updates status panel, buttons, and record indicator
 * WITHOUT rebuilding the workspace dropdown list.
 */
export function updateUILight(): void {
  updateStatus();
  updateButtons();
  updateRecordIndicator();
  updateTitleBarWorkspaceName();
}

/**
 * @deprecated — Removed: `loop-project-name` element no longer exists.
 * Workspace/project name is shown exclusively via `loop-title-ws-name` (wsNameEl).
 * Keeping as no-op to prevent runtime errors from any remaining callers.
 */
export function updateProjectNameDisplay(): void {
  // Intentionally empty — the `loop-project-name` element was removed to fix
  // the duplicate project name regression. See spec/02-app-issues/project-name-duplication-rca.md
}

/**
 * Update project name badge in title bar.
 */
export function updateTitleBarWorkspaceName(): void {
  const el = document.getElementById('loop-title-ws-name');
  if (!el) return;

  clearSkeletons(el);

  const syncIcon = document.getElementById('loop-ws-sync-icon');
  if (syncIcon) syncIcon.remove();

  const titleBarState = getTitleBarDisplayState();
  el.textContent = titleBarState.text;
  el.style.color = titleBarState.color;
  el.style.opacity = titleBarState.opacity;
  el.title = titleBarState.title;
}

/**
 * Sync the start/stop button visual state.
 */
export function updateButtons(): void {
  nsCallTyped('_internal.updateStartStopBtn', !!state.running);

  const stopBtn = document.getElementById(IDS.STOP_BTN);
  if (stopBtn) {
    (stopBtn as HTMLButtonElement).disabled = !state.running;
    stopBtn.style.opacity = state.running ? '1' : '0.5';
    stopBtn.style.cursor = state.running ? 'pointer' : 'not-allowed';
  }
}

/**
 * Button click animation — color flash only, no scale (v1.56).
 */
export function animateBtn(btn: HTMLElement): void {
  if (!btn) return;
  const origBg = btn.style.background || '';
  btn.style.transition = 'filter 100ms ease, background 150ms ease, opacity 100ms ease';
  btn.style.filter = 'brightness(0.75)';
  btn.style.opacity = '0.7';
  setTimeout(function() {
    btn.style.filter = 'brightness(1.2)';
    btn.style.opacity = '1';
    setTimeout(function() {
      btn.style.filter = '';
      btn.style.background = origBg;
    }, 180);
  }, 100);
}

/**
 * Consistent hover feedback — color transition only, no scale/translate (v1.56).
 */
export function attachButtonHoverFx(btn: HTMLElement): void {
  if (!btn) return;
  btn.style.transition = 'filter 150ms ease, background-color 150ms ease, box-shadow 150ms ease';
  btn.onmouseenter = function() {
    if ((btn as HTMLButtonElement).disabled) return;
    btn.style.filter = 'brightness(1.12)';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.3)';
  };
  btn.onmouseleave = function() {
    btn.style.filter = '';
    btn.style.boxShadow = '';
  };
}

/**
 * Set loop interval dynamically (called from AHK).
 */
export function setLoopInterval(newIntervalMs: number): boolean {
  const oldInterval = TIMING.LOOP_INTERVAL;
  TIMING.LOOP_INTERVAL = newIntervalMs;
  log('Interval changed: ' + oldInterval + 'ms -> ' + newIntervalMs + 'ms', 'success');

  state.countdown = Math.floor(newIntervalMs / 1000);

  if (state.running && state.loopIntervalId) {
    clearInterval(state.loopIntervalId);
    state.loopIntervalId = setInterval(runCycle, newIntervalMs);
    log('Loop timer restarted with new interval');
  }

  updateUI();
  return true;
}

/**
 * Fully destroy the controller panel and clean up globals for re-injection.
 */
export function destroyPanel(): void {
  log('MacroLoop panel DESTROYED by user — remove marker + globals for clean re-inject', 'warn');
  nsWrite('_internal.destroyed', true);

  try { nsCallTyped('api.loop.stop'); } catch (e) { log('destroyPanel: loop stop failed — ' + (e instanceof Error ? e.message : String(e)), 'warn'); }

  const marker = document.getElementById(IDS.SCRIPT_MARKER);
  if (marker) marker.remove();
  const container = document.getElementById(IDS.CONTAINER);
  if (container) container.remove();

  log('Teardown complete — re-inject script to restore controller', 'success');
}
