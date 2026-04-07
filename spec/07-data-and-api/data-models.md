# Spec: Data Models — SQLite Schema Reference

**Version**: 3.0.0  
**Status**: ACTIVE  
**Created**: 2026-03-21  
**Updated**: 2026-03-21  

---

## Overview

The Marco extension uses SQLite (via sql.js in a service worker) as its primary storage layer.  
Two databases exist:

| Database    | File Key  | Tables                                                         |
|-------------|-----------|----------------------------------------------------------------|
| **logs.db** | `logsDb`  | Sessions, Logs, Prompts, ProjectKv, ProjectFiles, Scripts      |
| **errors.db** | `errorsDb` | Errors                                                      |

> **Note**: The project does **not** use Prisma. All schemas are raw SQL managed in `src/background/db-schemas.ts`. The models below are written in a Prisma-like notation for readability.

> **Naming Convention**: All database entities (tables, columns, indexes) use **PascalCase**. Underscores are strictly forbidden. See `spec/08-coding-guidelines/coding-guidelines/database-naming.md`.

> **ID Convention**: All primary key `id` columns use **INTEGER PRIMARY KEY AUTOINCREMENT**. TEXT/GUID identifiers are **never** used as primary keys. See `spec/08-coding-guidelines/coding-guidelines/database-id-convention.md`.

---

## Data Models (Prisma-style notation)

### 1. Sessions

```prisma
model Session {
  Id        Int      @id @default(autoincrement())
  StartedAt DateTime
  EndedAt   DateTime?
  Version   String
  UserAgent String?
  Notes     String?
}
```

| Column    | SQLite Type | Constraints              | Description                          |
|-----------|-------------|--------------------------|--------------------------------------|
| Id        | INTEGER     | PRIMARY KEY AUTOINCREMENT| Auto-incremented session identifier  |
| StartedAt | TEXT        | NOT NULL                 | ISO 8601 timestamp                   |
| EndedAt   | TEXT        | nullable                 | Session end time                     |
| Version   | TEXT        | NOT NULL                 | Extension version at session start   |
| UserAgent | TEXT        | nullable                 | Browser user agent string            |
| Notes     | TEXT        | nullable                 | Free-form session notes              |

---

### 2. Logs

```prisma
model Log {
  Id         Int      @id @default(autoincrement())
  SessionId  Int
  Timestamp  DateTime
  Level      String   // DEBUG | INFO | WARN | ERROR | SUCCESS
  Source     String   // user-script | background | content-script | popup
  Category   String   // INJECTION | AUTH | CREDIT | NAVIGATION | ...
  Action     String   // Specific action name
  LogType    String?
  Indent     Int      @default(0)
  Detail     String?
  Metadata   String?  // JSON blob
  DurationMs Int?
  ProjectId  String?
  UrlRuleId  String?
  ScriptId   String?
  ConfigId   String?
  ExtVersion String?
}
```

**Indexes**: IdxLogsSession, IdxLogsLevel, IdxLogsSource, IdxLogsCategory, IdxLogsTimestamp, IdxLogsProject, IdxLogsScript

---

### 3. Errors

```prisma
model Error {
  Id          Int      @id @default(autoincrement())
  SessionId   Int
  LogId       Int?
  Timestamp   DateTime
  Level       String
  Source      String
  Category    String
  ErrorCode   String?
  Step        Int?
  Xpath       String?
  Message     String
  StackTrace  String?
  Context     String?  // JSON blob
  Resolved    Boolean  @default(false)
  Resolution  String?
  ProjectId   String?
  UrlRuleId   String?
  ScriptId    String?
  ConfigId    String?
  ScriptFile  String?
  ErrorLine   Int?
  ErrorColumn Int?
  ExtVersion  String?
}
```

**Indexes**: IdxErrorsSession, IdxErrorsCode, IdxErrorsLevel, IdxErrorsResolved, IdxErrorsProject, IdxErrorsScript

---

### 4. Prompts

```prisma
model Prompt {
  Id         Int      @id @default(autoincrement())
  Slug       String?  @unique   // Semantic identifier for seeded prompts (e.g., "default-start")
  Name       String
  Text       String
  Version    String   @default("1.0.0")  // Semantic versioning
  SortOrder  Int      @default(0)
  IsDefault  Boolean  @default(false)     // Seeded from filesystem
  IsFavorite Boolean  @default(false)
  CreatedAt  DateTime
  UpdatedAt  DateTime
}
```

**Indexes**: IdxPromptsOrder, IdxPromptsSlug

| Column     | Description                                             |
|------------|---------------------------------------------------------|
| Slug       | Semantic identifier for dedup during seeding (e.g., "default-start") |
| Version    | Semver string (e.g., "1.0.0") — tracks prompt revisions |
| IsDefault  | 1 = seeded from `standalone-scripts/prompts/`           |
| IsFavorite | 1 = user pinned this prompt                             |
| SortOrder  | Display order in dropdown                               |

---

### 5. ProjectKv

```prisma
model ProjectKv {
  ProjectId String
  Key       String
  Value     String   // JSON-encoded
  UpdatedAt DateTime @default(now())

  @@id([ProjectId, Key])
}
```

**Indexes**: IdxProjectKvProject

Used for: Task Next settings, per-project preferences, runtime state.

---

### 6. ProjectFiles

```prisma
model ProjectFile {
  Id        Int      @id @default(autoincrement())
  ProjectId String
  Filename  String
  MimeType  String?
  Data      Bytes    // Base64-encoded blob
  Size      Int?
  CreatedAt DateTime @default(now())
}
```

**Indexes**: IdxProjectFilesProject

---

### 7. Scripts

```prisma
model Script {
  Id        Int      @id @default(autoincrement())
  ProjectId String
  Name      String
  Code      String
  Version   String   @default("1.0.0")
  IsDefault Boolean  @default(false)
  CreatedAt DateTime @default(now())
  UpdatedAt DateTime @default(now())
}
```

**Indexes**: IdxScriptsProject

---

### 8. UpdaterInfo

```prisma
model UpdaterInfo {
  Id                          Int      @id @default(autoincrement())
  Name                        String
  Description                 String?
  ScriptUrl                   String
  VersionInfoUrl              String?
  InstructionUrl              String?
  ChangelogUrl                String?
  IsGit                       Boolean  @default(false)
  IsRedirectable              Boolean  @default(true)
  MaxRedirectDepth            Int      @default(2)
  IsInstructionRedirect       Boolean  @default(false)
  InstructionRedirectDepth    Int      @default(2)
  HasInstructions             Boolean  @default(false)
  HasChangelogFromVersionInfo Boolean  @default(true)
  HasUserConfirmBeforeUpdate  Boolean  @default(false)
  IsEnabled                   Boolean  @default(true)
  AutoCheckIntervalMinutes    Int      @default(1440)
  CacheExpiryMinutes          Int      @default(10080)
  CachedRedirectUrl           String?
  CachedRedirectAt            DateTime?
  CurrentVersion              String?
  LatestVersion               String?
  LastCheckedAt               DateTime?
  LastUpdatedAt               DateTime?
  CreatedAt                   DateTime @default(now())
  UpdatedAt                   DateTime @default(now())
}
```

See: `spec/11-chrome-extension/58-updater-system.md`

---

### 8b. UpdateSettings (Global Defaults)

```prisma
model UpdateSettings {
  Id                          Int      @id @default(autoincrement())
  AutoCheckIntervalMinutes    Int      @default(1440)
  HasUserConfirmBeforeUpdate  Boolean  @default(false)
  HasChangelogFromVersionInfo Boolean  @default(true)
  CacheExpiryMinutes          Int      @default(10080)
  CreatedAt                   DateTime @default(now())
  UpdatedAt                   DateTime @default(now())
}
```

---

### 9. UpdaterCategory

```prisma
model UpdaterCategory {
  Id        Int      @id @default(autoincrement())
  Name      String   @unique
  SortOrder Int      @default(0)
  CreatedAt DateTime @default(now())
}
```

---

### 10. UpdaterToCategory (Junction)

```prisma
model UpdaterToCategory {
  Id         Int @id @default(autoincrement())
  UpdaterId  Int @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
  CategoryId Int @relation(references: [UpdaterCategory.Id], onDelete: Cascade)

  @@unique([UpdaterId, CategoryId])
}
```

**Indexes**: IdxUtcUpdater, IdxUtcCategory

---

### 11. UpdaterEndpoints

```prisma
model UpdaterEndpoint {
  Id                 Int      @id @default(autoincrement())
  UpdaterId          Int      @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
  Url                String
  SortOrder          Int      @default(0)
  ExpectedStatusCode Int      @default(200)
  IsRedirectable     Boolean  @default(false)
  MaxRedirectDepth   Int      @default(2)
}
```

**Indexes**: IdxUpdaterEndpointsUpdater

---

### 12. UpdaterSteps

```prisma
model UpdaterStep {
  Id               Int      @id @default(autoincrement())
  UpdaterId        Int      @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
  StepId           String
  SortOrder        Int      @default(0)
  Type             String   // "Download" | "Execute" | "Update" | "Validate"
  Condition        String?
  ResourceType     String?  // "Script" | "Binary" | "ChromeExtension"
  SourceUrl        String?
  ExpectedStatus   Int?     @default(200)
  IsRedirectable   Boolean  @default(false)
  MaxRedirectDepth Int      @default(2)
  Destination      String?
  PostProcess      String?
  ExecutionCommand String?
  ValidationRule   String?
}
```

**Indexes**: IdxUpdaterStepsUpdater

---

### 13. UpdaterDetails (View)

Aggregates UpdaterInfo with category names via `GROUP_CONCAT`. See `spec/07-data-and-api/db-join-specs/01-category-join-pattern.md`.

---

## chrome.storage.local Keys

In addition to SQLite, some transient data lives in `chrome.storage.local`:

| Key                    | Type        | Description                          |
|------------------------|-------------|--------------------------------------|
| `marco_all_projects`   | JSON array  | Project definitions                  |
| `marco_active_project` | string      | Currently active project ID          |
| `marco_all_scripts`    | JSON array  | Global script definitions            |
| `marco_all_configs`    | JSON array  | Global config definitions            |
| `marco_settings`       | JSON object | Extension-wide settings              |

---

## Message API for Storage Operations

### Read Operations
- `GET_LOGS` — Query Logs with optional filters
- `GET_PROMPTS` — List all Prompts
- `GET_LOG_STATS` — Aggregate counts per table

### Write Operations
- `SAVE_PROMPT` — Insert/update a Prompt
- `DELETE_PROMPT` — Remove a Prompt by Id
- `KV_SET` / `KV_GET` / `KV_DELETE` / `KV_LIST` — ProjectKv CRUD

### Storage Browser Operations
- `STORAGE_LIST_TABLES` — Returns table names + row counts
- `STORAGE_QUERY_TABLE` — Paginated SELECT with optional WHERE
- `STORAGE_UPDATE_ROW` — UPDATE a row by primary key
- `STORAGE_DELETE_ROW` — DELETE a row by primary key
- `STORAGE_GET_SCHEMA` — Returns column definitions for a table
- `STORAGE_CLEAR_TABLE` — DELETE all rows from a specific table
- `STORAGE_CLEAR_ALL` — DELETE all rows from all tables
- `STORAGE_RESEED` — Clear all + repopulate from JSON/prompt sources

---

## Filesystem Prompt Structure

```
standalone-scripts/prompts/
├── 01-start-prompt/
│   ├── info.json        # Metadata: Id (slug), Title, Slug, Version, Author, Categories, Order
│   └── prompt.md        # Raw prompt text
├── 02-start-prompt-v2/
│   ├── info.json
│   └── prompt.md
└── ...
```

### info.json Schema

```json
{
  "id": "default-start",
  "title": "Start Prompt",
  "slug": "start-prompt",
  "version": "1.0.0",
  "author": "marco",
  "categories": ["general"],
  "isDefault": true,
  "order": 0,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```
