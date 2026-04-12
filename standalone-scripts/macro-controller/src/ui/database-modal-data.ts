/**
 * MacroLoop Controller — Database Modal Data Tab
 *
 * Orchestrates table listing, data loading with filters, and row rendering
 * for the Data tab. Delegates to sub-modules for filter bar and table rendering.
 *
 * Sub-modules: database-data-filter, database-data-table.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { sendToExtension } from './prompt-manager';
import type { ExtensionCallbackResponse } from '../types';
import { buildFilterBar } from './database-data-filter';
import { escapeHtml, buildPagination, buildDataTableElement } from './database-data-table';

const MACRO_CONTROLLER = 'macro-controller';
const ID_MARCO_DB_EMPTY = 'marco-db-empty';

const PAGE_SIZE = 25;

/** Filter state for a single table. */
export interface FilterState {
  column: string;
  value: string;
  mode: 'like' | 'exact';
  caseSensitive: boolean;
  columns: string[];
}

const activeFilters: Record<string, FilterState | null> = {};

/** Expose filter state for sub-modules. */
export function getActiveFilters(): Record<string, FilterState | null> {
  return activeFilters;
}

// ── Table List ──

/** Load sidebar table list from extension. */
export function loadTables(
  tableList: HTMLElement,
  content: HTMLElement,
  statusBar: HTMLElement,
  existingTables?: Array<{ name: string }>,
): void {
  sendToExtension('PROJECT_DB_LIST_TABLES', {
    project: MACRO_CONTROLLER,
    method: 'SCHEMA',
    endpoint: 'listTables',
  }).then((response: ExtensionCallbackResponse) => {
    const isFailure = !response || !response.isOk;

    if (isFailure) {
      renderTableListError(tableList, statusBar, response);
      return;
    }

    const tables = parseTableList(response);
    syncExistingTables(existingTables, tables);

    const isEmpty = tables.length === 0;

    if (isEmpty) {
      renderEmptyTableList(tableList, statusBar);
      return;
    }

    statusBar.textContent = tables.length + ' table' + (tables.length !== 1 ? 's' : '') + ' found';
    renderTableListItems(tables, tableList, content, statusBar);
  });
}

function parseTableList(
  response: ExtensionCallbackResponse,
): Array<{ name: string; rowCount?: number }> {
  return (response.tables || []).map((table: Record<string, unknown>) => ({
    name: (table.name as string) || '',
    rowCount: table.rowCount as number | undefined,
  }));
}

function syncExistingTables(
  existingTables: Array<{ name: string }> | undefined,
  tables: Array<{ name: string }>,
): void {
  const hasTarget = existingTables !== undefined;

  if (hasTarget) {
    existingTables.length = 0;
    for (const table of tables) {
      existingTables.push({ name: table.name });
    }
  }
}

function renderTableListError(
  tableList: HTMLElement,
  statusBar: HTMLElement,
  response: ExtensionCallbackResponse | null,
): void {
  tableList.textContent = '';
  const failDiv = document.createElement('div');
  failDiv.className = ID_MARCO_DB_EMPTY;
  failDiv.textContent = 'Failed to load';
  tableList.appendChild(failDiv);
  statusBar.textContent = 'Error: ' + (response?.errorMessage || 'unknown');
}

function renderEmptyTableList(
  tableList: HTMLElement,
  statusBar: HTMLElement,
): void {
  tableList.textContent = '';
  const emptyDiv = document.createElement('div');
  emptyDiv.className = ID_MARCO_DB_EMPTY;
  emptyDiv.style.padding = '12px';
  emptyDiv.textContent = 'No tables found';
  tableList.appendChild(emptyDiv);
  statusBar.textContent = 'No tables in project database';
}

function renderTableListItems(
  tables: Array<{ name: string; rowCount?: number }>,
  tableList: HTMLElement,
  content: HTMLElement,
  statusBar: HTMLElement,
): void {
  let activeItem: HTMLElement | null = null;

  for (const table of tables) {
    const item = createTableListItem(table);

    item.onclick = () => {
      if (activeItem) {
        activeItem.classList.remove('active');
      }
      item.classList.add('active');
      activeItem = item;
      loadTableData(table.name, 0, content, statusBar);
    };

    tableList.appendChild(item);
  }
}

function createTableListItem(
  table: { name: string; rowCount?: number },
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'marco-db-table-item';
  item.textContent = '📋 ' + table.name;

  const hasRowCount = table.rowCount !== undefined;

  if (hasRowCount) {
    const badge = document.createElement('span');
    badge.className = 'marco-db-table-count';
    badge.textContent = String(table.rowCount);
    item.appendChild(badge);
  }

  return item;
}

// ── Data Loading ──

/** Load paginated table data with optional filter. */
export function loadTableData(
  tableName: string,
  page: number,
  content: HTMLElement,
  statusBar: HTMLElement,
): void {
  content.textContent = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'marco-db-loading';
  loadingDiv.textContent = '⏳ Loading ' + tableName + '…';
  content.appendChild(loadingDiv);

  const whereClause = buildWhereClause(tableName);

  sendToExtension('PROJECT_API', {
    project: MACRO_CONTROLLER,
    method: 'GET',
    endpoint: tableName,
    params: {
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
      orderBy: { Id: 'desc' },
      ...(whereClause ? { where: whereClause } : {}),
    },
  }).then((response: ExtensionCallbackResponse) => {
    const isFailure = !response || !response.isOk;

    if (isFailure) {
      renderDataError(content, response);
      return;
    }

    const rows: Record<string, unknown>[] = response.rows || [];
    updateFilterColumns(tableName, rows);
    fetchCountAndRender(tableName, rows, page, whereClause, content, statusBar);
  });
}

function buildWhereClause(tableName: string): Record<string, unknown> | undefined {
  const filter = activeFilters[tableName];
  const hasFilter = filter !== null && filter !== undefined && filter.column !== '' && filter.value !== '';

  if (!hasFilter) {
    return undefined;
  }

  const isLikeMode = filter!.mode === 'like';

  if (isLikeMode) {
    const isCaseSensitive = filter!.caseSensitive;
    const key = isCaseSensitive ? 'like' : 'ilike';
    return { [filter!.column]: { [key]: '%' + filter!.value + '%' } };
  }

  return { [filter!.column]: filter!.value };
}

function updateFilterColumns(
  tableName: string,
  rows: Record<string, unknown>[],
): void {
  const hasRows = rows.length > 0;
  const filter = activeFilters[tableName];
  const hasNoColumns = !filter || filter.columns.length === 0;
  const isDiscoveryNeeded = hasRows && hasNoColumns;

  if (!isDiscoveryNeeded) {
    return;
  }

  const columns = Object.keys(rows[0]);

  const hasExistingFilter = activeFilters[tableName] !== null && activeFilters[tableName] !== undefined;

  if (hasExistingFilter) {
    activeFilters[tableName]!.columns = columns;
  } else {
    activeFilters[tableName] = {
      column: '', value: '', mode: 'like', caseSensitive: false, columns,
    };
  }
}

function fetchCountAndRender(
  tableName: string,
  rows: Record<string, unknown>[],
  page: number,
  whereClause: Record<string, unknown> | undefined,
  content: HTMLElement,
  statusBar: HTMLElement,
): void {
  sendToExtension('PROJECT_API', {
    project: MACRO_CONTROLLER,
    method: 'GET',
    endpoint: tableName,
    params: { count: true, ...(whereClause ? { where: whereClause } : {}) },
  }).then((countResponse: ExtensionCallbackResponse) => {
    const isCountSuccess = countResponse?.isOk === true;
    const totalCount = isCountSuccess ? (countResponse.count || 0) : rows.length;
    renderDataTable(tableName, rows, page, totalCount, content, statusBar);
  });
}

function renderDataError(
  content: HTMLElement,
  response: ExtensionCallbackResponse | null,
): void {
  content.textContent = '';
  const errorDiv = document.createElement('div');
  errorDiv.className = ID_MARCO_DB_EMPTY;
  errorDiv.textContent = '❌ ' + (response?.errorMessage || 'Failed to load data');
  content.appendChild(errorDiv);
}

// ── Render Data Table ──

function renderDataTable(
  tableName: string,
  rows: Record<string, unknown>[],
  page: number,
  totalCount: number,
  content: HTMLElement,
  statusBar: HTMLElement,
): void {
  content.textContent = '';

  const filter = activeFilters[tableName];
  const filterColumns = filter?.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);

  const filterBar = buildFilterBar(tableName, filter, filterColumns, content, statusBar);
  content.appendChild(filterBar);

  const isEmptyFirstPage = rows.length === 0 && page === 0;

  if (isEmptyFirstPage) {
    renderEmptyTableState(tableName, filter, content, statusBar);
    return;
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const pagination = buildPagination(tableName, page, totalCount, content, statusBar);
  content.appendChild(pagination);

  const tableElement = buildDataTableElement(columns, rows);
  content.appendChild(tableElement);

  updateStatusBarText(tableName, page, totalCount, filter, statusBar);
}

function renderEmptyTableState(
  tableName: string,
  filter: FilterState | null | undefined,
  content: HTMLElement,
  statusBar: HTMLElement,
): void {
  const hasActiveFilter = filter !== null && filter !== undefined && filter.column !== '' && filter.value !== '';
  const emptyMessage = hasActiveFilter
    ? 'No rows match filter <b>' + escapeHtml(filter!.column) + ' = "' + escapeHtml(filter!.value) + '"</b>'
    : 'Table <b>' + escapeHtml(tableName) + '</b> is empty';

  const emptyDiv = document.createElement('div');
  emptyDiv.className = ID_MARCO_DB_EMPTY;
  emptyDiv.innerHTML = emptyMessage;
  content.appendChild(emptyDiv);
  statusBar.textContent = tableName + ' — 0 rows';
}

function updateStatusBarText(
  tableName: string,
  page: number,
  totalCount: number,
  filter: FilterState | null | undefined,
  statusBar: HTMLElement,
): void {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilter = filter !== null && filter !== undefined && filter.column !== '' && filter.value !== '';
  const filterInfo = hasActiveFilter ? ' · Filtered by ' + filter!.column : '';
  statusBar.textContent = tableName + ' — ' + totalCount + ' rows · Page ' + (page + 1) + '/' + totalPages + filterInfo;
}
