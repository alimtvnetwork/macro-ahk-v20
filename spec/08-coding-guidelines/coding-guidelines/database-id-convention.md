# Database ID Convention — INTEGER AUTOINCREMENT

**Status**: ENFORCED  
**Created**: 2026-03-21  

---

## Rule

All SQLite table primary key `id` columns **MUST** use:

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
```

**NEVER** use `TEXT PRIMARY KEY` with UUIDs/GUIDs for `id` columns.

---

## Rationale

1. **Performance**: INTEGER PKs are faster for lookups, joins, and indexing
2. **Storage**: Integers are smaller than 36-byte UUID strings
3. **Ordering**: Auto-increment provides natural insertion order
4. **Simplicity**: No UUID generation needed — SQLite handles it

---

## Implementation

### Inserting rows

Do NOT supply the `id` value. Let SQLite auto-generate it:

```sql
-- ✅ CORRECT: omit id
INSERT INTO Prompts (name, text, created_at, updated_at) VALUES (?, ?, ?, ?);

-- ❌ WRONG: supplying a UUID
INSERT INTO Prompts (id, name, text, ...) VALUES ('550e8400-e29b-41d4-...', ?, ?, ...);
```

### Getting the generated ID

Use `last_insert_rowid()` immediately after INSERT:

```typescript
db.run("INSERT INTO Prompts (name, text, ...) VALUES (?, ?, ...)", [...]);
const result = db.exec("SELECT last_insert_rowid()");
const newId = Number(result[0].values[0][0]);
```

### Semantic identifiers

When a human-readable identifier is needed (e.g., prompt slugs for seeding dedup),
add a separate `slug TEXT UNIQUE` column. Do NOT use it as the primary key.

### TypeScript representation

IDs are represented as `string` in TypeScript interfaces (stringified integers)
to maintain compatibility with message passing and React keys. Convert with
`Number(id)` when binding to SQL parameters.

---

## Tables affected

| Table              | PK                      | Notes                          |
|--------------------|-------------------------|--------------------------------|
| Sessions           | `id INTEGER PK AI`      |                                |
| Logs               | `id INTEGER PK AI`      | Already was INTEGER            |
| Errors             | `id INTEGER PK AI`      | Already was INTEGER            |
| Prompts            | `id INTEGER PK AI`      | + `slug TEXT UNIQUE` for dedup |
| PromptsCategory    | `id INTEGER PK AI`      |                                |
| PromptsToCategory  | `id INTEGER PK AI`      |                                |
| ProjectFiles       | `id INTEGER PK AI`      |                                |
| Scripts            | `id INTEGER PK AI`      |                                |
| ProjectKv          | Composite `(project_id, key)` | No `id` column — unchanged |

### Bundle format (sqlite-bundle.ts)

The SQLite bundle export/import format (v4+) also uses `INTEGER PRIMARY KEY AUTOINCREMENT`
for all tables (Projects, Scripts, Configs, Prompts, Meta). Original runtime IDs are stored
in a separate `Uid TEXT` column. The `resolveUid()` helper reads `Uid` first, falling back
to the old `Id` TEXT column for backward compatibility with v3 bundles.

---

## Cross-References

- [Data Models Spec](../../../03-data-and-api/data-models.md)
- [Database Naming Convention](database-naming.md)
- [SQL Security Standards](../../memory: sql-security-standards)
