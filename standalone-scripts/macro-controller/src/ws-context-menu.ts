/**
 * MacroLoop Controller — Workspace Context Menu & Inline Rename
 * Phase 5A: Extracted from ws-selection-ui.ts
 *
 * Contains: showWsContextMenu, removeWsContextMenu, startInlineRename
 */

import {
  loopCreditState,
  cPanelBg,
  cPanelFg,
  cPrimary,
  cPrimaryLight,
  lDropdownRadius,
  tFontTiny,
} from './shared-state';
import { log } from './logging';
import { renameWorkspace } from './workspace-rename';
import { logError } from './error-utils';
import { showToast } from './toast';
import {
  populateLoopWorkspaceDropdown,
  fetchLoopCreditsWithDetect,
} from './ws-list-renderer';

/**
 * Build a single context-menu row element with hover effect.
 */
function buildCtxMenuItem(label: string, onClick: () => void): HTMLElement {
  const item = document.createElement('div');
  item.textContent = label;
  item.style.cssText =
    'padding:5px 12px;font-size:' + tFontTiny +
    ';color:' + cPanelFg + ';cursor:pointer;white-space:nowrap;';
  item.onmouseover = function () {
    (this as HTMLElement).style.background = 'rgba(139,92,246,0.3)';
  };
  item.onmouseout = function () {
    (this as HTMLElement).style.background = 'transparent';
  };
  item.onclick = onClick;
  return item;
}

/**
 * Copy the verbatim raw API JSON for a single workspace to the clipboard.
 * Uses WorkspaceCredit.rawApi (preserved from /user/workspaces response).
 */
function copyWorkspaceJson(wsId: string, wsName: string): void {
  const perWs = loopCreditState.perWorkspace || [];
  const ws = perWs.find(function (w) { return w.id === wsId; });
  if (!ws || !ws.rawApi) {
    showToast('❌ No JSON data for "' + wsName + '"', 'error');
    log('[CopyJSON] No rawApi for wsId=' + wsId, 'warn');
    return;
  }
  const json = JSON.stringify(ws.rawApi, null, 2);
  navigator.clipboard.writeText(json)
    .then(function () {
      showToast('📋 Copied JSON for "' + wsName + '" (' + json.length + ' chars)', 'success');
      log('[CopyJSON] Copied ' + json.length + ' chars for ' + wsName, 'info');
    })
    .catch(function (e: unknown) {
      logError('wsContextMenu', 'Clipboard write failed for Copy JSON', e);
      showToast('❌ Clipboard copy failed', 'error');
    });
}

/**
 * Right-click context menu for a single workspace.
 * Provides Rename + Copy JSON actions.
 */
export function showWsContextMenu(
  wsId: string,
  wsName: string,
  x: number,
  y: number,
): void {
  removeWsContextMenu();
  const menu = document.createElement('div');
  menu.id = 'loop-ws-ctx-menu';
  menu.style.cssText =
    'position:fixed;left:' + x + 'px;top:' + y +
    'px;z-index:100001;background:' + cPanelBg +
    ';border:1px solid ' + cPrimary +
    ';border-radius:' + lDropdownRadius +
    ';padding:2px 0;box-shadow:0 4px 12px rgba(0,0,0,.5);min-width:140px;';

  menu.appendChild(buildCtxMenuItem('✏️ Rename', function () {
    removeWsContextMenu();
    startInlineRename(wsId, wsName);
  }));

  menu.appendChild(buildCtxMenuItem('📋 Copy JSON', function () {
    removeWsContextMenu();
    copyWorkspaceJson(wsId, wsName);
  }));

  document.body.appendChild(menu);

  // Close on click outside
  setTimeout(function () {
    document.addEventListener('click', removeWsContextMenu, {
      once: true,
    });
  }, 10);
}

/**
 * Remove workspace context menu from DOM.
 */
export function removeWsContextMenu(): void {
  const existing = document.getElementById('loop-ws-ctx-menu');
  if (existing) existing.remove();
}

/**
 * Start inline rename of a workspace in the list.
 */
// eslint-disable-next-line max-lines-per-function
export function startInlineRename(
  wsId: string,
  currentName: string,
): void {
  const listEl = document.getElementById('loop-ws-list');
  if (!listEl) return;
  const items = listEl.querySelectorAll('.loop-ws-item');
  for (const item of items) {
    if (item.getAttribute('data-ws-id') !== wsId) { continue; }

    const nameDiv = item.querySelector('.loop-ws-name');
    if (!nameDiv) break;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText =
      'width:100%;padding:1px 3px;border:1px solid ' + cPrimaryLight +
      ';border-radius:2px;background:' + cPanelBg +
      ';color:' + cPanelFg +
      ';font-size:11px;outline:none;box-sizing:border-box;';

    input.onkeydown = function (e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const newName = input.value.trim();
        if (!newName) {
          log('[Rename] Empty name — cancelled', 'warn');
          populateLoopWorkspaceDropdown();
          return;
        }
        if (newName === currentName) {
          populateLoopWorkspaceDropdown();
          return;
        }
        renameWorkspace(wsId, newName)
          .then(function () {
            const perWs = loopCreditState.perWorkspace || [];

            for (const ws of perWs) {
              if (ws.id === wsId) {
                ws.fullName = newName;
                ws.name = newName;
                break;
              }
            }
            populateLoopWorkspaceDropdown();
            fetchLoopCreditsWithDetect(false);
          })
          .catch(function (e: unknown) {
            logError('wsContextMenu', 'Workspace context action failed', e);
            showToast('❌ Workspace context action failed', 'error');
            populateLoopWorkspaceDropdown();
          });
      } else if (e.key === 'Escape') {
        populateLoopWorkspaceDropdown();
      }
    };

    nameDiv.textContent = '';
    nameDiv.appendChild(input);
    input.focus();
    input.select();
    break;
  }
}
