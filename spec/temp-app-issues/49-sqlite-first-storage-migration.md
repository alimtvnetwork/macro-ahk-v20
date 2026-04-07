# Issue 49: SQLite-First Storage Migration

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: Fixed (Prompts, ProjectKv, ProjectFiles, Scripts tables all in SQLite)

---

## Issue Summary

### What happened

Most extension data (prompts, configs, large state) is stored in `chrome.storage.local`, which has size limits and no query capability. Prompts have been broken due to storage quota issues.

### Symptoms and impact

- `QUOTA_BYTES_PER_ITEM` errors for large prompt collections.
- No ability to query/filter stored data efficiently.
- Prompts not saving/loading reliably.

---

## Fix Description

### What should change

1. **Prompts → SQLite**: Move all prompt CRUD operations to the `logs.db` SQLite database (new `prompts` table).
2. **Large configs → SQLite**: Move project configs, script metadata, and theme data to SQLite.
3. **localStorage scope**: Only small, frequently-accessed data stays in `chrome.storage.local` (e.g., active project ID, feature flags, UI preferences).
4. **Migration**: Auto-migrate existing `chrome.storage.local` prompts to SQLite on first load.

### Schema additions

```sql
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Acceptance Criteria

1. Prompts save/load from SQLite without quota errors.
2. Existing prompts auto-migrate from storage.local on upgrade.
3. localStorage usage reduced to < 100KB for small config values only.
4. All CRUD operations for prompts work reliably.

---

*SQLite-first storage spec v1.48.0 — 2026-03-20*
