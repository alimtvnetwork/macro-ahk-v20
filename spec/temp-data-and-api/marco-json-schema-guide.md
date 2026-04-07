# Marco JsonSchemaDef — Schema Definition Guide

> **Purpose**: This document defines the JSON format used by Marco's schema meta-engine to create and manage SQLite database tables. Feed this guide to any AI so it can generate valid schema JSON.

---

## Overview

Marco uses a JSON-driven schema system that:
1. **Creates tables** with typed columns in a per-project SQLite database
2. **Stores metadata** in three meta tables: `MetaTables`, `MetaColumns`, `MetaRelations`
3. **Auto-migrates** additively — new columns are added, existing data is never deleted
4. **Generates docs** in Markdown and Prisma-style formats for AI-readable schema reference

---

## Top-Level Structure

```json
{
  "version": "1.0.0",
  "tables": [ /* array of TableDef objects */ ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | ✅ | Schema version (always `"1.0.0"`) |
| `tables` | TableDef[] | ✅ | Array of table definitions |

---

## TableDef

Each entry in `tables` defines one database table.

```json
{
  "TableName": "Customers",
  "Description": "All registered customers",
  "Columns": [ /* ColumnDef[] */ ],
  "Relations": [ /* RelationDef[] (optional) */ ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `TableName` | string | ✅ | **PascalCase**, no underscores. e.g. `"OrderItems"` |
| `Description` | string | ❌ | Human-readable table description |
| `Columns` | ColumnDef[] | ✅ | At least one column required |
| `Relations` | RelationDef[] | ❌ | Foreign key relationships |

### Naming Rules
- **PascalCase only** — `Customers`, `OrderItems`, `UserProfiles`
- **No underscores** — `order_items` is **invalid**
- **No abbreviations** — `Txn` → `Transaction`, `Cfg` → `Config`

### Auto-Generated Columns
Every table automatically gets these columns (do NOT include them):
- `Id` — `INTEGER PRIMARY KEY AUTOINCREMENT`
- `CreatedAt` — `TEXT DEFAULT (datetime('now'))`
- `UpdatedAt` — `TEXT DEFAULT (datetime('now'))`

---

## ColumnDef

```json
{
  "Name": "Email",
  "Type": "TEXT",
  "Nullable": false,
  "Default": "'unknown'",
  "Unique": true,
  "Description": "Customer email address",
  "Validation": { /* optional */ }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `Name` | string | ✅ | — | PascalCase column name |
| `Type` | string | ✅ | — | One of: `"TEXT"`, `"INTEGER"`, `"REAL"`, `"BLOB"`, `"BOOLEAN"` |
| `Nullable` | boolean | ❌ | `false` | Whether the column allows NULL |
| `Default` | string | ❌ | — | SQL default expression (wrap strings in single quotes) |
| `Unique` | boolean | ❌ | `false` | Add a UNIQUE constraint |
| `Description` | string | ❌ | — | Human-readable column purpose |
| `Validation` | Validation | ❌ | — | Client-side validation rules |

### SQLite Type Mapping

| Type | Use For | Examples |
|------|---------|---------|
| `TEXT` | Strings, JSON, dates, UUIDs | Names, emails, JSON blobs, ISO dates |
| `INTEGER` | Whole numbers, booleans (0/1), foreign keys | Counts, flags, FK references |
| `REAL` | Decimal numbers | Prices, coordinates, percentages |
| `BLOB` | Binary data | Files, images (rare) |
| `BOOLEAN` | True/false (stored as INTEGER 0/1) | Flags, toggles |

### Default Value Examples

```json
{ "Default": "'pending'" }       // String default (note the inner single quotes)
{ "Default": "0" }               // Numeric default
{ "Default": "'[]'" }            // Empty JSON array
{ "Default": "'{}'" }            // Empty JSON object
{ "Default": "1" }               // Boolean true (INTEGER)
{ "Default": "(datetime('now'))" }  // Current timestamp
```

---

## Validation

Optional client-side validation rules stored in `MetaColumns.ValidationJson`.

```json
{
  "type": "string",
  "minLength": 3,
  "maxLength": 100,
  "startsWith": "PRJ-"
}
```

| Field | Type | Applies To | Description |
|-------|------|-----------|-------------|
| `type` | string | all | Strategy: `"string"`, `"number"`, `"date"`, `"regex"`, `"enum"` |
| `minLength` | number | string | Minimum character count |
| `maxLength` | number | string | Maximum character count |
| `startsWith` | string | string | Required prefix |
| `endsWith` | string | string | Required suffix |
| `contains` | string | string | Must contain substring |
| `min` | number | number | Minimum numeric value |
| `max` | number | number | Maximum numeric value |
| `pattern` | string | regex | Regular expression pattern |
| `flags` | string | regex | Regex flags (e.g. `"gi"`) |
| `format` | string | date | Date format: `"YYYY-MM-DD"` or `"ISO8601"` |
| `values` | string[] | enum | Allowed values list |

### Validation Examples

**Email pattern:**
```json
{ "type": "regex", "pattern": "^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$" }
```

**Status enum:**
```json
{ "type": "enum", "values": ["Active", "Inactive", "Suspended"] }
```

**String length:**
```json
{ "type": "string", "minLength": 1, "maxLength": 255 }
```

**Numeric range:**
```json
{ "type": "number", "min": 0, "max": 100 }
```

**Date format:**
```json
{ "type": "date", "format": "YYYY-MM-DD" }
```

---

## RelationDef (Foreign Keys)

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
| `SourceColumn` | string | ✅ | — | Column in THIS table |
| `TargetTable` | string | ✅ | — | Referenced table name |
| `TargetColumn` | string | ❌ | `"Id"` | Referenced column (usually `Id`) |
| `OnDelete` | string | ❌ | `"NO ACTION"` | `CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION` |
| `OnUpdate` | string | ❌ | `"NO ACTION"` | `CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION` |
| `Description` | string | ❌ | — | Relationship description |

### ON DELETE/UPDATE Behaviors

| Action | Effect |
|--------|--------|
| `CASCADE` | Delete/update child rows automatically |
| `SET NULL` | Set FK column to NULL (column must be Nullable) |
| `RESTRICT` | Prevent delete/update if children exist |
| `NO ACTION` | Same as RESTRICT (default) |

---

## Complete Examples

### Example 1: Simple CRM

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "Customers",
      "Description": "Registered customer accounts",
      "Columns": [
        {
          "Name": "Email",
          "Type": "TEXT",
          "Unique": true,
          "Description": "Login email address",
          "Validation": {
            "type": "regex",
            "pattern": "^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$"
          }
        },
        {
          "Name": "FullName",
          "Type": "TEXT",
          "Description": "Display name",
          "Validation": { "type": "string", "minLength": 1, "maxLength": 200 }
        },
        {
          "Name": "Status",
          "Type": "TEXT",
          "Default": "'active'",
          "Description": "Account status",
          "Validation": { "type": "enum", "values": ["active", "inactive", "suspended"] }
        },
        {
          "Name": "NotesJson",
          "Type": "TEXT",
          "Default": "'[]'",
          "Nullable": true,
          "Description": "JSON array of internal notes"
        }
      ]
    },
    {
      "TableName": "Orders",
      "Description": "Customer purchase orders",
      "Columns": [
        {
          "Name": "CustomerId",
          "Type": "INTEGER",
          "Description": "FK to Customers table"
        },
        {
          "Name": "TotalAmount",
          "Type": "REAL",
          "Default": "0",
          "Description": "Order total in dollars",
          "Validation": { "type": "number", "min": 0 }
        },
        {
          "Name": "Status",
          "Type": "TEXT",
          "Default": "'pending'",
          "Validation": {
            "type": "enum",
            "values": ["pending", "processing", "shipped", "delivered", "cancelled"]
          }
        },
        {
          "Name": "OrderDate",
          "Type": "TEXT",
          "Default": "(datetime('now'))",
          "Description": "When the order was placed",
          "Validation": { "type": "date", "format": "ISO8601" }
        }
      ],
      "Relations": [
        {
          "SourceColumn": "CustomerId",
          "TargetTable": "Customers",
          "TargetColumn": "Id",
          "OnDelete": "CASCADE",
          "Description": "Deleting a customer removes their orders"
        }
      ]
    }
  ]
}
```

### Example 2: Automation Chains

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "AutomationChains",
      "Description": "Multi-step automation sequences with conditional branching",
      "Columns": [
        { "Name": "ProjectId", "Type": "TEXT", "Default": "'default'", "Description": "Owning project" },
        { "Name": "Name", "Type": "TEXT", "Description": "Human-readable chain name" },
        {
          "Name": "Slug",
          "Type": "TEXT",
          "Unique": true,
          "Description": "URL-safe unique identifier",
          "Validation": { "type": "regex", "pattern": "^[a-z0-9-]+$" }
        },
        { "Name": "StepsJson", "Type": "TEXT", "Default": "'[]'", "Description": "JSON array of ChainStep objects" },
        {
          "Name": "TriggerType",
          "Type": "TEXT",
          "Default": "'manual'",
          "Description": "How the chain is triggered",
          "Validation": { "type": "enum", "values": ["manual", "schedule", "url_match", "hotkey"] }
        },
        { "Name": "TriggerConfigJson", "Type": "TEXT", "Default": "'{}'", "Description": "Trigger settings" },
        { "Name": "Enabled", "Type": "INTEGER", "Default": "1", "Description": "1=active, 0=disabled" }
      ]
    }
  ]
}
```

### Example 3: Content Management with Relations

```json
{
  "version": "1.0.0",
  "tables": [
    {
      "TableName": "Categories",
      "Description": "Content taxonomy",
      "Columns": [
        { "Name": "Name", "Type": "TEXT", "Unique": true },
        { "Name": "Slug", "Type": "TEXT", "Unique": true },
        { "Name": "ParentId", "Type": "INTEGER", "Nullable": true, "Description": "Self-referencing FK for hierarchy" }
      ],
      "Relations": [
        { "SourceColumn": "ParentId", "TargetTable": "Categories", "OnDelete": "SET NULL" }
      ]
    },
    {
      "TableName": "Articles",
      "Description": "Published content pieces",
      "Columns": [
        { "Name": "Title", "Type": "TEXT", "Validation": { "type": "string", "minLength": 1, "maxLength": 500 } },
        { "Name": "Slug", "Type": "TEXT", "Unique": true },
        { "Name": "Body", "Type": "TEXT" },
        { "Name": "CategoryId", "Type": "INTEGER" },
        { "Name": "AuthorName", "Type": "TEXT" },
        { "Name": "PublishedAt", "Type": "TEXT", "Nullable": true },
        { "Name": "IsDraft", "Type": "BOOLEAN", "Default": "1" },
        { "Name": "ViewCount", "Type": "INTEGER", "Default": "0" }
      ],
      "Relations": [
        { "SourceColumn": "CategoryId", "TargetTable": "Categories", "OnDelete": "RESTRICT" }
      ]
    },
    {
      "TableName": "Tags",
      "Columns": [
        { "Name": "Name", "Type": "TEXT", "Unique": true },
        { "Name": "Color", "Type": "TEXT", "Default": "'#6366f1'" }
      ]
    },
    {
      "TableName": "ArticleTags",
      "Description": "Many-to-many join table",
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

---

## Migration Behavior

- **Additive only** — columns and tables are added, never dropped
- **Idempotent** — re-applying the same schema makes no changes
- **Transactional** — failures roll back cleanly
- **Auto columns** — `Id`, `CreatedAt`, `UpdatedAt` are always added
- **Meta sync** — all definitions are upserted into `MetaTables`, `MetaColumns`, `MetaRelations`

---

## Common Mistakes

| ❌ Wrong | ✅ Correct | Why |
|----------|-----------|-----|
| `"table_name"` | `"TableName"` | Must be PascalCase |
| `"user_id"` | `"UserId"` | No underscores in column names |
| Including `Id` column | Omit it | Auto-generated |
| `"Default": "hello"` | `"Default": "'hello'"` | String defaults need inner quotes |
| `"Type": "VARCHAR"` | `"Type": "TEXT"` | Only 5 types allowed |
| `"Type": "DATETIME"` | `"Type": "TEXT"` | Dates are stored as TEXT |

---

## Output Formats

After applying a schema, you can generate documentation:

### Markdown
Table-per-section with columns table, validation rules, and relation arrows. Ideal for feeding to AI assistants.

### Prisma-Style
`model` blocks with typed fields, `@id`, `@unique`, `@default`, `@relation` decorators. Reference only — not used by Prisma ORM.

---

*Generated for Marco Schema Meta Engine v1.0.0*
