/**
 * MacroLoop Controller — JSON Schema Validation & Migration
 *
 * Validates JSON schema documents and applies table creation
 * and migration operations via extension messages.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { sendToExtension } from './prompt-manager';
import type { ExtensionCallbackResponse } from '../types';
import type { JsonSchema, JsonMigration } from './database-json-types';
import { appendLog } from './database-json-tab';

const MACRO_CONTROLLER = 'macro-controller';

/* ------------------------------------------------------------------ */
/*  Validate                                                           */
/* ------------------------------------------------------------------ */

/** Validate a single table definition. */
function validateSingleTable(t: NonNullable<JsonSchema['tables']>[number], logEl: HTMLElement): number {
  let issues = 0;
  if (!t.name || !/^[A-Z][A-Za-z0-9]+$/.test(t.name)) {
    appendLog(logEl, 'err', `Table "${t.name || '?'}": name must be PascalCase`);
    issues++;
  }
  if (!t.columns || t.columns.length === 0) {
    appendLog(logEl, 'err', `Table "${t.name}": needs at least one column`);
    return issues + 1;
  }
  for (const c of t.columns) {
    if (!c.name || !/^[A-Z][A-Za-z0-9]*$/.test(c.name)) {
      appendLog(logEl, 'err', `Table "${t.name}" column "${c.name || '?'}": must be PascalCase`);
      issues++;
    }
  }
  appendLog(logEl, 'info', `Table "${t.name}": ${t.columns?.length || 0} columns` +
    (t.foreignKeys ? `, ${t.foreignKeys.length} FKs` : ''));
  return issues;
}

/** Validate table definitions, returning the number of issues found. */
function validateTables(tables: JsonSchema['tables'], logEl: HTMLElement): number {
  if (!tables) {
    return 0;
  }
  let issues = 0;
  for (const t of tables) {
    issues += validateSingleTable(t, logEl);
  }
  return issues;
}

/** Validate migration definitions, returning the number of issues found. */
function validateMigrations(migrations: JsonSchema['migrations'], logEl: HTMLElement): number {
  let issues = 0;
  if (!migrations) {
    return 0;
  }
  for (const m of migrations) {
    if (!m.table || !m.action) {
      appendLog(logEl, 'err', 'Migration missing table or action');
      issues++;
    } else if (m.action === 'addColumn' && !m.column) {
      appendLog(logEl, 'err', `Migration "${m.table}.addColumn": missing column definition`);
      issues++;
    } else if (m.action === 'renameColumn' && (!m.oldName || !m.newName)) {
      appendLog(logEl, 'err', `Migration "${m.table}.renameColumn": needs oldName and newName`);
      issues++;
    } else {
      appendLog(logEl, 'info', `Migration: ${m.table}.${m.action}` +
        (m.column ? ` (${m.column.name})` : '') +
        (m.oldName ? ` (${m.oldName} → ${m.newName})` : ''));
    }
  }
  return issues;
}

export function validateSchema(raw: string, logEl: HTMLElement): JsonSchema | null {
  logEl.textContent = '';

  if (!raw.trim()) {
    appendLog(logEl, 'err', 'Empty input — paste a JSON schema');
    return null;
  }

  let schema: JsonSchema;
  try {
    schema = JSON.parse(raw);
  } catch (e) {
    appendLog(logEl, 'err', 'Invalid JSON: ' + (e as Error).message);
    return null;
  }

  if (!schema.tables && !schema.migrations) {
    appendLog(logEl, 'err', 'Schema must have "tables" and/or "migrations" array');
    return null;
  }

  const issues = validateTables(schema.tables, logEl) + validateMigrations(schema.migrations, logEl);

  if (issues > 0) {
    appendLog(logEl, 'err', `Validation failed: ${issues} issue(s)`);
    return null;
  }

  appendLog(logEl, 'ok', '✓ Schema is valid');
  return schema;
}

/* ------------------------------------------------------------------ */
/*  Apply schema                                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function applySchema(raw: string, logEl: HTMLElement, statusBar: HTMLElement): void {
  const schema = validateSchema(raw, logEl);
  if (!schema) {
    return;
  }

  appendLog(logEl, 'info', '— Applying schema —');
  let pending = 0;
  let completed = 0;
  let errors = 0;

  const checkDone = function(): void {
    if (completed + errors >= pending) {
      if (errors > 0) {
        appendLog(logEl, 'err', `Done: ${completed} succeeded, ${errors} failed`);
        statusBar.textContent = 'Schema apply: ' + errors + ' error(s)';
      } else {
        appendLog(logEl, 'ok', `✓ All ${completed} operations succeeded`);
        statusBar.textContent = 'Schema applied: ' + completed + ' operations';
      }
    }
  };

  // Create tables
  if (schema.tables) {
    for (const t of schema.tables) {
      pending++;
      const colDefs = t.columns.map(c => ({
        Name: c.name,
        Type: c.type,
        Nullable: c.nullable !== false,
        ...(c.default ? { Default: c.default } : {}),
        ...(c.validation ? { Validation: c.validation } : {}),
      }));

      sendToExtension('PROJECT_DB_CREATE_TABLE', {
        project: MACRO_CONTROLLER,
        tableName: t.name,
        columns: colDefs,
      }).then((resp: ExtensionCallbackResponse) => {
        if (resp?.isOk) {
          appendLog(logEl, 'ok', `Created table "${t.name}"`);
          completed++;
        } else {
          appendLog(logEl, 'err', `Failed "${t.name}": ${resp?.errorMessage || 'unknown'}`);
          errors++;
        }
        checkDone();
      });
    }
  }

  // Apply migrations
  if (schema.migrations) {
    for (const m of schema.migrations) {
      pending++;
      applyMigration(m, (ok, msg) => {
        if (ok) {
          appendLog(logEl, 'ok', msg);
          completed++;
        } else {
          appendLog(logEl, 'err', msg);
          errors++;
        }
        checkDone();
      });
    }
  }

  if (pending === 0) {
    appendLog(logEl, 'warn', 'Nothing to apply');
  }
}

/* ------------------------------------------------------------------ */
/*  Single migration                                                   */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function applyMigration(m: JsonMigration, cb: (ok: boolean, msg: string) => void): void {
  switch (m.action) {
    case 'addColumn': {
      const col = m.column!;
      const type = col.type === 'BOOLEAN' ? 'INTEGER' : col.type;
      const nullable = col.nullable !== false ? '' : ' NOT NULL';
      const def = col.default ? ` DEFAULT ${col.default}` : '';
      sendToExtension('PROJECT_API', {
        project: MACRO_CONTROLLER,
        method: 'SCHEMA',
        endpoint: 'rawSql',
        params: {
          sql: `ALTER TABLE "${m.table}" ADD COLUMN "${col.name}" ${type}${nullable}${def}`,
        },
      }).then((resp: ExtensionCallbackResponse) => {
        if (resp?.isOk) {
          cb(true, `Added column "${col.name}" to "${m.table}"`);
        } else {
          const err = resp?.errorMessage || '';
          if (err.includes('duplicate column') || err.includes('already exists')) {
            cb(true, `Column "${col.name}" already exists on "${m.table}" — skipped`);
          } else {
            cb(false, `Failed addColumn "${m.table}.${col.name}": ${err}`);
          }
        }
      });
      break;
    }
    case 'dropColumn': {
      sendToExtension('PROJECT_API', {
        project: MACRO_CONTROLLER,
        method: 'SCHEMA',
        endpoint: 'rawSql',
        params: {
          sql: `ALTER TABLE "${m.table}" DROP COLUMN "${m.column?.name || m.oldName}"`,
        },
      }).then((resp: ExtensionCallbackResponse) => {
        const colName = m.column?.name || m.oldName || '?';
        if (resp?.isOk) {
          cb(true, `Dropped column "${colName}" from "${m.table}"`);
        } else {
          cb(false, `Failed dropColumn "${m.table}.${colName}": ${resp?.errorMessage || 'unknown'}`);
        }
      });
      break;
    }
    case 'renameColumn': {
      sendToExtension('PROJECT_API', {
        project: MACRO_CONTROLLER,
        method: 'SCHEMA',
        endpoint: 'rawSql',
        params: {
          sql: `ALTER TABLE "${m.table}" RENAME COLUMN "${m.oldName}" TO "${m.newName}"`,
        },
      }).then((resp: ExtensionCallbackResponse) => {
        if (resp?.isOk) {
          cb(true, `Renamed "${m.table}.${m.oldName}" → "${m.newName}"`);
        } else {
          cb(false, `Failed renameColumn "${m.table}.${m.oldName}": ${resp?.errorMessage || 'unknown'}`);
        }
      });
      break;
    }
    default:
      cb(false, `Unknown migration action: ${m.action}`);
  }
}
