/**
 * MacroLoop Controller — Prompts Chatbox Dropdown
 *
 * Floating dropdown orchestrator: creates the dropdown element,
 * positions it, and wires up the header/search/filter/items flow.
 *
 * Sub-modules: save-prompt-task-next, save-prompt-prompt-list.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import type { PromptEntry } from '../types';
import { getPromptsConfig, loadPromptsFromJson } from './prompt-manager';
import type { SavePromptDeps } from './save-prompt';
import { buildTaskNextSubmenu } from './save-prompt-task-next';
import {
  buildSearchInput,
  extractUniqueCategories,
  buildCategoryChips,
  filterEntries,
  renderPromptItems,
} from './save-prompt-prompt-list';

// CQ11: Singleton for dropdown element cache
class PromptsDropdownState {
  private _element: HTMLElement | null = null;

  get element(): HTMLElement | null {
    return this._element;
  }

  set element(v: HTMLElement | null) {
    this._element = v;
  }
}

const promptsDropdownState = new PromptsDropdownState();

/** Get or create the prompts floating dropdown. */
export function createPromptsDropdown(): HTMLElement {
  const isAlreadyCreated = promptsDropdownState.element !== null;

  if (isAlreadyCreated) {
    return promptsDropdownState.element!;
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'marco-chatbox-prompts-dropdown';
  dropdown.style.cssText = 'display:none;position:fixed;z-index:100002;min-width:260px;max-width:380px;max-height:320px;overflow-y:auto;background:#1e1e2e;border:1px solid #7c3aed;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:system-ui,sans-serif;';
  document.body.appendChild(dropdown);
  promptsDropdownState.element = dropdown;

  document.addEventListener('click', function (event) {
    const isVisible = dropdown.style.display !== 'none';
    const isOutsideClick = !dropdown.contains(event.target as Node);
    const shouldClose = isVisible && isOutsideClick;
    if (shouldClose) {
      dropdown.style.display = 'none';
    }
  });

  return dropdown;
}

/** Position the dropdown above the trigger button. */
export function positionDropdownAboveButton(dropdown: HTMLElement, button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  dropdown.style.display = 'block';
  const dropHeight = dropdown.offsetHeight || 200;
  dropdown.style.left = Math.max(8, rect.left - 120) + 'px';
  dropdown.style.top = Math.max(8, rect.top - dropHeight - 6) + 'px';
}

// CQ16: Extracted from renderChatboxPromptsDropdown closure
function renderDropdownItems(
  entries: PromptEntry[],
  itemsContainer: HTMLElement,
  isEditMode: boolean,
  activeFilter: string | null,
  searchQuery: string,
  deps: SavePromptDeps,
  dropdown: HTMLElement,
): void {
  itemsContainer.textContent = '';
  const filtered = filterEntries(entries, activeFilter, searchQuery);
  renderPromptItems(filtered, itemsContainer, isEditMode, deps, dropdown);
}

/** Render the full chatbox prompts dropdown content. */
// eslint-disable-next-line max-lines-per-function
export function renderChatboxPromptsDropdown(dropdown: HTMLElement, deps: SavePromptDeps): void {
  dropdown.innerHTML = '<div style="padding:10px 14px;color:#9ca3af;font-size:12px;text-align:center;">⏳ Loading prompts…</div>';

  loadPromptsFromJson().then(function (_loaded: PromptEntry[] | null) {
    const promptsCfg = getPromptsConfig();
    const entries = promptsCfg.entries || [];
    const hasNoEntries = entries.length === 0;

    if (hasNoEntries) {
      dropdown.innerHTML = '<div style="padding:10px 14px;color:#9ca3af;font-size:12px;text-align:center;">No prompts available</div>';
      return;
    }

    dropdown.textContent = '';
    let isEditMode = false;
    let searchQuery = '';
    let activeFilter: string | null = null;

    const doRender = () => renderDropdownItems(entries, itemsContainer, isEditMode, activeFilter, searchQuery, deps, dropdown);

    const editToggle = buildDropdownHeader(dropdown, () => {
      isEditMode = !isEditMode;
      editToggle.style.background = isEditMode ? '#7c3aed' : 'rgba(0,0,0,0.2)';
      editToggle.style.color = isEditMode ? '#fff' : '#a78bfa';
      doRender();
    });

    if (deps.taskNextDeps) {
      buildTaskNextSubmenu(dropdown, deps.taskNextDeps);
    }

    const searchInput = buildSearchInput(dropdown, (query) => {
      searchQuery = query;
      doRender();
    });

    const categories = extractUniqueCategories(entries);
    const itemsContainer = document.createElement('div');

    const hasCategories = categories.length > 0;
    if (hasCategories) {
      buildCategoryChips(dropdown, categories, () => activeFilter, (filter) => {
        activeFilter = filter;
        doRender();
      });
    }

    doRender();
    dropdown.appendChild(itemsContainer);

    dropdown.addEventListener('keydown', function (event: KeyboardEvent) {
      const isCtrlE = event.ctrlKey && event.key === 'e';
      if (isCtrlE) {
        event.preventDefault();
        event.stopPropagation();
        isEditMode = !isEditMode;
        editToggle.style.background = isEditMode ? '#7c3aed' : 'rgba(0,0,0,0.2)';
        editToggle.style.color = isEditMode ? '#fff' : '#a78bfa';
        doRender();
      }
    });

    setTimeout(function () { searchInput.focus(); }, 50);
  });
}

// ── Header ──

function buildDropdownHeader(dropdown: HTMLElement, onToggleEdit: () => void): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText = 'padding:6px 12px;font-size:10px;color:#a78bfa;border-bottom:1px solid rgba(124,58,237,0.3);font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:4px;';

  const headerLeft = document.createElement('span');
  headerLeft.innerHTML = '<span>📋</span> <span>Click to paste into editor</span>';
  header.appendChild(headerLeft);

  const editToggle = document.createElement('button');
  editToggle.textContent = '✏️ Edit';
  editToggle.title = 'Toggle edit mode (Ctrl+E)';
  editToggle.style.cssText = 'padding:2px 8px;border-radius:6px;font-size:9px;cursor:pointer;border:1px solid rgba(124,58,237,0.3);background:rgba(0,0,0,0.2);color:#a78bfa;';
  editToggle.onclick = function (event) {
    event.stopPropagation();
    onToggleEdit();
  };
  header.appendChild(editToggle);
  dropdown.appendChild(header);

  return editToggle;
}
