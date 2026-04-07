# Issue 60: GroupedKv Table + Forbidden Workspace Rename Cache

**Version**: v1.61.0
**Date**: 2026-03-22
**Status**: Fixed (GroupedKv table + GKV_* handlers fully implemented)

---

## Summary

Add a generic `GroupedKv` table to SQLite (logs.db) for categorized key-value metadata.
First consumer: cache workspace IDs that return 403 on rename, so subsequent attempts skip the API call and prompt the user for force-retry instead.

---

## Schema

```sql
CREATE TABLE IF NOT EXISTS GroupedKv (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    GroupName TEXT NOT NULL,
    Key       TEXT NOT NULL,
    Value     TEXT,
    UpdatedAt TEXT DEFAULT (datetime('now')),
    UNIQUE (GroupName, Key)
);
CREATE INDEX IF NOT EXISTS IdxGroupedKvGroup ON GroupedKv(GroupName);
```

- **GroupName**: Category/namespace (e.g., `rename_forbidden`)
- **Key**: Identifier within the group (e.g., workspace ID)
- **Value**: Optional JSON payload (e.g., error message, timestamp)

---

## Message API

| Message Type     | Payload                                      | Response                        |
|------------------|----------------------------------------------|---------------------------------|
| `GKV_GET`        | `{ group, key }`                             | `{ value: string \| null }`    |
| `GKV_SET`        | `{ group, key, value? }`                     | `{ isOk: true }`               |
| `GKV_DELETE`     | `{ group, key }`                             | `{ isOk: true }`               |
| `GKV_LIST`       | `{ group }`                                  | `{ entries: [{key, value}] }`  |
| `GKV_CLEAR_GROUP`| `{ group }`                                  | `{ isOk: true }`               |

---

## Rename Forbidden Cache Flow

1. **On 403 (non-credit-limit)**: After fallback retry also returns 403, store `GKV_SET { group: 'rename_forbidden', key: wsId, value: JSON.stringify({ message, timestamp }) }`.
2. **Before rename**: Check local in-memory Set (`forbiddenWsIds`). If workspace is forbidden, log warning and skip API call. Offer force-retry option.
3. **On force-retry success**: Remove from forbidden cache via `GKV_DELETE { group: 'rename_forbidden', key: wsId }` and remove from in-memory Set.
4. **On controller load**: Fetch `GKV_LIST { group: 'rename_forbidden' }` to populate the in-memory Set.

---

## Acceptance Criteria

1. GroupedKv table created via schema migration (idempotent).
2. GKV_* message handlers functional and registered.
3. Bulk rename skips forbidden workspaces with log + toast.
4. Force-retry bypasses the cache and clears on success.
5. Storage browser shows GroupedKv table.

---

*GroupedKv + forbidden rename spec v1.61.0 — 2026-03-22*
