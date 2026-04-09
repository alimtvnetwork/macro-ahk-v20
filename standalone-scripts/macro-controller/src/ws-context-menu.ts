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
import {
import { logError } from './error-utils';
import { showToast } from './toast';
  populateLoopWorkspaceDropdown,
  fetchLoopCreditsWithDetect,
} from './ws-list-renderer';

/**
 * Right-click context menu for single workspace rename.
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
    ';padding:2px 0;box-shadow:0 4px 12px rgba(0,0,0,.5);min-width:100px;';

  const renameItem = document.createElement('div');
  renameItem.textContent = '✏️ Rename';
  renameItem.style.cssText =
    'padding:5px 12px;font-size:' + tFontTiny +
    ';color:' + cPanelFg + ';cursor:pointer;';
  renameItem.onmouseover = function () {
    (this as HTMLElement).style.background = 'rgba(139,92,246,0.3)';
  };
  renameItem.onmouseout = function () {
    (this as HTMLElement).style.background = 'transparent';
  };
  renameItem.onclick = function () {
    removeWsContextMenu();
    startInlineRename(wsId, wsName);
  };

  menu.appendChild(renameItem);
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
          .catch(function () {
            logError('wsContextMenu', 'Workspace context action failed', function);
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
