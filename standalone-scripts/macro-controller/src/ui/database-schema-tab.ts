/**
 * MacroLoop Controller — Database Schema Tab
 *
 * Orchestrates the schema tab with table creation form, column editors,
 * and existing table list. Sub-modules handle styles, editors, and helpers.
 *
 * See: spec/17-app-issues/85-sdk-notifier-config-seeding-database-overhaul.md §3
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log } from '../logging';
import { logDebug } from '../error-utils';
import { sendToExtension } from './prompt-manager';
import type { ExtensionCallbackResponse } from '../types';
import { injectSchemaStyles } from './database-schema-styles';
import { el, escHtml, showMsg } from './database-schema-helpers';
import {
  renderValidationPanel,
  renderFkPanel,
  type ColumnEntry,
} from './database-schema-editors';

import { MACRO_CONTROLLER_NS } from '../constants';
import { DomId } from '../types';
// Re-export for backward compatibility
export type { ColumnValidation, ForeignKeyDef } from './database-schema-editors';

const COL_TYPES = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'BOOLEAN'] as const;

/* ------------------------------------------------------------------ */
/*  Build Schema Tab                                                   */
/* ------------------------------------------------------------------ */

export function buildSchemaTab(
  container: HTMLElement,
  statusBar: HTMLElement,
  existingTables: Array<{ name: string }>,
): void {
  injectSchemaStyles();
  container.textContent = '';

  const wrap = el('div', 'marco-schema-wrap');
  const msgArea = el('div');
  wrap.appendChild(msgArea);

  const tableListElement = buildExistingTablesSection(wrap);
  const columns: ColumnEntry[] = [];
  const colsContainer = el('div');

  buildCreateTableForm(wrap, columns, colsContainer, msgArea, existingTables, tableListElement, statusBar);

  container.appendChild(wrap);
  refreshTableList(tableListElement, existingTables, statusBar);
}

/* ------------------------------------------------------------------ */
/*  Existing Tables Section                                            */
/* ------------------------------------------------------------------ */

function buildExistingTablesSection(wrap: HTMLElement): HTMLElement {
  const listSection = el('div', 'marco-schema-section');
  const listLabel = el('div', DomId.SchemaLabel, 'Existing Tables');
  listSection.appendChild(listLabel);

  const tableListElement = el('div', 'marco-schema-table-list');
  listSection.appendChild(tableListElement);
  wrap.appendChild(listSection);

  return tableListElement;
}

/* ------------------------------------------------------------------ */
/*  Create Table Form                                                  */
/* ------------------------------------------------------------------ */

function buildCreateTableForm(
  wrap: HTMLElement,
  columns: ColumnEntry[],
  colsContainer: HTMLElement,
  msgArea: HTMLElement,
  existingTables: Array<{ name: string }>,
  tableListElement: HTMLElement,
  statusBar: HTMLElement,
): void {
  const createSection = el('div', 'marco-schema-section');
  const createLabel = el('div', DomId.SchemaLabel, 'Create New Table');
  createSection.appendChild(createLabel);

  const nameInput = buildTableNameInput();
  createSection.appendChild(nameInput.row);

  const colsLabel = el('div', DomId.SchemaLabel, 'Columns');
  colsLabel.style.marginTop = '8px';
  createSection.appendChild(colsLabel);
  createSection.appendChild(colsContainer);

  const rebuildAllColumns = (): void => {
    colsContainer.textContent = '';
    for (const [colIndex] of columns.entries()) {
      renderColumn(colIndex, columns, colsContainer, rebuildAllColumns, existingTables);
    }
  };

  const addColumnButton = el('button', 'marco-schema-btn', '+ Add Column');
  addColumnButton.style.marginTop = '4px';
  addColumnButton.onclick = () => {
    columns.push({ name: '', type: 'TEXT', nullable: true, defaultVal: '', validation: null, foreignKey: null });
    renderColumn(columns.length - 1, columns, colsContainer, rebuildAllColumns, existingTables);
  };
  createSection.appendChild(addColumnButton);

  const createButton = el('button', 'marco-schema-btn marco-schema-btn-primary', '✨ Create Table');
  createButton.style.cssText = 'margin-top:12px;display:block;';
  createButton.onclick = () => handleCreateTable(nameInput.input.value, columns, msgArea, () => {
    refreshTableList(tableListElement, existingTables, statusBar);
  });
  createSection.appendChild(createButton);

  wrap.appendChild(createSection);
}

function buildTableNameInput(): { row: HTMLElement; input: HTMLInputElement } {
  const row = el('div', 'marco-schema-val-row');
  row.style.marginBottom = '8px';

  const input = el('input', 'marco-schema-input') as HTMLInputElement;
  input.placeholder = 'TableName (PascalCase)';
  input.style.maxWidth = '260px';
  row.appendChild(input);

  return { row, input };
}

/* ------------------------------------------------------------------ */
/*  Column Rendering                                                   */
/* ------------------------------------------------------------------ */

function renderColumn(
  index: number,
  columns: ColumnEntry[],
  colsContainer: HTMLElement,
  rebuildAllColumns: () => void,
  existingTables: Array<{ name: string }>,
): void {
  const col = columns[index];
  const row = el('div', 'marco-schema-col-row');
  row.dataset.colIdx = String(index);

  const main = buildColumnMainRow(col, index, columns, rebuildAllColumns);
  row.appendChild(main);

  const { extras, valPanel, fkPanel } = buildColumnExtras(col, existingTables);
  row.appendChild(extras);
  row.appendChild(valPanel);
  row.appendChild(fkPanel);

  colsContainer.appendChild(row);
}

function buildColumnMainRow(
  col: ColumnEntry,
  index: number,
  columns: ColumnEntry[],
  rebuildAllColumns: () => void,
): HTMLElement {
  const main = el('div', 'marco-schema-col-main');

  const nameInput = el('input', 'marco-schema-val-input') as HTMLInputElement;
  nameInput.placeholder = 'ColumnName';
  nameInput.value = col.name;
  nameInput.style.maxWidth = '140px';
  nameInput.oninput = () => { col.name = nameInput.value; };
  main.appendChild(nameInput);

  const typeSelect = el('select', 'marco-schema-select') as HTMLSelectElement;
  for (const colType of COL_TYPES) {
    const option = el('option');
    option.value = colType;
    option.textContent = colType;
    const isSelected = colType === col.type;
    if (isSelected) option.selected = true;
    typeSelect.appendChild(option);
  }
  typeSelect.onchange = () => { col.type = typeSelect.value as ColumnEntry['type']; };
  main.appendChild(typeSelect);

  const nullableLabel = el('label');
  nullableLabel.style.cssText = 'font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:3px;';
  const nullableCheckbox = el('input', 'marco-schema-checkbox') as HTMLInputElement;
  nullableCheckbox.type = 'checkbox';
  nullableCheckbox.checked = col.nullable;
  nullableCheckbox.onchange = () => { col.nullable = nullableCheckbox.checked; };
  nullableLabel.appendChild(nullableCheckbox);
  nullableLabel.appendChild(document.createTextNode('Nullable'));
  main.appendChild(nullableLabel);

  const defaultInput = el('input', 'marco-schema-val-input') as HTMLInputElement;
  defaultInput.placeholder = 'Default';
  defaultInput.value = col.defaultVal;
  defaultInput.style.maxWidth = '80px';
  defaultInput.oninput = () => { col.defaultVal = defaultInput.value; };
  main.appendChild(defaultInput);

  const removeButton = el('button', 'marco-schema-btn marco-schema-btn-danger marco-schema-btn-sm', '✕');
  removeButton.onclick = () => {
    columns.splice(index, 1);
    rebuildAllColumns();
  };
  main.appendChild(removeButton);

  return main;
}

function buildColumnExtras(
  col: ColumnEntry,
  existingTables: Array<{ name: string }>,
): { extras: HTMLElement; valPanel: HTMLElement; fkPanel: HTMLElement } {
  const extras = el('div', 'marco-schema-col-extras');

  const valPanel = el('div', 'marco-schema-val-panel');
  valPanel.style.display = col.validation ? 'block' : 'none';
  if (col.validation) renderValidationPanel(valPanel, col);

  const valToggle = el('button', 'marco-schema-btn marco-schema-btn-sm',
    col.validation ? '📏 Validation ✓' : '📏 Validation');
  valToggle.onclick = () => {
    const hasValidation = col.validation !== null;
    if (hasValidation) {
      col.validation = null;
      valPanel.style.display = 'none';
      valToggle.textContent = '📏 Validation';
    } else {
      col.validation = { type: 'string' };
      valPanel.style.display = 'block';
      valToggle.textContent = '📏 Validation ✓';
      renderValidationPanel(valPanel, col);
    }
  };
  extras.appendChild(valToggle);

  const fkPanel = el('div', 'marco-schema-fk-panel');
  fkPanel.style.display = col.foreignKey ? 'block' : 'none';
  if (col.foreignKey) renderFkPanel(fkPanel, col, existingTables);

  const fkToggle = el('button', 'marco-schema-btn marco-schema-btn-sm',
    col.foreignKey ? '🔗 FK ✓' : '🔗 FK');
  fkToggle.onclick = () => {
    const hasForeignKey = col.foreignKey !== null;
    if (hasForeignKey) {
      col.foreignKey = null;
      fkPanel.style.display = 'none';
      fkToggle.textContent = '🔗 FK';
    } else {
      col.foreignKey = { table: '', column: 'Id', onDelete: 'CASCADE', onUpdate: 'CASCADE' };
      fkPanel.style.display = 'block';
      fkToggle.textContent = '🔗 FK ✓';
      renderFkPanel(fkPanel, col, existingTables);
    }
  };
  extras.appendChild(fkToggle);

  return { extras, valPanel, fkPanel };
}

/* ------------------------------------------------------------------ */
/*  Create table handler                                               */
/* ------------------------------------------------------------------ */

function handleCreateTable(
  tableName: string,
  columns: ColumnEntry[],
  msgArea: HTMLElement,
  onSuccess: () => void,
): void {
  msgArea.textContent = '';

  const validationError = validateCreateTableInput(tableName, columns);
  const hasValidationError = validationError !== null;

  if (hasValidationError) {
    showMsg(msgArea, 'err', validationError);
    return;
  }

  const columnDefinitions = columns.map(buildColumnDefinition);

  sendToExtension('PROJECT_DB_CREATE_TABLE', {
    project: MACRO_CONTROLLER_NS,
    tableName,
    columns: columnDefinitions,
  }).then((response: ExtensionCallbackResponse) => {
    const isSuccess = response?.isOk === true;

    if (isSuccess) {
      showMsg(msgArea, 'ok', `✓ Table "${tableName}" created`);
      log(`Schema: created table ${tableName} with ${columns.length} columns`, 'info');
      onSuccess();
    } else {
      showMsg(msgArea, 'err', '✗ ' + (response?.errorMessage || 'Failed to create table'));
    }
  });
}

function validateCreateTableInput(tableName: string, columns: ColumnEntry[]): string | null {
  const isTableNameEmpty = !tableName;
  const isTableNameInvalid = !/^[A-Z][A-Za-z0-9]+$/.test(tableName);

  if (isTableNameEmpty || isTableNameInvalid) {
    return 'Table name must be PascalCase (e.g. Customers)';
  }

  const hasNoColumns = columns.length === 0;

  if (hasNoColumns) {
    return 'Add at least one column';
  }

  for (const [colIndex, column] of columns.entries()) {
    const isColumnNameInvalid = !column.name || !/^[A-Z][A-Za-z0-9]*$/.test(column.name);

    if (isColumnNameInvalid) {
      return `Column ${colIndex + 1}: Name must be PascalCase`;
    }

    const hasForeignKeyWithoutTable = column.foreignKey !== null && !column.foreignKey.table;

    if (hasForeignKeyWithoutTable) {
      return `Column "${column.name}": FK requires a referenced table`;
    }
  }

  return null;
}

function buildColumnDefinition(column: ColumnEntry): Record<string, unknown> {
  const definition: Record<string, unknown> = {
    Name: column.name,
    Type: column.type,
    Nullable: column.nullable,
  };

  const hasDefaultValue = column.defaultVal !== '';

  if (hasDefaultValue) {
    definition.Default = column.defaultVal;
  }

  const hasValidation = column.validation !== null;

  if (hasValidation) {
    definition.Validation = column.validation;
  }

  const hasForeignKey = column.foreignKey !== null;

  if (hasForeignKey) {
    definition.ForeignKey = column.foreignKey;
  }

  return definition;
}

/* ------------------------------------------------------------------ */
/*  Table list & drop                                                  */
/* ------------------------------------------------------------------ */

function refreshTableList(
  container: HTMLElement,
  existingTables: Array<{ name: string }>,
  statusBar: HTMLElement,
): void {
  sendToExtension('PROJECT_DB_LIST_TABLES', {
    project: MACRO_CONTROLLER_NS,
    method: 'SCHEMA',
    endpoint: 'listTables',
  }).then((response: ExtensionCallbackResponse) => {
    container.textContent = '';
    const tables: Array<{ TableName?: string; name?: string; ColumnDefs?: string }> = response?.tables || [];

    syncExistingTablesList(existingTables, tables);

    const isEmpty = tables.length === 0;

    if (isEmpty) {
      renderEmptyTablesList(container);
      return;
    }

    renderTableEntries(container, tables, existingTables, statusBar);
    statusBar.textContent = tables.length + ' table' + (tables.length !== 1 ? 's' : '') + ' in schema';
  });
}

function syncExistingTablesList(
  existingTables: Array<{ name: string }>,
  tables: Array<{ TableName?: string; name?: string }>,
): void {
  existingTables.length = 0;

  for (const table of tables) {
    existingTables.push({ name: table.TableName || table.name || '?' });
  }
}

function renderEmptyTablesList(container: HTMLElement): void {
  const noTablesDiv = document.createElement('div');
  noTablesDiv.style.cssText = 'font-size:11px;color:#64748b;padding:8px 0;';
  noTablesDiv.textContent = 'No tables yet';
  container.appendChild(noTablesDiv);
}

function renderTableEntries(
  container: HTMLElement,
  tables: Array<{ TableName?: string; name?: string; ColumnDefs?: string }>,
  existingTables: Array<{ name: string }>,
  statusBar: HTMLElement,
): void {
  for (const table of tables) {
    const tableName = table.TableName || table.name || '?';
    const entry = buildTableEntry(tableName, table.ColumnDefs, container, existingTables, statusBar);
    container.appendChild(entry);
  }
}

function buildTableEntry(
  tableName: string,
  columnDefs: string | undefined,
  container: HTMLElement,
  existingTables: Array<{ name: string }>,
  statusBar: HTMLElement,
): HTMLElement {
  const entry = el('div', 'marco-schema-table-entry');

  const info = el('div');
  info.innerHTML = '<b>' + escHtml(tableName) + '</b>';

  const hasColumnDefs = columnDefs !== undefined;

  if (hasColumnDefs) {
    try {
      const columns = JSON.parse(columnDefs) as Array<{ Name: string; Type: string }>;
      const colInfo = el('div', 'marco-schema-table-cols',
        columns.map(column => column.Name + ' (' + column.Type + ')').join(', '));
      info.appendChild(colInfo);
    } catch (_e) { logDebug('database-schema-tab', 'Column JSON parse failed: ' + (_e instanceof Error ? _e.message : String(_e))); }
  }

  entry.appendChild(info);

  const dropButton = el('button', 'marco-schema-btn marco-schema-btn-danger marco-schema-btn-sm', '🗑️ Drop');
  dropButton.onclick = () => {
    const isConfirmed = confirm('Drop table "' + tableName + '"? This cannot be undone.');

    if (isConfirmed) {
      sendToExtension('PROJECT_DB_DROP_TABLE', {
        project: MACRO_CONTROLLER_NS,
        tableName,
      }).then((response: ExtensionCallbackResponse) => {
        const isSuccess = response?.isOk === true;

        if (isSuccess) {
          refreshTableList(container, existingTables, statusBar);
          statusBar.textContent = 'Dropped table ' + tableName;
        }
      });
    }
  };

  entry.appendChild(dropButton);
  return entry;
}
