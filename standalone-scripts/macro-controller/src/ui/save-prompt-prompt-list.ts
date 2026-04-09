/**
 * MacroLoop Controller — Prompt List Rendering
 *
 * Search input, category chip filters, prompt filtering logic,
 * and individual prompt item rendering with edit/copy actions.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log } from '../logging';
import { showPasteToast, pasteIntoEditor } from './prompt-utils';

import type { PromptEntry } from '../types';
import type { SavePromptDeps } from './save-prompt';
import { logError } from '../error-utils';
import { showToast } from '../toast';

// ── Search Input ──

/** Build and append a search input to the dropdown. */
export function buildSearchInput(
  dropdown: HTMLElement,
  onSearch: (query: string) => void,
): HTMLInputElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:6px 10px;border-bottom:1px solid rgba(124,58,237,0.15);';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '🔍 Search prompts…';
  input.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 10px;border-radius:6px;border:1px solid rgba(124,58,237,0.3);background:rgba(0,0,0,0.3);color:#e0e0e0;font-size:11px;outline:none;font-family:system-ui,sans-serif;';
  input.onfocus = function () { input.style.borderColor = '#7c3aed'; };
  input.onblur = function () { input.style.borderColor = 'rgba(124,58,237,0.3)'; };
  input.oninput = function () { onSearch(input.value.trim().toLowerCase()); };
  input.onclick = function (event) { event.stopPropagation(); };

  wrapper.appendChild(input);
  dropdown.appendChild(wrapper);

  return input;
}

// ── Category Chips ──

/** Extract unique category names from prompt entries. */
export function extractUniqueCategories(entries: PromptEntry[]): string[] {
  const categories: string[] = [];
  const seen: Record<string, boolean> = {};

  for (const entry of entries) {
    const category = (entry.category || '').trim();
    const isNonEmpty = category !== '';
    const isUnseen = !seen[category.toLowerCase()];
    const isNew = isNonEmpty && isUnseen;

    if (isNew) {
      categories.push(category);
      seen[category.toLowerCase()] = true;
    }
  }

  return categories;
}

/** Build and append category filter chips to the dropdown. */
export function buildCategoryChips(
  dropdown: HTMLElement,
  categories: string[],
  getActiveFilter: () => string | null,
  setActiveFilter: (filter: string | null) => void,
): void {
  const chipBar = document.createElement('div');
  chipBar.style.cssText = 'display:flex;gap:4px;padding:6px 10px;flex-wrap:wrap;border-bottom:1px solid rgba(124,58,237,0.15);';

  const allChip = document.createElement('span');
  allChip.textContent = 'All';
  allChip.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;background:#7c3aed;color:#fff;font-weight:600;';
  allChip.onclick = function (event) {
    event.stopPropagation();
    setActiveFilter(null);
    updateStyles();
  };
  chipBar.appendChild(allChip);

  const chipElements: HTMLElement[] = [allChip];

  for (const categoryName of categories) {
    const chip = document.createElement('span');
    chip.textContent = categoryName;
    chip.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;background:rgba(124,58,237,0.2);color:#a78bfa;';
    chip.onclick = function (event) {
      event.stopPropagation();
      setActiveFilter(categoryName);
      updateStyles();
    };
    chipBar.appendChild(chip);
    chipElements.push(chip);
  }

  const updateStyles = function(): void {
    const currentFilter = getActiveFilter();
    for (const [chipIdx, chip] of chipElements.entries()) {
      const isAllChip = chipIdx === 0;
      const isActive = isAllChip
        ? currentFilter === null
        : currentFilter === chip.textContent;
      chip.style.background = isActive ? '#7c3aed' : 'rgba(124,58,237,0.2)';
      chip.style.color = isActive ? '#fff' : '#a78bfa';
    }
  };

  dropdown.appendChild(chipBar);
}

// ── Filtering ──

/** Filter prompt entries by category and search query. */
export function filterEntries(
  entries: PromptEntry[],
  activeFilter: string | null,
  searchQuery: string,
): PromptEntry[] {
  let filtered = entries;

  const hasActiveFilter = activeFilter !== null;

  if (hasActiveFilter) {
    filtered = entries.filter(function (entry: PromptEntry) {
      return (entry.category || '').toLowerCase() === activeFilter!.toLowerCase();
    });
  }

  const hasSearchQuery = searchQuery !== '';

  if (hasSearchQuery) {
    filtered = filtered.filter(function (entry: PromptEntry) {
      const name = (entry.name || '').toLowerCase();
      const text = (entry.text || '').toLowerCase();
      const category = (entry.category || '').toLowerCase();
      const isNameMatch = name.indexOf(searchQuery) !== -1;
      const isTextMatch = text.indexOf(searchQuery) !== -1;
      const isCategoryMatch = category.indexOf(searchQuery) !== -1;
      return isNameMatch || isTextMatch || isCategoryMatch;
    });
  }

  return filtered;
}

// ── Prompt Item Rendering ──

/** Render filtered prompt items into a container. */
export function renderPromptItems(
  filtered: PromptEntry[],
  container: HTMLElement,
  isEditMode: boolean,
  deps: SavePromptDeps,
  dropdown: HTMLElement,
): void {
  const hasNoResults = filtered.length === 0;

  if (hasNoResults) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:10px 14px;color:#6b7280;font-size:11px;text-align:center;';
    empty.textContent = 'No prompts found';
    container.appendChild(empty);
    return;
  }

  for (const prompt of filtered) {
    const item = buildPromptItem(prompt, isEditMode, deps, dropdown);
    container.appendChild(item);
  }
}

function buildPromptItem(
  prompt: PromptEntry,
  isEditMode: boolean,
  deps: SavePromptDeps,
  dropdown: HTMLElement,
): HTMLElement {
  const item = document.createElement('div');
  item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 12px;cursor:pointer;font-size:12px;color:#e0e0e0;transition:background 0.12s;border-bottom:1px solid rgba(255,255,255,0.04);';
  item.onmouseover = function () { item.style.background = 'rgba(124,58,237,0.15)'; };
  item.onmouseout = function () { item.style.background = 'none'; };

  const nameSpan = document.createElement('span');
  nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  nameSpan.textContent = prompt.name || 'Untitled';
  nameSpan.title = (prompt.text || '').substring(0, 200);
  item.appendChild(nameSpan);

  const hasCategory = prompt.category !== undefined && prompt.category !== '';

  if (hasCategory) {
    const badge = document.createElement('span');
    badge.textContent = prompt.category!;
    badge.style.cssText = 'font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(124,58,237,0.2);color:#a78bfa;white-space:nowrap;';
    item.appendChild(badge);
  }

  if (isEditMode) {
    const editButton = buildEditButton(prompt, deps, dropdown);
    item.appendChild(editButton);
  }

  const copyButton = buildCopyButton(prompt);
  item.appendChild(copyButton);

  item.onclick = function (event) {
    event.stopPropagation();
    const promptsCfg = deps.getPromptsConfig();
    pasteIntoEditor(prompt.text || '', promptsCfg, deps.getByXPath);
    dropdown.style.display = 'none';
    log('Chatbox Prompts: Pasted "' + (prompt.name || '') + '" (' + (prompt.text || '').length + ' chars)', 'info');
  };

  return item;
}

function buildEditButton(
  prompt: PromptEntry,
  deps: SavePromptDeps,
  dropdown: HTMLElement,
): HTMLElement {
  const button = document.createElement('span');
  button.textContent = '✏️';
  button.title = 'Edit prompt';
  button.style.cssText = 'cursor:pointer;font-size:11px;flex-shrink:0;opacity:0.7;transition:opacity 0.15s;';
  button.onmouseover = function () { button.style.opacity = '1'; };
  button.onmouseout = function () { button.style.opacity = '0.7'; };
  button.onclick = function (event) {
    event.stopPropagation();
    dropdown.style.display = 'none';
    deps.openPromptCreationModal({ name: prompt.name || '', text: prompt.text || '', category: prompt.category || '' });
  };
  return button;
}

function buildCopyButton(prompt: PromptEntry): HTMLElement {
  const button = document.createElement('span');
  button.textContent = '📋';
  button.title = 'Copy to clipboard';
  button.style.cssText = 'cursor:pointer;font-size:11px;flex-shrink:0;opacity:0.5;transition:opacity 0.15s;';
  button.onmouseover = function () { button.style.opacity = '1'; };
  button.onmouseout = function () { button.style.opacity = '0.5'; };
  button.onclick = function (event) {
    event.stopPropagation();
    navigator.clipboard.writeText(prompt.text || '').then(function () {
      showPasteToast('📋 Copied "' + (prompt.name || '') + '" to clipboard', false);
    }).catch(function (e: unknown) {
      logError('deletePrompt', 'Prompt deletion failed', e);
      showToast('❌ Prompt deletion failed', 'error');
      showPasteToast('❌ Failed to copy', true);
    });
  };
  return button;
}
