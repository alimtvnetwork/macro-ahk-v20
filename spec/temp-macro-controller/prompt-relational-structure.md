# Prompt Relational Structure and Views

## Overview

Prompts use a normalized relational schema with a many-to-many relationship
between prompts and categories, managed through a junction table.
All join-based data retrieval uses SQLite views instead of direct joins in application code.

## Schema

### Prompts (table)

| Column      | Type    | Notes                |
|-------------|---------|----------------------|
| id          | TEXT PK | UUID                 |
| name        | TEXT    | NOT NULL             |
| text        | TEXT    | NOT NULL             |
| version     | TEXT    | Default '1.0.0'      |
| sort_order  | INTEGER | Default 0            |
| is_default  | INTEGER | 0 or 1               |
| is_favorite | INTEGER | 0 or 1               |
| created_at  | TEXT    | ISO 8601, read-only  |
| updated_at  | TEXT    | ISO 8601, read-only  |

### PromptsCategory (table)

| Column      | Type    | Notes                |
|-------------|---------|----------------------|
| id          | TEXT PK | UUID                 |
| name        | TEXT    | NOT NULL, UNIQUE     |
| sort_order  | INTEGER | Default 0            |
| created_at  | TEXT    | ISO 8601             |

### PromptsToCategory (junction table)

| Column      | Type    | Notes                              |
|-------------|---------|-------------------------------------|
| id          | TEXT PK | UUID                               |
| promptId    | TEXT FK | → Prompts.id, ON DELETE CASCADE    |
| categoryId  | TEXT FK | → PromptsCategory.id, ON DELETE CASCADE |
| UNIQUE      |         | (promptId, categoryId)             |

## Views

### PromptsDetails

Aggregates prompt data with comma-separated category names.
All application code must use this view for reading prompts with categories.

```sql
CREATE VIEW IF NOT EXISTS PromptsDetails AS
SELECT
    p.id          AS promptId,
    p.name        AS title,
    p.text        AS content,
    p.version     AS version,
    p.sort_order  AS sortOrder,
    p.is_default  AS isDefault,
    p.is_favorite AS isFavorite,
    p.created_at  AS createdAt,
    p.updated_at  AS updatedAt,
    COALESCE(GROUP_CONCAT(pc.name, ', '), '') AS categories
FROM Prompts p
LEFT JOIN PromptsToCategory ptc ON ptc.promptId = p.id
LEFT JOIN PromptsCategory pc   ON pc.id = ptc.categoryId
GROUP BY p.id;
```

## Rules

1. **No direct joins in application code** — always use views
2. **PascalCase** for all table, view, and index names
3. **Views are read-only** in the storage browser UI
4. **Default prompts are seeded** into the Prompts table on first load
5. **Categories are auto-created** via `ensureCategoryId()` when a prompt with a category is inserted

## File Locations

- Schema definitions: `src/background/db-schemas.ts`
- Prompt CRUD handler: `src/background/handlers/prompt-handler.ts`
- Storage browser handler: `src/background/handlers/storage-browser-handler.ts`
- Storage browser UI: `src/components/options/StorageBrowserView.tsx`

## Seeding Flow

1. On first `handleGetPrompts()` call, `migrateFromStorageIfNeeded()` runs
2. Checks if Prompts table is empty
3. If empty, loads bundled defaults from `config/macro-prompts.json` (fallback: hardcoded)
4. Inserts each prompt into Prompts table
5. For prompts with categories, auto-creates PromptsCategory entries and links via PromptsToCategory
6. Marks DB dirty for persistence flush
