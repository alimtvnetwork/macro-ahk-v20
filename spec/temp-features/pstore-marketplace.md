# Spec: P Store — Project & Script Marketplace

**Version**: 1.0.0  
**Status**: DRAFT  
**Created**: 2026-03-26  

---

## 1. Problem Statement

Users currently manage projects and scripts locally with no way to discover, share, or import community-contributed automation assets. The P Store provides a searchable marketplace for browsing, previewing, and one-click importing projects and scripts from a remote catalog.

---

## 2. Architecture

### 2.1 Store URL

A configurable base URL stored in Settings → General tab:

| Setting | Default | Description |
|---------|---------|-------------|
| `storeUrl` | `https://store.example.com/api` | Base URL for the P Store API |

### 2.2 API Contract

```
GET  /api/store/search?q={query}&type={project|script|all}&page={n}&limit={20}
GET  /api/store/item/{id}
GET  /api/store/item/{id}/download   → returns .zip
POST /api/store/item/{id}/report
```

#### Search Response

```json
{
  "results": [
    {
      "id": "uuid",
      "name": "My Automation Pack",
      "type": "project" | "script",
      "description": "...",
      "author": "username",
      "version": "1.2.0",
      "tags": ["automation", "data"],
      "downloads": 1234,
      "rating": 4.5,
      "thumbnail": "https://...",
      "createdAt": "2026-01-15T...",
      "updatedAt": "2026-03-20T..."
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### 2.3 Caching Layer

Search results are cached in IndexedDB (`pstore_cache` object store) with a 15-minute TTL. Cache key = `${query}:${type}:${page}`.

---

## 3. UI Design

### 3.1 Entry Point

New "Store" tab in the Options page sidebar, between "Projects" and "Settings".

### 3.2 Store Browser Layout

```
┌──────────────────────────────────────────────┐
│ 🏪 P Store                                   │
├──────────────────────────────────────────────┤
│ [🔍 Search...                    ] [Type ▾]  │
│                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ 📦      │ │ 📜      │ │ 📦      │        │
│ │ Name    │ │ Name    │ │ Name    │        │
│ │ ★★★★☆  │ │ ★★★★★  │ │ ★★★☆☆  │        │
│ │ 1.2k ↓  │ │ 340 ↓  │ │ 89 ↓   │        │
│ │[Import] │ │[Import] │ │[Import] │        │
│ └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ ...     │ │ ...     │ │ ...     │        │
│ └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│           [← 1  2  3  4  5 →]               │
└──────────────────────────────────────────────┘
```

### 3.3 Item Detail Modal

Clicking a card opens a detail modal:

```
┌────────────────────────────────────┐
│ 📦 Automation Pack v1.2.0         │
│ by @username · Updated 3 days ago │
├────────────────────────────────────┤
│ Description text with markdown... │
│                                    │
│ Tags: [automation] [data] [web]    │
│                                    │
│ Files included:                    │
│ ├── project.json                   │
│ ├── scripts/                       │
│ │   ├── main.js                    │
│ │   └── helper.js                  │
│ └── prompts/                       │
│     └── setup.md                   │
│                                    │
│ [⬇ Import to Current Project]     │
│ [⬇ Import as New Project]         │
│ [🚩 Report]                       │
└────────────────────────────────────┘
```

### 3.4 Import Flow

1. User clicks "Import" → download .zip from API
2. Use existing `importFromSqliteZip` pipeline to unpack
3. If "Import to Current Project" → merge into active project
4. If "Import as New Project" → create new project entry
5. Show diff preview before merge (scripts with same slug prompt overwrite confirmation)
6. Toast: "Imported 'Automation Pack' — 3 scripts, 2 prompts added ✅"

---

## 4. Offline / Error Handling

| Scenario | Behavior |
|----------|----------|
| Store unreachable | Show "Store unavailable" banner with retry button |
| Download fails | Toast error, offer retry |
| Corrupt zip | Show validation errors, abort import |
| Duplicate slugs on merge | Show conflict modal with keep/overwrite/skip options |
| Rate limited | Show "Try again in X seconds" |

---

## 5. Files to Create

| File | Description |
|------|-------------|
| `src/pages/options/views/PStoreView.tsx` | Main store browser view |
| `src/components/pstore/StoreCard.tsx` | Item card component |
| `src/components/pstore/StoreDetail.tsx` | Item detail modal |
| `src/components/pstore/StoreSearch.tsx` | Search bar + filters |
| `src/lib/pstore-api.ts` | API client with caching |
| `src/lib/pstore-cache.ts` | IndexedDB cache layer |

---

## 6. Acceptance Criteria

- [ ] Store tab appears in Options sidebar
- [ ] Search returns paginated results from configured URL
- [ ] Results cached in IndexedDB with 15-min TTL
- [ ] Item detail modal shows full metadata + file tree
- [ ] Import downloads .zip and feeds into existing import pipeline
- [ ] Merge conflicts prompt user for resolution
- [ ] Offline/error states handled gracefully
- [ ] Store URL configurable in Settings
