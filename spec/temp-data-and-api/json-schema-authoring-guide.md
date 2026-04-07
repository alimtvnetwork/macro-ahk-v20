# JsonSchemaDef Authoring Guide

> **Purpose:** This document teaches any AI assistant or developer how to author valid `JsonSchemaDef` JSON payloads for the Marco Extension schema meta-engine. Feed this guide to an AI and it will produce correct, migration-ready schema definitions.

---

## 1. Overview

The Marco Extension uses a JSON-driven schema engine to create and manage per-project SQLite databases. You define your schema as a `JsonSchemaDef` object, and the engine:

1. **Creates tables** that don't exist yet (with auto-generated `Id`, `CreatedAt`, `UpdatedAt` columns)
2. **Adds missing columns** to existing tables (additive-only — never drops columns)
3. **Registers metadata** in three meta tables: `MetaTables`, `MetaColumns`, `MetaRelations`
4. **Generates documentation** in Markdown and Prisma-style formats

The process is **idempotent** and **transactional** — re-applying the same schema produces no changes, and failures roll back cleanly.

---

## 2. Top-Level Structure

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "MyTable",
      "Description": "What this table stores",
      "Columns": [ /* ColumnDef objects */ ],
      "Relations": [ /* RelationDef objects (optional) */ ]
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | ✅ | Schema version (semver recommended, e.g. `"1.0.0"`) |
| `tables` | `JsonTableDef[]` | ✅ | Array of table definitions |

---

## 3. TableDef

```json
{
  "TableName": "Customers",
  "Description": "Customer records for the CRM module",
  "Columns": [ ... ],
  "Relations": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `TableName` | `string` | ✅ | **PascalCase**, no underscores, no abbreviations |
| `Description` | `string` | ❌ | Human-readable purpose of the table |
| `Columns` | `JsonColumnDef[]` | ✅ | At least one user-defined column |
| `Relations` | `JsonRelationDef[]` | ❌ | Foreign key relationships |

### Naming Rules

- ✅ `Customers`, `OrderItems`, `UserProfiles`
- ❌ `customers`, `order_items`, `user_profiles`, `tblCustomers`
- No reserved words: avoid `Table`, `Index`, `Column` as table names

### Auto-Generated Columns

**Do NOT include these** — the engine adds them automatically:

| Column | Type | Description |
|--------|------|-------------|
| `Id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique row identifier |
| `CreatedAt` | `TEXT DEFAULT (datetime('now'))` | Row creation timestamp |
| `UpdatedAt` | `TEXT DEFAULT (datetime('now'))` | Last modification timestamp |

---

## 4. ColumnDef

```json
{
  "Name": "Email",
  "Type": "TEXT",
  "Nullable": false,
  "Default": null,
  "Unique": true,
  "Description": "Customer email address",
  "Validation": {
    "type": "regex",
    "pattern": "^.+@.+\\..+$"
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `Name` | `string` | ✅ | — | **PascalCase** column name |
| `Type` | `string` | ✅ | — | One of: `TEXT`, `INTEGER`, `REAL`, `BLOB`, `BOOLEAN` |
| `Nullable` | `boolean` | ❌ | `false` | Whether column allows `NULL` values |
| `Default` | `string` | ❌ | `null` | SQL default expression (see below) |
| `Unique` | `boolean` | ❌ | `false` | Adds a `UNIQUE` constraint |
| `Description` | `string` | ❌ | `""` | Human-readable column description |
| `Validation` | `ColumnValidation` | ❌ | `null` | Client-side validation rule (see Section 5) |

### Column Types

| Type | SQLite Affinity | Use For |
|------|----------------|---------|
| `TEXT` | TEXT | Strings, JSON blobs, dates as ISO strings |
| `INTEGER` | INTEGER | Whole numbers, booleans (0/1), foreign keys |
| `REAL` | REAL | Floating-point numbers, monetary amounts |
| `BLOB` | BLOB | Binary data |
| `BOOLEAN` | INTEGER | Semantic boolean (stored as 0/1 in SQLite) |

### Column Naming Rules

- ✅ `FullName`, `EmailAddress`, `IsActive`, `OrderTotal`
- ❌ `full_name`, `email_address`, `is_active`
- Boolean columns: prefix with `Is` or `Has` (e.g., `IsActive`, `HasPaid`)
- Foreign key columns: use `{TargetTable}Id` pattern (e.g., `CustomerId`, `OrderId`)

### Default Value Syntax

Defaults are **SQL expressions** (strings). Important: string defaults require **inner single quotes**.

| Value Type | Syntax | Example |
|-----------|--------|---------|
| String | `"'value'"` | `"'pending'"` |
| Number | `"0"` or `"99.99"` | `"0"` |
| Boolean true | `"1"` | `"1"` |
| Boolean false | `"0"` | `"0"` |
| Empty JSON array | `"'[]'"` | `"'[]'"` |
| Empty JSON object | `"'{}'"` | `"'{}'"` |
| Current timestamp | `"(datetime('now'))"` | `"(datetime('now'))"` |
| NULL | omit the field | — |

⚠️ **Common mistake**: `"Default": "hello"` is **wrong** — SQLite interprets `hello` as a column reference. Use `"Default": "'hello'"` (with inner quotes).

---

## 5. Validation Rules

Validation rules are stored in metadata and enforced client-side. They do **not** create SQL constraints (except `Unique`, which is handled separately).

### 5.1 String Validation

```json
{
  "type": "string",
  "minLength": 1,
  "maxLength": 255,
  "startsWith": "PRJ-",
  "endsWith": "",
  "contains": ""
}
```

| Field | Type | Description |
|-------|------|-------------|
| `minLength` | `number` | Minimum character count |
| `maxLength` | `number` | Maximum character count |
| `startsWith` | `string` | Required prefix |
| `endsWith` | `string` | Required suffix |
| `contains` | `string` | Must contain this substring |

### 5.2 Number Validation

```json
{
  "type": "number",
  "min": 0,
  "max": 100
}
```

| Field | Type | Description |
|-------|------|-------------|
| `min` | `number` | Minimum value (inclusive) |
| `max` | `number` | Maximum value (inclusive) |

### 5.3 Regex Validation

```json
{
  "type": "regex",
  "pattern": "^[A-Z]{2}-\\d{4}$",
  "flags": "i"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | `string` | Regular expression pattern |
| `flags` | `string` | Regex flags (e.g., `"i"` for case-insensitive) |

### 5.4 Enum Validation

```json
{
  "type": "enum",
  "values": ["Active", "Inactive", "Suspended"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `values` | `string[]` | List of allowed values (case-sensitive) |

### 5.5 Date Validation

```json
{
  "type": "date",
  "format": "YYYY-MM-DD"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `format` | `string` | Expected date format (`"YYYY-MM-DD"`, `"ISO8601"`, etc.) |

---

## 6. RelationDef (Foreign Keys)

```json
{
  "SourceColumn": "CustomerId",
  "TargetTable": "Customers",
  "TargetColumn": "Id",
  "OnDelete": "CASCADE",
  "OnUpdate": "NO ACTION",
  "Description": "Links order to customer"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `SourceColumn` | `string` | ✅ | — | Column in the current table |
| `TargetTable` | `string` | ✅ | — | Referenced table name |
| `TargetColumn` | `string` | ❌ | `"Id"` | Referenced column (usually `Id`) |
| `OnDelete` | `string` | ❌ | `"NO ACTION"` | Action when parent row deleted |
| `OnUpdate` | `string` | ❌ | `"NO ACTION"` | Action when parent key updated |
| `Description` | `string` | ❌ | `""` | Relationship description |

### ON DELETE / ON UPDATE Options

| Option | Behavior |
|--------|----------|
| `NO ACTION` | Reject delete/update if children exist (default) |
| `CASCADE` | Delete/update children automatically |
| `SET NULL` | Set FK column to NULL (column must be `Nullable: true`) |
| `RESTRICT` | Same as NO ACTION but checked immediately |

### Relationship Patterns

**One-to-Many** (most common):
```json
// In Orders table:
{ "SourceColumn": "CustomerId", "TargetTable": "Customers", "OnDelete": "CASCADE" }
```

**Many-to-Many** (via junction table):
```json
// Create a junction table:
{
  "TableName": "ArticleTags",
  "Columns": [
    { "Name": "ArticleId", "Type": "INTEGER" },
    { "Name": "TagId", "Type": "INTEGER" }
  ],
  "Relations": [
    { "SourceColumn": "ArticleId", "TargetTable": "Articles", "OnDelete": "CASCADE" },
    { "SourceColumn": "TagId", "TargetTable": "Tags", "OnDelete": "CASCADE" }
  ]
}
```

**Self-referencing**:
```json
// In Employees table:
{ "SourceColumn": "ManagerId", "TargetTable": "Employees", "OnDelete": "SET NULL" }
```

---

## 7. Complete Examples

### 7.1 CRM System

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "Customers",
      "Description": "Customer contact records",
      "Columns": [
        {
          "Name": "FullName",
          "Type": "TEXT",
          "Description": "Customer full name",
          "Validation": { "type": "string", "minLength": 2, "maxLength": 100 }
        },
        {
          "Name": "Email",
          "Type": "TEXT",
          "Unique": true,
          "Description": "Primary email address",
          "Validation": { "type": "regex", "pattern": "^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$" }
        },
        {
          "Name": "Phone",
          "Type": "TEXT",
          "Nullable": true,
          "Description": "Phone number"
        },
        {
          "Name": "Status",
          "Type": "TEXT",
          "Default": "'active'",
          "Validation": { "type": "enum", "values": ["active", "inactive", "lead"] }
        },
        {
          "Name": "Notes",
          "Type": "TEXT",
          "Nullable": true,
          "Default": "''"
        }
      ]
    },
    {
      "TableName": "Orders",
      "Description": "Purchase orders",
      "Columns": [
        {
          "Name": "CustomerId",
          "Type": "INTEGER",
          "Description": "Reference to Customers table"
        },
        {
          "Name": "OrderNumber",
          "Type": "TEXT",
          "Unique": true,
          "Validation": { "type": "regex", "pattern": "^ORD-\\d{6}$" }
        },
        {
          "Name": "Total",
          "Type": "REAL",
          "Default": "0.0",
          "Validation": { "type": "number", "min": 0 }
        },
        {
          "Name": "Status",
          "Type": "TEXT",
          "Default": "'pending'",
          "Validation": { "type": "enum", "values": ["pending", "confirmed", "shipped", "delivered", "cancelled"] }
        },
        {
          "Name": "OrderDate",
          "Type": "TEXT",
          "Default": "(datetime('now'))",
          "Validation": { "type": "date", "format": "ISO8601" }
        }
      ],
      "Relations": [
        {
          "SourceColumn": "CustomerId",
          "TargetTable": "Customers",
          "OnDelete": "CASCADE",
          "Description": "Customer who placed the order"
        }
      ]
    },
    {
      "TableName": "OrderItems",
      "Description": "Individual line items within an order",
      "Columns": [
        { "Name": "OrderId", "Type": "INTEGER" },
        { "Name": "ProductName", "Type": "TEXT" },
        { "Name": "Quantity", "Type": "INTEGER", "Default": "1", "Validation": { "type": "number", "min": 1 } },
        { "Name": "UnitPrice", "Type": "REAL", "Validation": { "type": "number", "min": 0 } },
        { "Name": "Subtotal", "Type": "REAL", "Default": "0.0" }
      ],
      "Relations": [
        { "SourceColumn": "OrderId", "TargetTable": "Orders", "OnDelete": "CASCADE" }
      ]
    }
  ]
}
```

### 7.2 Content Management System (with Many-to-Many)

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "Categories",
      "Description": "Content categories",
      "Columns": [
        { "Name": "Name", "Type": "TEXT", "Unique": true },
        { "Name": "Slug", "Type": "TEXT", "Unique": true },
        { "Name": "SortOrder", "Type": "INTEGER", "Default": "0" }
      ]
    },
    {
      "TableName": "Articles",
      "Description": "Published articles",
      "Columns": [
        { "Name": "Title", "Type": "TEXT", "Validation": { "type": "string", "minLength": 5, "maxLength": 200 } },
        { "Name": "Slug", "Type": "TEXT", "Unique": true },
        { "Name": "Body", "Type": "TEXT" },
        { "Name": "CategoryId", "Type": "INTEGER" },
        { "Name": "Status", "Type": "TEXT", "Default": "'draft'", "Validation": { "type": "enum", "values": ["draft", "published", "archived"] } },
        { "Name": "PublishedAt", "Type": "TEXT", "Nullable": true }
      ],
      "Relations": [
        { "SourceColumn": "CategoryId", "TargetTable": "Categories", "OnDelete": "SET NULL" }
      ]
    },
    {
      "TableName": "Tags",
      "Description": "Reusable content tags",
      "Columns": [
        { "Name": "Name", "Type": "TEXT", "Unique": true },
        { "Name": "Color", "Type": "TEXT", "Default": "'#6366f1'" }
      ]
    },
    {
      "TableName": "ArticleTags",
      "Description": "Many-to-many junction between Articles and Tags",
      "Columns": [
        { "Name": "ArticleId", "Type": "INTEGER" },
        { "Name": "TagId", "Type": "INTEGER" }
      ],
      "Relations": [
        { "SourceColumn": "ArticleId", "TargetTable": "Articles", "OnDelete": "CASCADE" },
        { "SourceColumn": "TagId", "TargetTable": "Tags", "OnDelete": "CASCADE" }
      ]
    }
  ]
}
```

### 7.3 Automation Engine

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "Workflows",
      "Description": "Automation workflow definitions",
      "Columns": [
        { "Name": "Name", "Type": "TEXT", "Unique": true },
        { "Name": "Description", "Type": "TEXT", "Nullable": true },
        { "Name": "IsActive", "Type": "BOOLEAN", "Default": "1" },
        { "Name": "TriggerType", "Type": "TEXT", "Validation": { "type": "enum", "values": ["manual", "scheduled", "webhook", "event"] } },
        { "Name": "TriggerConfig", "Type": "TEXT", "Default": "'{}'" },
        { "Name": "MaxRetries", "Type": "INTEGER", "Default": "3", "Validation": { "type": "number", "min": 0, "max": 10 } }
      ]
    },
    {
      "TableName": "WorkflowSteps",
      "Description": "Individual steps within a workflow",
      "Columns": [
        { "Name": "WorkflowId", "Type": "INTEGER" },
        { "Name": "StepOrder", "Type": "INTEGER", "Default": "0" },
        { "Name": "ActionType", "Type": "TEXT", "Validation": { "type": "enum", "values": ["http", "script", "transform", "condition", "delay"] } },
        { "Name": "ActionConfig", "Type": "TEXT", "Default": "'{}'" },
        { "Name": "IsEnabled", "Type": "BOOLEAN", "Default": "1" }
      ],
      "Relations": [
        { "SourceColumn": "WorkflowId", "TargetTable": "Workflows", "OnDelete": "CASCADE" }
      ]
    },
    {
      "TableName": "WorkflowRuns",
      "Description": "Execution history for workflows",
      "Columns": [
        { "Name": "WorkflowId", "Type": "INTEGER" },
        { "Name": "Status", "Type": "TEXT", "Default": "'running'", "Validation": { "type": "enum", "values": ["running", "completed", "failed", "cancelled"] } },
        { "Name": "StartedAt", "Type": "TEXT", "Default": "(datetime('now'))" },
        { "Name": "CompletedAt", "Type": "TEXT", "Nullable": true },
        { "Name": "ErrorMessage", "Type": "TEXT", "Nullable": true },
        { "Name": "OutputJson", "Type": "TEXT", "Default": "'{}'" }
      ],
      "Relations": [
        { "SourceColumn": "WorkflowId", "TargetTable": "Workflows", "OnDelete": "CASCADE" }
      ]
    }
  ]
}
```

---

## 8. Migration Behavior

### What Happens on Apply

| Scenario | Result |
|----------|--------|
| Table doesn't exist | Created with all columns + auto columns |
| Table exists, new column in schema | Column added via `ALTER TABLE` |
| Table exists, same columns | No changes (idempotent) |
| Column removed from schema | **Not dropped** (additive-only) |
| Metadata changes (description, validation) | Updated in MetaTables/MetaColumns |

### What the Engine Returns

```typescript
{
  tablesCreated: string[];    // Names of newly created tables
  columnsAdded: Array<{ table: string; column: string }>;  // New columns added
  errors: string[];           // Any errors encountered
}
```

---

## 9. Meta Tables (Internal)

After applying a schema, three internal tables store all metadata:

### MetaTables
Stores table-level information.

| Column | Type | Description |
|--------|------|-------------|
| `Id` | `INTEGER PK` | Auto-increment |
| `TableName` | `TEXT UNIQUE` | Table name |
| `Description` | `TEXT` | Table description |
| `IsSystem` | `INTEGER` | 1 if system table |

### MetaColumns
Stores column-level information including validation.

| Column | Type | Description |
|--------|------|-------------|
| `Id` | `INTEGER PK` | Auto-increment |
| `TableName` | `TEXT` | Parent table |
| `ColumnName` | `TEXT` | Column name |
| `ColumnType` | `TEXT` | SQLite type |
| `IsNullable` | `INTEGER` | 0 or 1 |
| `DefaultValue` | `TEXT` | SQL default expression |
| `IsPrimaryKey` | `INTEGER` | 0 or 1 |
| `IsAutoIncrement` | `INTEGER` | 0 or 1 |
| `IsUnique` | `INTEGER` | 0 or 1 |
| `Description` | `TEXT` | Column description |
| `ValidationJson` | `TEXT` | JSON validation rule |
| `SortOrder` | `INTEGER` | Display order |

### MetaRelations
Stores foreign key relationships.

| Column | Type | Description |
|--------|------|-------------|
| `Id` | `INTEGER PK` | Auto-increment |
| `SourceTable` | `TEXT` | Table with the FK column |
| `SourceColumn` | `TEXT` | FK column name |
| `TargetTable` | `TEXT` | Referenced table |
| `TargetColumn` | `TEXT` | Referenced column (usually `Id`) |
| `OnDelete` | `TEXT` | Delete cascade behavior |
| `OnUpdate` | `TEXT` | Update cascade behavior |

---

## 10. Common Mistakes & Fixes

| ❌ Mistake | ✅ Fix | Why |
|-----------|--------|-----|
| `"table_name"` | `"TableName"` | All names must be PascalCase |
| Including `Id`, `CreatedAt`, `UpdatedAt` columns | Omit them | Auto-generated by the engine |
| `"Default": "hello"` | `"Default": "'hello'"` | String defaults need inner SQL quotes |
| `"Type": "VARCHAR"` | `"Type": "TEXT"` | Only 5 types: TEXT, INTEGER, REAL, BLOB, BOOLEAN |
| `"Type": "STRING"` | `"Type": "TEXT"` | Not a valid SQLite type |
| `"Type": "INT"` | `"Type": "INTEGER"` | Use full type name |
| `"Type": "FLOAT"` | `"Type": "REAL"` | SQLite uses REAL for floating-point |
| `"OnDelete": "cascade"` | `"OnDelete": "CASCADE"` | Must be uppercase |
| Missing `SourceColumn` in relation | Always specify it | Required field |
| FK column not defined in Columns | Add it to Columns array | Column must exist before referencing |
| `"Nullable": "true"` | `"Nullable": true` | Must be boolean, not string |
| Putting validation in Default | Use `Validation` field | Defaults are SQL expressions only |

---

## 11. Checklist for AI Assistants

Before outputting a `JsonSchemaDef`, verify:

- [ ] `version` is set (e.g., `"1.0.0"`)
- [ ] All table names are PascalCase (no underscores)
- [ ] All column names are PascalCase (no underscores)
- [ ] No `Id`, `CreatedAt`, or `UpdatedAt` columns included
- [ ] Column types are one of: `TEXT`, `INTEGER`, `REAL`, `BLOB`, `BOOLEAN`
- [ ] String defaults have inner single quotes: `"'value'"`
- [ ] FK columns are defined in `Columns` before being referenced in `Relations`
- [ ] `TargetTable` in relations references a table defined in the schema
- [ ] `OnDelete`/`OnUpdate` values are uppercase: `CASCADE`, `SET NULL`, `NO ACTION`, `RESTRICT`
- [ ] Boolean columns use `Is`/`Has` prefix
- [ ] FK columns use `{Table}Id` naming pattern
- [ ] Enum validation values match the expected data
- [ ] The JSON is valid and parseable

---

## 12. TypeScript Interface Reference

```typescript
interface JsonSchemaDef {
  version: string;
  tables: JsonTableDef[];
}

interface JsonTableDef {
  TableName: string;
  Description?: string;
  Columns: JsonColumnDef[];
  Relations?: JsonRelationDef[];
}

interface JsonColumnDef {
  Name: string;
  Type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
  Nullable?: boolean;
  Default?: string;
  Unique?: boolean;
  Description?: string;
  Validation?: ColumnValidation;
}

interface JsonRelationDef {
  SourceColumn: string;
  TargetTable: string;
  TargetColumn?: string;   // defaults to "Id"
  OnDelete?: "CASCADE" | "SET NULL" | "NO ACTION" | "RESTRICT";
  OnUpdate?: "CASCADE" | "SET NULL" | "NO ACTION" | "RESTRICT";
  Description?: string;
}

interface ColumnValidation {
  type: "string" | "number" | "date" | "regex" | "enum";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  flags?: string;
  format?: string;
  values?: string[];
  startsWith?: string;
  endsWith?: string;
  contains?: string;
}
```

---

*Generated for Marco Extension Schema Meta Engine. Feed this document to any AI assistant to enable valid JsonSchemaDef authoring.*
