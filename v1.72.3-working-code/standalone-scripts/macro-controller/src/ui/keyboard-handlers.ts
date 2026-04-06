/**
 * MacroLoop Controller — Keyboard Handlers
 * Step 2g: Extracted from macro-looping.ts
 *
 * Shortcuts:
 * - Ctrl+/          → Toggle JS Executor
 * - Ctrl+,          → Open Settings
 * - Ctrl+1          → Position bottom-left
 * - Ctrl+3          → Position bottom-right
 * - Ctrl+Up/Down    → Force move workspace
 * - Ctrl+Alt+H      → Toggle panel visibility
 * - Ctrl+Alt+Up     → Start/stop loop up
 * - Ctrl+Alt+Down   → Start/stop loop down
 * - Ctrl+Shift+1..9 → Task Next with preset count (1-9)
 * - Ctrl+Shift+0    → Task Next ×10
 * - Escape          → Cancel running Task Next
 */

import { log } from '../logging';
import { state } from '../shared-state';
import { showSettingsDialog } from './settings-ui';
import { positionLoopController } from './panel-layout';
import { runTaskNextLoop } from './task-next-ui';
import type { TaskNextDeps } from './task-next-ui';

export interface KeyboardHandlerDeps {
  jsBody: HTMLElement;
  plCtx: any;
  settingsDeps: any;
  ui: HTMLElement;
  startLoop: (dir: string) => void;
  stopLoop: () => void;
  forceSwitch: (dir: string) => void;
  restorePanel: (ctx: any) => void;
  taskNextDeps?: TaskNextDeps;
}

/**
 * Check if current URL is a project/preview page (not settings).
 */
function isOnProjectPageForShortcut(): boolean {
  try {
    const parsed = new URL(window.location.href);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const isSupportedHost = (
      host === 'localhost'
      || host.endsWith('.localhost')
      || host === 'lovable.dev'
      || host.endsWith('.lovable.dev')
      || host.endsWith('.lovable.app')
      || host.endsWith('.lovableproject.com')
    );

    if (!isSupportedHost) return false;

    const isSettings = path.includes('/settings');
    const isProjectPath = path.includes('/projects/');
    const isPreviewHost = host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com');

    return (isProjectPath || isPreviewHost) && !isSettings;
  } catch {
    return false;
  }
}

/** Map of Ctrl+Shift digit keys to Task Next preset counts. */
const TASK_NEXT_PRESETS: Record<string, number> = {
  '!': 1, '@': 2, '#': 3, '$': 4, '%': 5,
  '^': 6, '&': 7, '*': 8, '(': 9, ')': 10,
};

/**
 * Register all keyboard shortcuts for the controller.
 */
export function registerKeyboardHandlers(deps: KeyboardHandlerDeps): void {
  const { jsBody, plCtx, settingsDeps, ui, startLoop, stopLoop, forceSwitch, restorePanel, taskNextDeps } = deps;

  document.addEventListener('keydown', function(e: KeyboardEvent) {
    // ── Ctrl+Shift+1..9,0 → Task Next presets ──
    if (e.ctrlKey && e.shiftKey && !e.altKey && taskNextDeps) {
      // Shifted digits produce symbols: ! @ # $ % ^ & * ( )
      const preset = TASK_NEXT_PRESETS[e.key];
      if (preset !== undefined) {
        e.preventDefault();
        log('Ctrl+Shift+' + (preset === 10 ? '0' : String(preset)) + ' → Task Next ×' + preset);
        runTaskNextLoop(taskNextDeps, preset);
        return;
      }
      // Also handle unshifted digits for keyboards that don't shift
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const count = parseInt(e.key, 10);
        log('Ctrl+Shift+' + e.key + ' → Task Next ×' + count);
        runTaskNextLoop(taskNextDeps, count);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        log('Ctrl+Shift+0 → Task Next ×10');
        runTaskNextLoop(taskNextDeps, 10);
        return;
      }
    }

    // Ctrl+/ to toggle JS Executor
    const isCtrlSlash = e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === '/' || e.code === 'Slash');
    if (isCtrlSlash) {
      e.preventDefault();
      let hidden = jsBody.style.display === 'none';
      jsBody.style.display = hidden ? '' : 'none';
      // jsToggle removed during extraction — handled by collapsible section
      if (hidden) {
        let ta = document.getElementById('marco-js-executor');
        if (ta) ta.focus();
      }
      return;
    }

    // Ctrl+, to open Settings dialog
    if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === ',' || e.code === 'Comma')) {
      e.preventDefault();
      showSettingsDialog(settingsDeps);
      return;
    }

    const isCtrlAlt = e.ctrlKey && e.altKey;
    if (!isCtrlAlt) {
      // v7.9.33: Ctrl+Up/Down (no Alt) for force move — must check BEFORE returning
      const isCtrlOnly = e.ctrlKey && !e.altKey && !e.shiftKey;

      // v7.9.42: Ctrl+1 → bottom-left, Ctrl+3 → bottom-right
      if (isCtrlOnly && e.key === '1') {
        e.preventDefault();
        positionLoopController(plCtx, 'bottom-left');
        return;
      }
      if (isCtrlOnly && e.key === '3') {
        e.preventDefault();
        positionLoopController(plCtx, 'bottom-right');
        return;
      }

      if (isCtrlOnly && e.key === 'ArrowUp') {
        e.preventDefault();
        log('Ctrl+Up → Force Move UP via API');
        forceSwitch('up');
        return;
      }
      if (isCtrlOnly && e.key === 'ArrowDown') {
        e.preventDefault();
        log('Ctrl+Down → Force Move DOWN via API');
        forceSwitch('down');
        return;
      }
      return;
    }

    let key = e.key.toLowerCase();

    const isToggleHide = key === 'h';
    if (isToggleHide) {
      e.preventDefault();
      let isHidden = ui.style.display === 'none';
      log('Ctrl+Alt+H pressed on MacroLoop, isHidden=' + isHidden);
      if (isHidden) {
        restorePanel(plCtx);
      }
      return;
    }

    // S-003: Only process Up/Down on project pages to avoid conflict with ComboSwitch
    const isProjectContext = isOnProjectPageForShortcut();
    if (!isProjectContext) {
      log('Not on project page, skipping MacroLoop shortcut (letting ComboSwitch handle it)', 'skip');
      return;
    }

    const isUpArrow = e.key === 'ArrowUp';
    if (isUpArrow) {
      e.preventDefault();
      log('Ctrl+Alt+Up pressed on project page -> MacroLoop toggle');
      const isRunning = state.running;
      if (isRunning) {
        log('Loop is running, stopping via Ctrl+Alt+Up');
        stopLoop();
      } else {
        log('Starting loop UP via Ctrl+Alt+Up');
        startLoop('up');
      }
      return;
    }

    const isDownArrow = e.key === 'ArrowDown';
    if (isDownArrow) {
      e.preventDefault();
      log('Ctrl+Alt+Down pressed on project page -> MacroLoop toggle');
      const isRunning = state.running;
      if (isRunning) {
        log('Loop is running, stopping via Ctrl+Alt+Down');
        stopLoop();
      } else {
        log('Starting loop DOWN via Ctrl+Alt+Down');
        startLoop('down');
      }
      return;
    }
  });
}
