/**
 * MacroLoop Controller — Database Data Filter Bar
 *
 * Builds the persistent filter bar for the Data tab: column select,
 * mode select (Contains/Exact), case-sensitivity toggle, value input,
 * search button, and active-filter badge with clear.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import type { FilterState } from './database-modal-data';
import { loadTableData, getActiveFilters } from './database-modal-data';
import { escapeHtml } from './database-data-table';

// ── Filter Bar ──

export function buildFilterBar(
  tableName: string,
  filter: FilterState | null | undefined,
  filterColumns: string[],
  content: HTMLElement,
  statusBar: HTMLElement,
): HTMLElement {
  const filterBar = document.createElement('div');
  filterBar.className = 'marco-db-filter-bar';

  const columnSelect = buildColumnSelect(filterColumns, filter);
  filterBar.appendChild(columnSelect);

  const modeSelect = buildModeSelect(filter);
  filterBar.appendChild(modeSelect);

  const caseSensitiveLabel = buildCaseSensitiveCheckbox(filter);
  filterBar.appendChild(caseSensitiveLabel);

  const valueInput = buildValueInput(filter);
  filterBar.appendChild(valueInput);

  const searchButton = buildSearchButton(
    tableName, columnSelect, modeSelect, caseSensitiveLabel, valueInput,
    filterColumns, content, statusBar,
  );
  filterBar.appendChild(searchButton);

  valueInput.onkeydown = (event) => {
    const isEnterKey = event.key === 'Enter';
    if (isEnterKey) {
      searchButton.click();
    }
  };

  const hasActiveFilter = filter !== null && filter !== undefined && filter.column !== '' && filter.value !== '';

  if (hasActiveFilter) {
    const badge = buildActiveFilterBadge(tableName, filter!, filterColumns, content, statusBar);
    filterBar.appendChild(badge);
  }

  return filterBar;
}

// ── Column Select ──

function buildColumnSelect(
  filterColumns: string[],
  filter: FilterState | null | undefined,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'marco-db-filter-select';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '— Column —';
  select.appendChild(defaultOption);

  for (const column of filterColumns) {
    const option = document.createElement('option');
    option.value = column;
    option.textContent = column;
    const isSelected = filter !== null && filter !== undefined && filter.column === column;
    if (isSelected) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  return select;
}

// ── Mode Select ──

function buildModeSelect(filter: FilterState | null | undefined): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'marco-db-filter-select';

  const likeOption = document.createElement('option');
  likeOption.value = 'like';
  likeOption.textContent = 'Contains';

  const exactOption = document.createElement('option');
  exactOption.value = 'exact';
  exactOption.textContent = 'Exact';

  const isExactMode = filter?.mode === 'exact';
  if (isExactMode) {
    exactOption.selected = true;
  }
  else likeOption.selected = true;

  select.appendChild(likeOption);
  select.appendChild(exactOption);

  return select;
}

// ── Case-Sensitive Checkbox ──

function buildCaseSensitiveCheckbox(filter: FilterState | null | undefined): HTMLLabelElement {
  const label = document.createElement('label');
  label.style.cssText = 'font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:3px;white-space:nowrap;';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = filter?.caseSensitive || false;
  checkbox.style.cssText = 'width:13px;height:13px;cursor:pointer;';

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode('Aa'));
  label.title = 'Case-sensitive';

  return label;
}

// ── Value Input ──

function buildValueInput(filter: FilterState | null | undefined): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'marco-db-filter-input';
  input.placeholder = 'Filter value…';
  input.value = filter?.value || '';
  return input;
}

// ── Search Button ──

function buildSearchButton(
  tableName: string,
  columnSelect: HTMLSelectElement,
  modeSelect: HTMLSelectElement,
  caseSensitiveLabel: HTMLLabelElement,
  valueInput: HTMLInputElement,
  filterColumns: string[],
  content: HTMLElement,
  statusBar: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'marco-db-filter-btn';
  button.textContent = '🔍 Filter';

  button.onclick = () => {
    const selectedColumn = columnSelect.value;
    const filterValue = valueInput.value.trim();
    const selectedMode = modeSelect.value as 'like' | 'exact';
    const caseSensitiveCheckbox = caseSensitiveLabel.querySelector('input') as HTMLInputElement;
    const isCaseSensitive = caseSensitiveCheckbox.checked;
    const hasValidFilter = selectedColumn !== '' && filterValue !== '';
    const filters = getActiveFilters();

    if (hasValidFilter) {
      filters[tableName] = {
        column: selectedColumn, value: filterValue,
        mode: selectedMode, caseSensitive: isCaseSensitive, columns: filterColumns,
      };
    } else {
      filters[tableName] = {
        column: '', value: '', mode: 'like', caseSensitive: false, columns: filterColumns,
      };
    }

    loadTableData(tableName, 0, content, statusBar);
  };

  return button;
}

// ── Active Filter Badge ──

function buildActiveFilterBadge(
  tableName: string,
  filter: FilterState,
  filterColumns: string[],
  content: HTMLElement,
  statusBar: HTMLElement,
): HTMLSpanElement {
  const operatorSymbol = filter.mode === 'exact' ? '=' : '≈';
  const caseSensitiveFlag = filter.caseSensitive ? ' [Aa]' : '';

  const badge = document.createElement('span');
  badge.className = 'marco-db-filter-active';
  badge.innerHTML = escapeHtml(filter.column) + ' ' + operatorSymbol
    + ' "' + escapeHtml(filter.value) + '"' + caseSensitiveFlag;

  const clearButton = document.createElement('span');
  clearButton.className = 'marco-db-filter-clear';
  clearButton.textContent = ' ✕';

  clearButton.onclick = () => {
    const filters = getActiveFilters();
    filters[tableName] = {
      column: '', value: '', mode: 'like', caseSensitive: false, columns: filterColumns,
    };
    loadTableData(tableName, 0, content, statusBar);
  };

  badge.appendChild(clearButton);
  return badge;
}
