/**
 * MacroLoop Controller — Database Schema Editors
 *
 * Validation panel, FK panel, and validation tester for the schema tab.
 * Extracted from database-schema-tab.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { el } from './database-schema-helpers';

const ID_MARCO_SCHEMA_VAL_ROW = 'marco-schema-val-row';
const ID_MARCO_SCHEMA_VAL_LABEL = 'marco-schema-val-label';
const ID_MARCO_SCHEMA_SELECT = 'marco-schema-select';
const ID_MARCO_SCHEMA_VAL_INPUT = 'marco-schema-val-input';
const ID_MARCO_SCHEMA_FK_ROW = 'marco-schema-fk-row';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ColumnValidation {
  type: 'string' | 'date' | 'regex';
  startsWith?: string;
  endsWith?: string;
  contains?: string;
  minLength?: number;
  maxLength?: number;
  format?: string;
  pattern?: string;
  flags?: string;
  [key: string]: unknown;
}

export interface ForeignKeyDef {
  table: string;
  column: string;
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

export interface ColumnEntry {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN';
  nullable: boolean;
  defaultVal: string;
  validation: ColumnValidation | null;
  foreignKey: ForeignKeyDef | null;
}

const CASCADE_OPTS = ['CASCADE', 'SET NULL', 'RESTRICT'] as const;

/* ------------------------------------------------------------------ */
/*  Validation tester                                                  */
/* ------------------------------------------------------------------ */

interface ValidationResult {
  pass: boolean;
  reason: string;
}

/** Test a value against a column validation rule. */
export function testValidation(value: string, validation: ColumnValidation): ValidationResult {
  const isStringType = validation.type === 'string';
  const isDateType = validation.type === 'date';
  const isRegexType = validation.type === 'regex';

  if (isStringType) {
    return testStringValidation(value, validation);
  }

  if (isDateType) {
    return testDateValidation(value, validation);
  }

  if (isRegexType) {
    return testRegexValidation(value, validation);
  }

  return { pass: true, reason: 'Unknown validation type' };
}

function testStringValidation(value: string, validation: ColumnValidation): ValidationResult {
  const isBelowMinLength = validation.minLength !== undefined && value.length < validation.minLength;

  if (isBelowMinLength) {
    return { pass: false, reason: `Min length ${validation.minLength}, got ${value.length}` };
  }

  const isAboveMaxLength = validation.maxLength !== undefined && value.length > validation.maxLength;

  if (isAboveMaxLength) {
    return { pass: false, reason: `Max length ${validation.maxLength}, got ${value.length}` };
  }

  const hasStartsWithRule = validation.startsWith !== undefined && validation.startsWith !== '';
  const isStartsWithViolation = hasStartsWithRule && !value.startsWith(validation.startsWith!);

  if (isStartsWithViolation) {
    return { pass: false, reason: `Must start with "${validation.startsWith}"` };
  }

  const hasEndsWithRule = validation.endsWith !== undefined && validation.endsWith !== '';
  const isEndsWithViolation = hasEndsWithRule && !value.endsWith(validation.endsWith!);

  if (isEndsWithViolation) {
    return { pass: false, reason: `Must end with "${validation.endsWith}"` };
  }

  const hasContainsRule = validation.contains !== undefined && validation.contains !== '';
  const isContainsViolation = hasContainsRule && !value.includes(validation.contains!);

  if (isContainsViolation) {
    return { pass: false, reason: `Must contain "${validation.contains}"` };
  }

  return { pass: true, reason: 'All string validations passed' };
}

function testDateValidation(value: string, validation: ColumnValidation): ValidationResult {
  const dateFormat = validation.format || 'ISO8601';
  const isIsoFormat = dateFormat === 'ISO8601' || dateFormat === 'iso8601';

  if (isIsoFormat) {
    const parsedDate = new Date(value);
    const isInvalidDate = isNaN(parsedDate.getTime());
    return isInvalidDate
      ? { pass: false, reason: 'Invalid ISO8601 date' }
      : { pass: true, reason: 'Valid ISO8601 date' };
  }

  const isYmdFormat = dateFormat === 'YYYY-MM-DD';

  if (isYmdFormat) {
    const isMatchingFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const isValidDate = isMatchingFormat && !isNaN(new Date(value).getTime());
    return isValidDate
      ? { pass: true, reason: 'Valid YYYY-MM-DD' }
      : { pass: false, reason: 'Invalid YYYY-MM-DD format' };
  }

  return { pass: true, reason: 'Date format not checked' };
}

function testRegexValidation(value: string, validation: ColumnValidation): ValidationResult {
  const hasNoPattern = !validation.pattern;

  if (hasNoPattern) {
    return { pass: true, reason: 'No pattern defined' };
  }

  try {
    const regex = new RegExp(validation.pattern!, validation.flags || '');
    const isMatch = regex.test(value);
    return isMatch
      ? { pass: true, reason: 'Matches pattern' }
      : { pass: false, reason: 'Does not match pattern' };
  } catch (error: unknown) {
    return { pass: false, reason: 'Invalid regex: ' + (error as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/*  Validation panel                                                   */
/* ------------------------------------------------------------------ */

/** Render the validation configuration panel for a column. */
export function renderValidationPanel(panel: HTMLElement, col: ColumnEntry): void {
  panel.textContent = '';
  const validation = col.validation!;

  const typeRow = buildValidationTypeSelector(panel, validation, col);
  panel.appendChild(typeRow);

  renderTypeSpecificFields(panel, validation);
  renderValidationTestArea(panel, col);
}

function buildValidationTypeSelector(
  panel: HTMLElement,
  validation: ColumnValidation,
  col: ColumnEntry,
): HTMLElement {
  const typeRow = el('div', ID_MARCO_SCHEMA_VAL_ROW);
  typeRow.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, 'Type'));

  const typeSelect = el('select', ID_MARCO_SCHEMA_SELECT) as HTMLSelectElement;

  for (const validationType of ['string', 'date', 'regex'] as const) {
    const option = el('option');
    option.value = validationType;
    option.textContent = validationType;
    const isSelected = validationType === validation.type;
    if (isSelected) {
      option.selected = true;
    }
    typeSelect.appendChild(option);
  }

  typeSelect.onchange = () => {
    validation.type = typeSelect.value as ColumnValidation['type'];
    renderValidationPanel(panel, col);
  };

  typeRow.appendChild(typeSelect);
  return typeRow;
}

function renderTypeSpecificFields(panel: HTMLElement, validation: ColumnValidation): void {
  const isStringType = validation.type === 'string';
  const isDateType = validation.type === 'date';
  const isRegexType = validation.type === 'regex';

  if (isStringType) {
    addValField(panel, validation, 'startsWith', 'Starts with');
    addValField(panel, validation, 'endsWith', 'Ends with');
    addValField(panel, validation, 'contains', 'Contains');
    addValNumField(panel, validation, 'minLength', 'Min length');
    addValNumField(panel, validation, 'maxLength', 'Max length');
  } else if (isDateType) {
    addValField(panel, validation, 'format', 'Format', 'ISO8601 or YYYY-MM-DD');
  } else if (isRegexType) {
    addValField(panel, validation, 'pattern', 'Pattern', '^[a-z]+$');
    addValField(panel, validation, 'flags', 'Flags', 'i, g, etc.');
  }
}

function renderValidationTestArea(panel: HTMLElement, col: ColumnEntry): void {
  const testLabel = el('div', ID_MARCO_SCHEMA_VAL_LABEL, 'Test Validation');
  testLabel.style.marginTop = '8px';
  panel.appendChild(testLabel);

  const testRow = el('div', ID_MARCO_SCHEMA_VAL_ROW);
  const testInput = el('input', ID_MARCO_SCHEMA_VAL_INPUT) as HTMLInputElement;
  testInput.placeholder = 'Enter sample value…';
  testRow.appendChild(testInput);

  const testButton = el('button', 'marco-schema-btn marco-schema-btn-sm', '▶ Test');
  testRow.appendChild(testButton);
  panel.appendChild(testRow);

  const resultContainer = el('div');
  panel.appendChild(resultContainer);

  testButton.onclick = () => {
    const result = testValidation(testInput.value, col.validation!);
    resultContainer.textContent = '';
    const passFailClass = result.pass ? 'marco-schema-test-pass' : 'marco-schema-test-fail';
    const icon = result.pass ? '✓ ' : '✗ ';
    const resultElement = el('div', 'marco-schema-test-result ' + passFailClass, icon + result.reason);
    resultContainer.appendChild(resultElement);
  };
}

function addValField(
  panel: HTMLElement,
  validation: Record<string, unknown>,
  key: string,
  label: string,
  placeholder?: string,
): void {
  const row = el('div', ID_MARCO_SCHEMA_VAL_ROW);
  row.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, label));

  const input = el('input', ID_MARCO_SCHEMA_VAL_INPUT) as HTMLInputElement;
  input.value = (validation[key] as string) || '';
  input.placeholder = placeholder || '';
  input.oninput = () => { validation[key] = input.value || undefined; };

  row.appendChild(input);
  panel.appendChild(row);
}

function addValNumField(
  panel: HTMLElement,
  validation: Record<string, unknown>,
  key: string,
  label: string,
): void {
  const row = el('div', ID_MARCO_SCHEMA_VAL_ROW);
  row.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, label));

  const input = el('input', ID_MARCO_SCHEMA_VAL_INPUT) as HTMLInputElement;
  input.type = 'number';
  input.value = validation[key] !== undefined ? String(validation[key]) : '';
  input.placeholder = '—';
  input.style.maxWidth = '80px';
  input.oninput = () => { validation[key] = input.value ? Number(input.value) : undefined; };

  row.appendChild(input);
  panel.appendChild(row);
}

/* ------------------------------------------------------------------ */
/*  Foreign Key panel                                                  */
/* ------------------------------------------------------------------ */

/** Render the FK configuration panel for a column. */
export function renderFkPanel(
  panel: HTMLElement,
  col: ColumnEntry,
  tables: Array<{ name: string }>,
): void {
  panel.textContent = '';
  const foreignKey = col.foreignKey!;

  renderFkTableSelector(panel, foreignKey, tables);
  renderFkColumnInput(panel, foreignKey);
  addCascadeSelect(panel, 'ON DELETE', foreignKey.onDelete, (value) => { foreignKey.onDelete = value as typeof foreignKey.onDelete; });
  addCascadeSelect(panel, 'ON UPDATE', foreignKey.onUpdate, (value) => { foreignKey.onUpdate = value as typeof foreignKey.onUpdate; });
}

function renderFkTableSelector(
  panel: HTMLElement,
  foreignKey: ForeignKeyDef,
  tables: Array<{ name: string }>,
): void {
  const row = el('div', ID_MARCO_SCHEMA_FK_ROW);
  row.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, 'Ref Table'));

  const tableSelect = el('select', ID_MARCO_SCHEMA_SELECT) as HTMLSelectElement;
  const emptyOption = el('option');
  emptyOption.value = '';
  emptyOption.textContent = '— select —';
  tableSelect.appendChild(emptyOption);

  for (const table of tables) {
    const option = el('option');
    option.value = table.name;
    option.textContent = table.name;
    const isSelected = table.name === foreignKey.table;
    if (isSelected) {
      option.selected = true;
    }
    tableSelect.appendChild(option);
  }

  tableSelect.onchange = () => { foreignKey.table = tableSelect.value; };
  row.appendChild(tableSelect);
  panel.appendChild(row);
}

function renderFkColumnInput(panel: HTMLElement, foreignKey: ForeignKeyDef): void {
  const row = el('div', ID_MARCO_SCHEMA_FK_ROW);
  row.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, 'Ref Column'));

  const columnInput = el('input', ID_MARCO_SCHEMA_VAL_INPUT) as HTMLInputElement;
  columnInput.value = foreignKey.column;
  columnInput.placeholder = 'Id';
  columnInput.style.maxWidth = '120px';
  columnInput.oninput = () => { foreignKey.column = columnInput.value || 'Id'; };

  row.appendChild(columnInput);
  panel.appendChild(row);
}

function addCascadeSelect(
  panel: HTMLElement,
  label: string,
  currentValue: string,
  onChange: (value: string) => void,
): void {
  const row = el('div', ID_MARCO_SCHEMA_FK_ROW);
  row.appendChild(el('span', ID_MARCO_SCHEMA_VAL_LABEL, label));

  const select = el('select', ID_MARCO_SCHEMA_SELECT) as HTMLSelectElement;

  for (const cascadeOption of CASCADE_OPTS) {
    const option = el('option');
    option.value = cascadeOption;
    option.textContent = cascadeOption;
    const isSelected = cascadeOption === currentValue;
    if (isSelected) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  select.onchange = () => onChange(select.value);
  row.appendChild(select);
  panel.appendChild(row);
}
