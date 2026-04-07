# Issue 85: SDK Notifier, Config Seeding, and Database Schema Overhaul

**Version**: v1.73.0  
**Date**: 2026-03-27  
**Status**: Planned  

---

## Overview

This issue covers four major areas:

1. **SDK Notifier Module** — Move toast/notification system from Macro Controller to the SDK so all projects can use it
2. **Config.json Seeding to SQLite** — First-load reads config.json and seeds to project DB; subsequent loads use DB unless config hash changes
3. **Database UI Overhaul** — Enhanced table creation with validations, foreign keys, raw JSON schema, and auto-migration
4. **UI Fixes** — Version in loading notification, no auto-clicking project button, trace button in dropdown

---

## Part 1: SDK Notifier Module

### Problem
The toast/notification system lives in `standalone-scripts/macro-controller/src/toast.ts` and is only usable by the Macro Controller. Other projects cannot show notifications.

### Solution
Extract the toast system into the SDK as `marco.notify` (and `RiseupAsiaMacroExt.Projects.<CodeName>.notify`).

### API

```ts
marco.notify.toast(message: string, level?: 'info' | 'warn' | 'error' | 'success', opts?: ToastOpts);
marco.notify.dismiss(id: string);
marco.notify.dismissAll();
marco.notify.onError(callback: (error: RecentError) => void);
marco.notify.getRecentErrors(): RecentError[];
```

### Behavior
- Max 3 visible toasts (stacking, oldest auto-dismissed)
- Deduplication within 5s window
- Copy button with version + timestamp
- Error toasts: 30s auto-dismiss; normal: 12s
- Loading notification shows version: `"⏳ MacroLoop v1.72.0 initializing..."`

### Files
| File | Action |
|------|--------|
| `standalone-scripts/marco-sdk/src/notify.ts` | NEW — Toast/notification module |
| `standalone-scripts/marco-sdk/src/index.ts` | ADD `notify` to namespace |
| `standalone-scripts/macro-controller/src/toast.ts` | REFACTOR — delegate to `marco.notify` |
| `standalone-scripts/macro-controller/src/startup.ts` | UPDATE — show version in loading indicator |

---

## Part 2: Config.json Seeding to SQLite

### Problem
Project config (e.g., `MacroController/config.json`) is read every time. Changes made in the settings UI are lost on reload because config.json always overwrites.

### Solution
1. On first load, read `config.json`, compute SHA-256 hash, seed values into project SQLite DB (`ProjectConfig` table)
2. On subsequent loads, compare stored hash with current config.json hash
3. If hash matches → use DB values (user edits preserved)
4. If hash differs (developer updated config.json) → re-seed from config.json, update hash
5. Settings UI reads/writes to SQLite DB only

### Schema

```sql
CREATE TABLE IF NOT EXISTS ProjectConfig (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Key TEXT NOT NULL UNIQUE,
  Value TEXT NOT NULL,
  Type TEXT DEFAULT 'string',
  UpdatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ProjectConfigMeta (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  ConfigHash TEXT NOT NULL,
  SeededAt TEXT DEFAULT (datetime('now'))
);
```

### Config appears in Settings UI
- Settings panel reads from `ProjectConfig` table
- User edits save back to `ProjectConfig`
- "Reset to Defaults" button re-seeds from config.json

---

## Part 3: Database UI Overhaul

### Current State
`ProjectDatabasePanel.tsx` supports basic table creation with typed columns (TEXT, INTEGER, REAL, BLOB, BOOLEAN) and table deletion.

### Enhancements

#### 3A: Tabs Structure
Database section gets three tabs:
1. **Data** — Browse existing table data (rows), views
2. **Schema** — Create/edit/drop tables with full column definitions
3. **Raw JSON** — Paste a JSON schema document to create/migrate entire DB

#### 3B: Column Validations
Each column definition supports optional validation rules:

```ts
interface ColumnValidation {
  type: 'string' | 'date' | 'regex';
  // String validations
  startsWith?: string;
  endsWith?: string;
  contains?: string;
  minLength?: number;
  maxLength?: number;
  // Date validations
  format?: string; // e.g. 'YYYY-MM-DD', 'ISO8601'
  // Regex validations
  pattern?: string;
  flags?: string;
}
```

- Validation test UI: user inputs sample data and clicks "Test" to verify regex/rules
- Validations stored as JSON in `ProjectSchema` meta-table column

#### 3C: Foreign Keys
Column definition supports foreign key references:

```ts
interface ForeignKeyDef {
  table: string;       // Referenced table (PascalCase)
  column: string;      // Referenced column (default: 'Id')
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}
```

#### 3D: Raw JSON Schema Document
A single JSON document defines the entire project database:

```json
{
  "$schema": "marco-db-schema/v1",
  "tables": [
    {
      "name": "Customers",
      "ifNotExists": true,
      "columns": [
        { "name": "Name", "type": "TEXT", "nullable": false },
        { "name": "Email", "type": "TEXT", "nullable": false, "unique": true,
          "validation": { "type": "regex", "pattern": "^[^@]+@[^@]+$" } },
        { "name": "Status", "type": "TEXT", "default": "'active'",
          "validation": { "type": "string", "startsWith": "" } }
      ],
      "foreignKeys": [
        { "column": "WorkspaceId", "references": { "table": "Workspaces", "column": "Id" },
          "onDelete": "CASCADE", "onUpdate": "CASCADE" }
      ]
    }
  ],
  "migrations": [
    {
      "table": "Customers",
      "action": "addColumn",
      "column": { "name": "Phone", "type": "TEXT", "nullable": true }
    }
  ]
}
```

#### 3E: Auto-Migration
- `ifNotExists: true` → `CREATE TABLE IF NOT EXISTS`
- If table exists but schema differs → apply migrations (add column, drop column)
- Migration actions: `addColumn`, `dropColumn`, `renameColumn`

#### 3F: JSON Schema Documentation
- Generate markdown documentation for the JSON schema format
- Downloadable `.md` file describing all fields, validations, foreign keys
- Can be shared with LLMs for automated schema generation

### Reusable Components
All table/column creation UI components must be extracted as reusable:
- `ColumnDefinitionForm` — single column with type, validation, FK
- `ValidationRuleEditor` — string/date/regex validation with test UI
- `ForeignKeySelector` — dropdown of existing tables + columns
- `TableSchemaForm` — full table definition (name + columns + FKs)

---

## Part 4: UI Fixes

### 4A: Version in Loading Notification
Change: `"⏳ MacroLoop initializing..."` → `"⏳ MacroLoop v1.72.0 initializing..."`

### 4B: No Auto-Click on Project Button
Startup must NEVER click the project button or any DOM element. Injection → UI render → passive detection only.

### 4C: Trace Button in Dropdown
Move the `🔍 Trace` button from a standalone button into the dropdown menu (☰ or settings gear).

---

## Acceptance Criteria

1. `marco.notify.toast(...)` works from any injected script
2. Loading notification shows version number
3. Config.json is seeded to SQLite on first load; user edits persist across reloads
4. Config.json changes (hash mismatch) trigger re-seeding
5. Database UI has Data/Schema/Raw JSON tabs
6. Column validations (string, date, regex) work with test UI
7. Foreign keys with CASCADE/SET NULL/RESTRICT supported
8. Raw JSON schema creates/migrates tables
9. JSON schema documentation is downloadable as markdown
10. All table creation components are reusable
11. Trace button is inside dropdown menu
12. No auto-clicking during startup

---

*SDK Notifier + Config Seeding + DB Overhaul spec v1.73.0 — 2026-03-27*
