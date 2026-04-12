/**
 * MacroLoop Controller — Database Data Table Rendering
 *
 * Builds the HTML table (header + body + cells), pagination controls,
 * and shared helpers (escapeHtml, truncate) for the Data tab.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { loadTableData } from './database-modal-data';
import type { DatabaseRow } from '../types';

const PAGE_SIZE = 25;

// ── Helpers ──

export function escapeHtml(text: string): string {
  const container = document.createElement('div');
  container.textContent = text;
  return container.innerHTML;
}

export function truncate(text: string, maxLength: number): string {
  const isWithinLimit = text.length <= maxLength;
  return isWithinLimit ? text : text.substring(0, maxLength) + '…';
}

// ── Pagination ──

export function buildPagination(
  tableName: string,
  page: number,
  totalCount: number,
  content: HTMLElement,
  statusBar: HTMLElement,
): HTMLElement {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const container = document.createElement('div');
  container.className = 'marco-db-pagination';

  const info = document.createElement('span');
  const startRow = page * PAGE_SIZE + 1;
  const endRow = Math.min((page + 1) * PAGE_SIZE, totalCount);
  info.textContent = 'Showing ' + startRow + '–' + endRow + ' of ' + totalCount + ' rows';

  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = 'display:flex;gap:4px;';

  const prevButton = document.createElement('button');
  prevButton.className = 'marco-db-page-btn';
  prevButton.textContent = '◀ Prev';
  prevButton.disabled = page === 0;
  prevButton.onclick = () => loadTableData(tableName, page - 1, content, statusBar);

  const nextButton = document.createElement('button');
  nextButton.className = 'marco-db-page-btn';
  nextButton.textContent = 'Next ▶';
  nextButton.disabled = page >= totalPages - 1;
  nextButton.onclick = () => loadTableData(tableName, page + 1, content, statusBar);

  buttonGroup.appendChild(prevButton);
  buttonGroup.appendChild(nextButton);
  container.appendChild(info);
  container.appendChild(buttonGroup);

  return container;
}

// ── Data Table Element ──

export function buildDataTableElement(
  columns: string[],
  rows: DatabaseRow[],
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'marco-db-table-wrapper';

  const table = document.createElement('table');
  table.className = 'marco-db-data-table';

  table.appendChild(buildTableHeader(columns));
  table.appendChild(buildTableBody(columns, rows));

  wrapper.appendChild(table);
  return wrapper;
}

function buildTableHeader(columns: string[]): HTMLElement {
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  for (const column of columns) {
    const headerCell = document.createElement('th');
    headerCell.textContent = column;
    headerRow.appendChild(headerCell);
  }

  thead.appendChild(headerRow);
  return thead;
}

function buildTableBody(
  columns: string[],
  rows: DatabaseRow[],
): HTMLElement {
  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tableRow = document.createElement('tr');

    for (const column of columns) {
      const cell = buildTableCell(row[column]);
      tableRow.appendChild(cell);
    }

    tbody.appendChild(tableRow);
  }

  return tbody;
}

function buildTableCell(value: string | number | boolean | null | undefined): HTMLTableCellElement {
  const cell = document.createElement('td');
  const isNullish = value === null || value === undefined;

  if (isNullish) {
    cell.textContent = truncate('NULL', 100);
    cell.title = 'NULL';
    cell.style.color = '#64748b';
    cell.style.fontStyle = 'italic';
    return cell;
  }

  const isObject = typeof value === 'object';
  const displayText = isObject ? JSON.stringify(value) : String(value);

  cell.textContent = truncate(displayText, 100);
  cell.title = displayText;

  return cell;
}
