# Issue 86 — SDK Notifier Consolidation, Config Seeding Pipeline & Project Database Overhaul

**Version**: v1.74.0  
**Date**: 2026-03-27  
**Status**: Open  
**Severity**: P1  

---

## 1. Problem Statement

Several subsystems need architectural improvements:

1. **SDK Notifier regression** — Error/notification toasts stopped appearing for injected scripts. The notification system must live in the SDK (not macro controller) so all projects can use it. Version number must be shown during loading.
2. **Startup injection policy** — On first inject, the macro controller should NOT click the project button. It must load UI passively and show a loading notification with version number.
3. **Config.json seeding pipeline** — `config.json` should seed to a per-project SQLite database on first load, appear in the Options UI script section as a config binding, and only re-read from file when the hash changes.
4. **Trace button placement** — The Auth Trace button must be inside the ☰ dropdown menu, not standalone.
5. **Project Database panel overhaul** — Major redesign with three tabs: Data (existing), Schema (table creation with validation), and Raw JSON (bulk schema migration).

---

## 2. Subsystem Details

### 2.1 SDK Notifier (move from macro controller to SDK)

The `marco.notify` API must be the single source of truth for all toast/error/loading notifications across all projects. Currently the macro controller has its own toast layer that delegates to `marco.notify` — this is correct architecturally but the SDK-side notification rendering has regressed.

**Requirements:**
- Fix SDK `marco.notify` to reliably render toast notifications
- Show version number in loading toast: `"MacroLoop v1.74.0 initializing..."`
- Error toasts must show with copy-to-clipboard diagnostic info
- Deduplication window: 5 seconds
- Max concurrent visible toasts: 3
- All projects can call `marco.notify.info()`, `.error()`, `.success()`, `.warning()`

### 2.2 Startup Injection Policy — No Auto-Click

When the macro controller script is injected:
1. Script loads, creates marker element
2. Shows loading notification via `marco.notify` with version number
3. Registers namespace, sets up message bridge
4. Waits for workspace data from API (with 5s timeout fallback)
5. Creates UI once data arrives

**MUST NOT** click any DOM buttons during injection. Project dialog interaction is only permitted when the loop is explicitly running (Issue 82 non-regression rule).

### 2.3 Config.json Seeding to Project SQLite

Each project has a `config.json` file. The lifecycle:

1. **First load**: Read `config.json` → compute SHA-256 hash → seed key-value pairs to `ProjectConfig` table in the project's SQLite DB → store hash in `ProjectConfigMeta` table
2. **Subsequent loads**: Compare file hash vs stored hash. If unchanged, read config from DB. If changed, re-seed from file.
3. **User edits**: When user modifies config via the Options UI "Config (DB)" tab, changes save to `ProjectConfig` table only (file hash unchanged).
4. **Config binding**: The `config.json` must appear in the Options UI project Scripts tab as a config binding.

### 2.4 Trace Button in Dropdown

Move the "🔍 Trace" button from standalone placement to inside the ☰ hamburger dropdown menu in the macro controller UI. This is a simple DOM restructure.

### 2.5 Project Database Panel Overhaul

Redesign the project database panel into three tabs:

#### Tab 1: Data
- Existing table/view browser with row counts
- Paginated data grid (25 rows per page)
- Inline CRUD for table rows
- Filter bar with Exact/Contains matching

#### Tab 2: Schema
- **Table creation UI** with visual column editor:
  - Column name (PascalCase enforced)
  - Type: TEXT, INTEGER, REAL, BOOLEAN, BLOB, DATETIME
  - Constraints: NOT NULL, UNIQUE, DEFAULT
  - **Validation rules** (per column):
    - String: starts_with, ends_with, contains, min_length, max_length
    - Date: format (ISO 8601, custom pattern)
    - Regex: custom pattern
  - **Live validation tester**: User enters sample data, sees pass/fail immediately
- **Foreign key editor**: Select target table + column
- **Reusable components**: Table creation form, column editor, validation rule editor must be standalone components for reuse

#### Tab 3: Raw JSON
- Monaco editor for bulk JSON schema definitions (using `JsonSchemaDef` format)
- Auto-migration: `CREATE IF NOT EXISTS` + additive column migration
- Apply button calls `APPLY_JSON_SCHEMA`
- **Markdown documentation**: Generate and copy LLM-friendly schema docs
- Example template pre-loaded

---

## 3. Tasks

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 86.1 | Fix SDK `marco.notify` rendering regression | 2h | — |
| 86.2 | Show version in loading toast during injection | 30m | 86.1 |
| 86.3 | Verify startup does NOT auto-click project button | 30m | — |
| 86.4 | Config seeding pipeline (hash-based, ProjectConfig table) | 3h | — |
| 86.5 | Config binding visibility in Options UI Scripts tab | 1h | 86.4 |
| 86.6 | Move Trace button into ☰ dropdown menu | 30m | — |
| 86.7 | Create reusable ColumnEditor component with types + constraints | 2h | — |
| 86.8 | Create reusable ValidationRuleEditor component with live tester | 2h | 86.7 |
| 86.9 | Create reusable ForeignKeyEditor component | 1h | 86.7 |
| 86.10 | Build Schema tab in Project Database Panel (compose 86.7-86.9) | 2h | 86.7, 86.8, 86.9 |
| 86.11 | Add Data tab with existing table/view browser (refactor existing) | 1h | — |
| 86.12 | Add Raw JSON tab with JsonSchemaDef editor + docs generation | 1h | — |
| 86.13 | Wire all three tabs together in ProjectDatabasePanel | 1h | 86.10, 86.11, 86.12 |

---

## 4. Acceptance Criteria

1. [ ] `marco.notify.info/error/success/warning()` work from any injected project script
2. [ ] Loading toast shows "MacroLoop v{VERSION} initializing..." on injection
3. [ ] Error toasts include copy-to-clipboard with diagnostic report
4. [ ] Macro controller does NOT click project button during injection
5. [ ] Config.json seeds to SQLite on first load; re-seeds only on file hash change
6. [ ] Config appears as binding in Options UI Scripts tab
7. [ ] Trace button is inside ☰ dropdown menu
8. [ ] Schema tab allows table creation with column types, constraints, and validation rules
9. [ ] Validation tester shows live pass/fail for sample data
10. [ ] Foreign key editor references existing tables
11. [ ] Raw JSON tab applies schema via APPLY_JSON_SCHEMA
12. [ ] All table creation components are reusable (importable from other views)
13. [ ] Markdown docs generation works from Raw JSON tab

---

## 5. Non-Regression Rules

- `refreshStatus()` MUST NEVER open project dialog when `state.running === false` (Issue 82)
- Config file re-seed MUST NOT overwrite user DB edits unless file hash changed
- SDK notifier MUST remain the single source of truth — macro controller delegates only
