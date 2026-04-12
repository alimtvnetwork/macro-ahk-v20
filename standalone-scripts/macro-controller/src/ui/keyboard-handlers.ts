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

import type { PanelLayoutCtx } from './panel-layout';
import type { SettingsDeps } from './settings-ui';

export interface KeyboardHandlerDeps {
  jsBody: HTMLElement;
  plCtx: PanelLayoutCtx;
  settingsDeps: SettingsDeps;
  ui: HTMLElement;
  startLoop: (dir: string) => void;
  stopLoop: () => void;
  forceSwitch: (dir: string) => void;
  restorePanel: (ctx: PanelLayoutCtx) => void;
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

    if (!isSupportedHost) {
      return false;
    }

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

/** Handle Ctrl+Shift digit shortcuts for Task Next presets. Returns true if handled. */
function handleTaskNextShortcut(e: KeyboardEvent, taskNextDeps?: TaskNextDeps): boolean {
  if (!e.ctrlKey || !e.shiftKey || e.altKey || !taskNextDeps) {
    return false;
  }

  const preset = TASK_NEXT_PRESETS[e.key];
  if (preset !== undefined) {
    e.preventDefault();
    log('Ctrl+Shift+' + (preset === 10 ? '0' : String(preset)) + ' → Task Next ×' + preset);
    runTaskNextLoop(taskNextDeps, preset);
    return true;
  }
  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const count = parseInt(e.key, 10);
    log('Ctrl+Shift+' + e.key + ' → Task Next ×' + count);
    runTaskNextLoop(taskNextDeps, count);
    return true;
  }
  if (e.key === '0') {
    e.preventDefault();
    log('Ctrl+Shift+0 → Task Next ×10');
    runTaskNextLoop(taskNextDeps, 10);
    return true;
  }
  return false;
}

/** Handle Ctrl-only shortcuts (no Alt, no Shift). Returns true if handled. */
function handleCtrlOnlyShortcut(e: KeyboardEvent, deps: KeyboardHandlerDeps): boolean {
  const { jsBody, plCtx, settingsDeps, forceSwitch } = deps;

  if (e.key === '/' || e.code === 'Slash') {
    e.preventDefault();
    const hidden = jsBody.style.display === 'none';
    jsBody.style.display = hidden ? '' : 'none';
    if (hidden) {
      const ta = document.getElementById('marco-js-executor');
      if (ta) {
        ta.focus();
      }
    }
    return true;
  }
  if (e.key === ',' || e.code === 'Comma') { e.preventDefault(); showSettingsDialog(settingsDeps); return true; }
  if (e.key === '1') { e.preventDefault(); positionLoopController(plCtx, 'bottom-left'); return true; }
  if (e.key === '3') { e.preventDefault(); positionLoopController(plCtx, 'bottom-right'); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); log('Ctrl+Up → Force Move UP via API'); forceSwitch('up'); return true; }
  if (e.key === 'ArrowDown') { e.preventDefault(); log('Ctrl+Down → Force Move DOWN via API'); forceSwitch('down'); return true; }
  return false;
}

/** Handle Ctrl+Alt shortcuts (panel hide, loop toggle). Returns true if handled. */
function handleCtrlAltShortcut(e: KeyboardEvent, deps: KeyboardHandlerDeps): boolean {
  const { ui, startLoop, stopLoop, restorePanel, plCtx } = deps;
  const key = e.key.toLowerCase();

  if (key === 'h') {
    e.preventDefault();
    const isHidden = ui.style.display === 'none';
    log('Ctrl+Alt+H pressed on MacroLoop, isHidden=' + isHidden);
    if (isHidden) {
      restorePanel(plCtx);
    }
    return true;
  }

  if (!isOnProjectPageForShortcut()) {
    log('Not on project page, skipping MacroLoop shortcut (letting ComboSwitch handle it)', 'skip');
    return true;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const dir = e.key === 'ArrowUp' ? 'up' : 'down';
    log('Ctrl+Alt+' + dir.charAt(0).toUpperCase() + dir.slice(1) + ' pressed on project page -> MacroLoop toggle');
    if (state.running) {
      log('Loop is running, stopping via Ctrl+Alt+' + dir.charAt(0).toUpperCase() + dir.slice(1));
      stopLoop();
    } else {
      log('Starting loop ' + dir.toUpperCase() + ' via Ctrl+Alt+' + dir.charAt(0).toUpperCase() + dir.slice(1));
      startLoop(dir);
    }
    return true;
  }
  return false;
}

/**
 * Register all keyboard shortcuts for the controller.
 */
export function registerKeyboardHandlers(deps: KeyboardHandlerDeps): void {
  document.addEventListener('keydown', function(e: KeyboardEvent) {
    if (handleTaskNextShortcut(e, deps.taskNextDeps)) {
      return;
    }
    if (!e.ctrlKey) {
      return;
    }
    if (!e.altKey && !e.shiftKey) { handleCtrlOnlyShortcut(e, deps); return; }
    if (e.altKey && !e.shiftKey) { handleCtrlAltShortcut(e, deps); }
  });
}
