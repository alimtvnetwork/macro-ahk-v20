# Issue 50: Project-Scoped Key-Value API + File Drop Persistence

**Version**: v1.48.0
**Date**: 2026-03-20
**Status**: Fixed (ProjectKv + ProjectFiles tables with CRUD handlers implemented)

---

## Issue Summary

### What is needed

A generic key-value storage API scoped to projects, enabling scripts and UI to store/retrieve arbitrary data. Additionally, support for dropping files that persist into SQLite.

---

## Fix Description

### Key-Value API

1. **SQLite table**:
```sql
CREATE TABLE IF NOT EXISTS project_kv (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, key)
);
```

2. **Message types**:
   - `KV_GET { projectId, key }` → `{ value }`
   - `KV_SET { projectId, key, value }` → `{ ok: true }`
   - `KV_DELETE { projectId, key }` → `{ ok: true }`
   - `KV_LIST { projectId }` → `{ entries: [{key, value}] }`

3. **JS SDK** (available in injected scripts):
```js
await marco.kv.get(key);
await marco.kv.set(key, value);
await marco.kv.delete(key);
await marco.kv.list();
```

### File Drop Persistence

1. **SQLite table**:
```sql
CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  data BLOB NOT NULL,
  size INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```

2. **Drop zone** in Options UI or macro controller that accepts file drops.
3. Files stored as BLOBs in SQLite (practical for files < 10MB).

---

## Acceptance Criteria

1. KV API works from both extension UI and injected scripts via message bridge.
2. Project scoping ensures data isolation between projects.
3. File drops persist and can be retrieved by filename or ID.
4. Files can be listed and deleted per project.

---

*KV API + file drops spec v1.48.0 — 2026-03-20*
