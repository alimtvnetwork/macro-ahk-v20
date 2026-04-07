# DB Join Pattern: Category Relationships

**Status**: ACTIVE  
**Created**: 2026-03-23  
**Updated**: 2026-03-23

---

## Overview

This spec defines the standard pattern for attaching **categories** to any database entity via a many-to-many join table, with a mandatory **SQLite view** for all read queries.

---

## Pattern

Every categorizable entity follows this structure:

```
[Entity]  ←──  [EntityToCategory]  ──→  [EntityCategory]
   1                 M                        1
```

### 1. Category Table

```sql
CREATE TABLE IF NOT EXISTS {Entity}Category (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Name      TEXT NOT NULL UNIQUE,
    SortOrder INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. Junction Table

```sql
CREATE TABLE IF NOT EXISTS {Entity}ToCategory (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    {Entity}Id INTEGER NOT NULL REFERENCES {Entity}(Id) ON DELETE CASCADE,
    CategoryId INTEGER NOT NULL REFERENCES {Entity}Category(Id) ON DELETE CASCADE,
    UNIQUE({Entity}Id, CategoryId)
);

CREATE INDEX IF NOT EXISTS Idx{Entity}ToCat{Entity}  ON {Entity}ToCategory({Entity}Id);
CREATE INDEX IF NOT EXISTS Idx{Entity}ToCatCategory   ON {Entity}ToCategory(CategoryId);
```

### 3. Details View (MANDATORY)

```sql
CREATE VIEW IF NOT EXISTS {Entity}Details AS
SELECT
    e.*,
    COALESCE(GROUP_CONCAT(c.Name, ', '), '') AS Categories
FROM {Entity} e
LEFT JOIN {Entity}ToCategory etc ON etc.{Entity}Id = e.Id
LEFT JOIN {Entity}Category c     ON c.Id = etc.CategoryId
GROUP BY e.Id;
```

---

## Rules

1. **All join-based reads MUST use the view** — direct joins in application code are prohibited.
2. **All names are PascalCase** — no underscores in table names, column names, or index names.
3. **All PKs are INTEGER AUTOINCREMENT** — no TEXT/UUID primary keys.
4. **Boolean columns use `is`/`has` prefix** — e.g., `IsGit`, `HasInstructions`.
5. **Category dimensions**: A single entity can have categories from multiple dimensions (e.g., resource type + update type). Use the `Name` column with a convention like `type:Script`, `reason:Security` or keep them flat if dimensions don't overlap.

---

## Existing Implementations

| Entity  | Category Table     | Junction Table       | View           |
|---------|--------------------|----------------------|----------------|
| Prompts | PromptsCategory    | PromptsToCategory    | PromptsDetails |
| Updater | UpdaterCategory    | UpdaterToCategory    | UpdaterDetails |

---

## Cross-References

- `spec/07-data-and-api/data-models.md` — Full schema reference
- `spec/10-macro-controller/prompt-relational-structure.md` — First implementation of this pattern
- `.lovable/memory/architecture/storage/relational-views-policy.md` — Policy enforcement
- `src/background/db-schemas.ts` — Canonical SQL schemas
