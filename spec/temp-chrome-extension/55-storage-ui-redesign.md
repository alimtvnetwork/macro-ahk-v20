# Spec 55 — Storage UI Redesign

**Priority**: Medium
**Status**: Planning
**Current Implementation**: `src/components/extension-options/StorageBrowser.tsx`

---

## Overview

Redesign the Storage section in the Options page to show four distinct data source categories instead of a flat table list.

---

## Current State

The Storage section shows a flat list of SQLite tables and views with row counts. Users can browse, edit, and clear table data. There is no visibility into session storage, cookies, or IndexedDB/localStorage.

---

## Target Design

### Four Category Cards

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐
│  Database    │ │   Session   │ │   Cookies   │ │ IndexedDB /      │
│  (SQLite)    │ │   Storage   │ │             │ │ LocalStorage     │
│              │ │             │ │             │ │                  │
│  9 tables    │ │  12 keys    │ │  4 cookies  │ │  8 keys          │
│  1 view      │ │             │ │             │ │                  │
│  ~2.4 MB     │ │  ~48 KB     │ │  ~1 KB      │ │  ~256 KB         │
└─────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘
```

Clicking a card expands to show the sub-items (tables, keys, cookies).

### Database Card (Existing + Enhancements)

- Shows current table/view list (existing behavior)
- **NEW**: Database size indicator (total bytes of logs.db + errors.db)
- **FIX**: PromptsDetails view must populate correctly (currently broken)

### Session Storage Card

- Lists `chrome.storage.session` keys and values
- Read-only display (session storage is transient)

### Cookies Card

- Lists cookies relevant to the extension (marco-specific, auth tokens)
- Shows cookie name, value (truncated), domain, expiry
- Read-only (cookies managed by browser)

### IndexedDB / LocalStorage Card

- Lists `chrome.storage.local` keys with sizes
- Lists `localStorage` keys used by the macro controller
- Editable for `chrome.storage.local` entries

---

## Tasks

| # | Task | Effort |
|---|------|--------|
| 55.1 | Add category card layout to StorageBrowser | 3h |
| 55.2 | Implement DB size calculation (background handler) | 1h |
| 55.3 | Fix PromptsDetails view population bug | 2h |
| 55.4 | Add Session Storage viewer (chrome.storage.session) | 2h |
| 55.5 | Add Cookies viewer | 2h |
| 55.6 | Add IndexedDB/LocalStorage viewer | 2h |

---

## Bug: PromptsDetails View Not Populating

The `PromptsDetails` view is registered in `BROWSABLE_VIEWS` but returns empty data. Root cause TBD — likely the view SQL references tables that aren't populated at query time, or the view definition has a schema mismatch.

### Investigation Steps
1. Check view definition in `db-schemas.ts`
2. Verify underlying tables (Prompts, PromptsCategory, PromptsToCategory) have data
3. Run view query manually in Storage Browser SQL mode

---

## Acceptance Criteria

1. [ ] Storage section shows 4 category cards with item counts and sizes
2. [ ] Database card shows total DB size in human-readable format
3. [ ] PromptsDetails view returns data when underlying tables are populated
4. [ ] Session, Cookie, and LocalStorage viewers functional
5. [ ] Existing table CRUD operations unchanged
