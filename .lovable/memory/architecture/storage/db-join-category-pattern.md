# Memory: architecture/storage/db-join-category-pattern
Updated: 2026-03-23

All categorizable database entities follow a standard many-to-many join pattern: `{Entity}` ← `{Entity}ToCategory` → `{Entity}Category`. A mandatory SQLite view (`{Entity}Details`) aggregates categories via `GROUP_CONCAT`. Direct joins in application code are prohibited — all reads must use the view. Category tables support multiple dimensions (resource type + update type) in a single table. This pattern is documented in `spec/07-data-and-api/db-join-specs/01-category-join-pattern.md`. Current implementations: Prompts, Updater.
