# Spec 67 — Project-Scoped Database & REST API System

**Date**: 2026-03-23  
**Status**: Implemented  
**Spec**: `spec/11-chrome-extension/67-project-scoped-database-and-rest-api.md`

---

## Overview

Extends the project model with per-project SQLite databases, a Prisma-style query builder, custom REST-like API endpoints (via message bridge + local HTTP proxy), and a restructured Storage tab in the Options UI. Also renames the SDK namespace from `riseupAsia.projects.<camelCase>` to `RiseupAsiaMacroExt.Projects.<PascalCase>`.

## 1. Namespace Rename

### Old
```
riseupAsia.projects.marcoDashboard
window.riseupAsia.projects.marcoDashboard.vars.get("key")
```

### New
```
RiseupAsiaMacroExt.Projects.MarcoDashboard
window.RiseupAsiaMacroExt.Projects.MarcoDashboard.vars.get("key")
```

- Root namespace `RiseupAsiaMacroExt` is hardcoded/fixed.
- Project key is the **codeName** (PascalCase).

## 2. Project Identifiers

Each project now has two derived identifiers:

| Field | Format | Example | Usage |
|-------|--------|---------|-------|
| `slug` | hyphen-case | `marco-dashboard` | URL-safe IDs, file paths, DB names |
| `codeName` | PascalCase | `MarcoDashboard` | SDK namespace key, API endpoint prefix |

### Generation (in `src/lib/slug-utils.ts`)
```typescript
slugify("Marco Dashboard")     → "marco-dashboard"
toCodeName("marco-dashboard")  → "MarcoDashboard"
toSdkNamespace("MarcoDashboard") → "RiseupAsiaMacroExt.Projects.MarcoDashboard"
```

### Storage
Both `slug` and `codeName` are stored on `StoredProject` as optional fields, auto-derived from `name` on save if empty.

## 3. Project-Scoped SQLite Database

### Architecture
- Each project gets its own SQLite `.db` file: `<slug>.db`
- Managed via OPFS (primary) or chrome.storage.local (fallback)
- Schema is user-defined via the UI (create tables, columns, types)

### Supported Column Types
- `TEXT`, `INTEGER`, `REAL`, `BLOB`, `BOOLEAN` (stored as INTEGER 0/1)

### DB Manager Extension
- `src/background/project-db-manager.ts` — manages per-project DB lifecycle
- `initProjectDb(slug: string, schema: string): Promise<ProjectDbManager>`
- `getProjectDb(slug: string): SQLjsDatabase`
- `flushProjectDb(slug: string): Promise<void>`
- `dropProjectDb(slug: string): Promise<void>`

### Schema Storage
Table definitions are stored in a `ProjectSchema` table in the project's DB:
```sql
CREATE TABLE IF NOT EXISTS ProjectSchema (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  TableName TEXT NOT NULL UNIQUE,
  ColumnDefs TEXT NOT NULL,  -- JSON array of column definitions
  EndpointName TEXT,         -- optional custom endpoint name
  CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Prisma-Style Query Builder
```typescript
// Usage in injected scripts
const db = RiseupAsiaMacroExt.Projects.MarcoDashboard.db;

// Create
await db.Users.create({ data: { Name: "John", Email: "john@test.com" } });

// Find many
const users = await db.Users.findMany({ where: { Name: "John" }, orderBy: { Id: "desc" }, take: 10 });

// Find unique
const user = await db.Users.findUnique({ where: { Id: 1 } });

// Update
await db.Users.update({ where: { Id: 1 }, data: { Name: "Jane" } });

// Delete
await db.Users.delete({ where: { Id: 1 } });

// Count
const count = await db.Users.count({ where: { Name: "John" } });
```

Implementation: `src/background/project-query-builder.ts` translates Prisma-style calls to parameterized SQL.

## 4. Project REST API Endpoints

### Message Bridge (Internal)
Projects can define custom endpoints accessible via `chrome.runtime.sendMessage`:
```typescript
// Message type: PROJECT_API
{
  type: "PROJECT_API",
  project: "marco-dashboard",
  endpoint: "users",
  method: "GET",    // GET | POST | PUT | DELETE
  params: { ... }
}
```

### HTTP Proxy (External)
A lightweight HTTP proxy runs on a configurable local port (default: 19280) for external tool access (Postman, cURL, PowerShell):

```
GET    http://localhost:19280/api/marco-dashboard/users
POST   http://localhost:19280/api/marco-dashboard/users
PUT    http://localhost:19280/api/marco-dashboard/users/1
DELETE http://localhost:19280/api/marco-dashboard/users/1
```

### Endpoint Definition
Endpoints are auto-generated from table names or manually named via the `EndpointName` field in `ProjectSchema`.

### Security
- HTTP proxy only listens on `127.0.0.1`
- Optional API key per project (stored in ProjectKv)
- Rate limiting: 100 req/sec per project

## 5. Storage Tab Restructure

### Old
```
Data tab (flat)
```

### New
```
Storage tab
├── KV Store      (existing ProjectKv)
├── Database      (project SQLite tables — create/edit/delete tables)
├── Files         (existing ProjectFiles)
└── IndexedDB     (browser IndexedDB viewer for the extension origin)
```

### Database Sub-Tab Features
- **Table List**: Shows all user-created tables with row counts
- **Create Table**: Form to define table name + columns (name, type, nullable, default)
- **Table Browser**: Paginated row viewer with inline edit/delete
- **Schema Viewer**: Shows SQL DDL for each table
- **Endpoint Config**: Toggle endpoint exposure, set custom endpoint name

## 6. Developer Guide Enhancements

### Copy-All Button
A top-level "Copy All" button at the header of the DevGuideSection copies the entire guide content (namespace, all snippets, API docs) as formatted text suitable for sharing with AI assistants.

### Additional SDK Functions Documented

```
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.create(...)
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.findMany(...)
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.findUnique(...)
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.update(...)
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.delete(...)
RiseupAsiaMacroExt.Projects.<CodeName>.db.<Table>.count(...)
RiseupAsiaMacroExt.Projects.<CodeName>.api.register(name, handler)
RiseupAsiaMacroExt.Projects.<CodeName>.api.list()
```

## 7. Implementation Files

| File | Purpose |
|------|---------|
| `src/lib/slug-utils.ts` | `slugify()`, `toCodeName()`, `toSdkNamespace()` |
| `src/shared/project-types.ts` | `slug`, `codeName` fields on `StoredProject` |
| `src/background/project-db-manager.ts` | Per-project DB lifecycle |
| `src/background/project-query-builder.ts` | Prisma-style SQL translator |
| `src/background/handlers/project-api-handler.ts` | PROJECT_API message handler |
| `src/background/project-http-proxy.ts` | Local HTTP proxy for external access |
| `src/components/options/DevGuideSection.tsx` | Developer guide with copy-all |
| `src/components/options/project-database/` | Database sub-tab UI components |
| `standalone-scripts/marco-sdk/src/db.ts` | SDK db namespace module |
| `standalone-scripts/marco-sdk/src/api.ts` | SDK api namespace module |

## 8. Related Specs

- Spec 63: Rise Up Macro SDK (`spec/11-chrome-extension/63-rise-up-macro-sdk.md`)
- Spec 65: Developer Docs & Project Slug (`spec/11-chrome-extension/65-developer-docs-and-project-slug.md`)
- Spec 17: Data Models (`spec/07-data-and-api/data-models.md`)
