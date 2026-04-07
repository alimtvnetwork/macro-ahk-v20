# Spec 58 — Updater System

**Priority**: High  
**Status**: Planning  
**Created**: 2026-03-23  
**Version**: 1.1.0

---

## Overview

The Updater system manages external resource updates (scripts, Chrome extensions, binaries) via a structured, multi-stage pipeline. It stores update sources in SQLite, fetches version metadata, and optionally executes multi-step instruction sequences.

---

## Database Schema

### 1. UpdaterInfo (Main Table)

```prisma
model UpdaterInfo {
    Id                          Int      @id @default(autoincrement())
    Name                        String               // Human-readable name
    Description                 String?              // Purpose of this updater entry
    ScriptUrl                   String               // Primary URL for the resource
    VersionInfoUrl              String?              // URL returning VersionInfoSchema JSON
    InstructionUrl              String?              // URL returning InstructionSchema JSON
    ChangelogUrl                String?              // Standalone changelog URL (if not from VersionInfo)
    IsGit                       Boolean  @default(false)   // Source is a Git repository
    IsRedirectable              Boolean  @default(true)    // Allow HTTP redirects
    MaxRedirectDepth            Int      @default(2)       // Max redirect hops allowed
    IsInstructionRedirect       Boolean  @default(false)   // InstructionUrl uses redirects
    InstructionRedirectDepth    Int      @default(2)       // Max redirect depth for instruction URL
    HasInstructions             Boolean  @default(false)   // Whether InstructionUrl is set
    HasChangelogFromVersionInfo Boolean  @default(true)    // Get changelog from VersionInfo response
    HasUserConfirmBeforeUpdate  Boolean  @default(false)   // Require user confirmation before applying update
    IsEnabled                   Boolean  @default(true)    // Enable/disable this updater
    AutoCheckIntervalMinutes    Int      @default(1440)    // How often to auto-check (default: 24h)
    CacheExpiryMinutes          Int      @default(10080)   // How long to cache resolved redirect URLs (default: 7d)
    CachedRedirectUrl           String?              // Cached resolved URL after redirect chain
    CachedRedirectAt            String?              // ISO 8601 timestamp when redirect was cached
    CurrentVersion              String?              // Currently installed version
    LatestVersion               String?              // Last known remote version
    LastCheckedAt               String?              // ISO 8601 timestamp of last check
    LastUpdatedAt               String?              // ISO 8601 timestamp of last update
    CreatedAt                   String   @default(now())
    UpdatedAt                   String   @default(now())
}
```

#### New Fields (v1.1.0)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ChangelogUrl` | String? | null | Standalone changelog URL when changelog is not embedded in VersionInfo |
| `HasChangelogFromVersionInfo` | Boolean | true | If checked, changelog is extracted from the VersionInfoSchema response |
| `HasUserConfirmBeforeUpdate` | Boolean | false | When true, user must confirm before the update is applied |
| `AutoCheckIntervalMinutes` | Int | 1440 | Auto-check frequency. Options: 60 (hourly), 300 (5h), 720 (12h), 1440 (1d), 2880 (2d), 4320 (3d), 7200 (5d), 10080 (7d), 21600 (15d), 43200 (monthly), 86400 (2mo), 129600 (3mo), 525600 (yearly) |
| `CacheExpiryMinutes` | Int | 10080 | How long to use a cached redirect URL before re-resolving. Same interval options. |
| `CachedRedirectUrl` | String? | null | The final resolved URL after following redirect chains |
| `CachedRedirectAt` | String? | null | Timestamp when the redirect was cached |

### 2. UpdateSettings (Global Defaults)

```prisma
model UpdateSettings {
    Id                          Int      @id @default(autoincrement())
    AutoCheckIntervalMinutes    Int      @default(1440)
    HasUserConfirmBeforeUpdate  Boolean  @default(false)
    HasChangelogFromVersionInfo Boolean  @default(true)
    CacheExpiryMinutes          Int      @default(10080)
    CreatedAt                   String   @default(now())
    UpdatedAt                   String   @default(now())
}
```

> **Scope**: Global defaults apply to all updaters. Per-source overrides (in UpdaterInfo) take precedence when set.

### 3. UpdaterCategory

```prisma
model UpdaterCategory {
    Id        Int      @id @default(autoincrement())
    Name      String   @unique    // e.g., "Script", "ChromeExtension", "Security", "Feature"
    SortOrder Int      @default(0)
    CreatedAt String   @default(now())
}
```

> **Category dimensions**: Both resource types (`Script`, `Binary`, `ChromeExtension`) and update types (`Security`, `Feature`, `Bugfix`) coexist in the same table. Use naming conventions to distinguish if needed.

### 4. UpdaterToCategory (Junction)

```prisma
model UpdaterToCategory {
    Id         Int @id @default(autoincrement())
    UpdaterId  Int @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
    CategoryId Int @relation(references: [UpdaterCategory.Id], onDelete: Cascade)

    @@unique([UpdaterId, CategoryId])
}
```

### 5. UpdaterEndpoints (One-to-Many)

```prisma
model UpdaterEndpoint {
    Id                 Int      @id @default(autoincrement())
    UpdaterId          Int      @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
    Url                String
    SortOrder          Int      @default(0)   // Execution priority (ascending)
    ExpectedStatusCode Int      @default(200)
    IsRedirectable     Boolean  @default(false)
    MaxRedirectDepth   Int      @default(2)
}
```

### 6. UpdaterSteps (One-to-Many)

```prisma
model UpdaterStep {
    Id               Int      @id @default(autoincrement())
    UpdaterId        Int      @relation(references: [UpdaterInfo.Id], onDelete: Cascade)
    StepId           String               // Semantic identifier for tracking
    SortOrder        Int      @default(0)  // Execution order (ascending)
    Type             String               // "Download" | "Execute" | "Update" | "Validate"
    Condition        String?              // Optional expression; skip if false
    ResourceType     String?              // "Script" | "Binary" | "ChromeExtension"
    SourceUrl        String?
    ExpectedStatus   Int?     @default(200)
    IsRedirectable   Boolean  @default(false)
    MaxRedirectDepth Int      @default(2)
    Destination      String?              // Target path or location
    PostProcess      String?              // Post-download action (e.g., "extract")
    ExecutionCommand String?              // Command for Execute type
    ValidationRule   String?              // Rule for Validate type
}
```

### 7. UpdaterDetails View

```sql
CREATE VIEW IF NOT EXISTS UpdaterDetails AS
SELECT
    u.Id                            AS UpdaterId,
    u.Name                          AS Name,
    u.Description                   AS Description,
    u.ScriptUrl                     AS ScriptUrl,
    u.VersionInfoUrl                AS VersionInfoUrl,
    u.InstructionUrl                AS InstructionUrl,
    u.ChangelogUrl                  AS ChangelogUrl,
    u.IsGit                         AS IsGit,
    u.IsRedirectable                AS IsRedirectable,
    u.MaxRedirectDepth              AS MaxRedirectDepth,
    u.IsInstructionRedirect         AS IsInstructionRedirect,
    u.InstructionRedirectDepth      AS InstructionRedirectDepth,
    u.HasInstructions               AS HasInstructions,
    u.HasChangelogFromVersionInfo   AS HasChangelogFromVersionInfo,
    u.HasUserConfirmBeforeUpdate    AS HasUserConfirmBeforeUpdate,
    u.IsEnabled                     AS IsEnabled,
    u.AutoCheckIntervalMinutes      AS AutoCheckIntervalMinutes,
    u.CacheExpiryMinutes            AS CacheExpiryMinutes,
    u.CachedRedirectUrl             AS CachedRedirectUrl,
    u.CachedRedirectAt              AS CachedRedirectAt,
    u.CurrentVersion                AS CurrentVersion,
    u.LatestVersion                 AS LatestVersion,
    u.LastCheckedAt                 AS LastCheckedAt,
    u.LastUpdatedAt                 AS LastUpdatedAt,
    u.CreatedAt                     AS CreatedAt,
    u.UpdatedAt                     AS UpdatedAt,
    COALESCE(GROUP_CONCAT(uc.Name, ', '), '') AS Categories
FROM UpdaterInfo u
LEFT JOIN UpdaterToCategory utc ON utc.UpdaterId = u.Id
LEFT JOIN UpdaterCategory uc   ON uc.Id = utc.CategoryId
GROUP BY u.Id;
```

---

## Indexes

```sql
CREATE INDEX IF NOT EXISTS IdxUpdaterEndpointsUpdater ON UpdaterEndpoints(UpdaterId);
CREATE INDEX IF NOT EXISTS IdxUpdaterStepsUpdater     ON UpdaterSteps(UpdaterId);
CREATE INDEX IF NOT EXISTS IdxUtcUpdater              ON UpdaterToCategory(UpdaterId);
CREATE INDEX IF NOT EXISTS IdxUtcCategory             ON UpdaterToCategory(CategoryId);
```

---

## Auto-Check Interval Options

| Label | Value (minutes) |
|-------|-----------------|
| Hourly | 60 |
| Every 5 hours | 300 |
| Every 12 hours | 720 |
| Daily | 1440 |
| Every 2 days | 2880 |
| Every 3 days | 4320 |
| Every 5 days | 7200 |
| Weekly | 10080 |
| Every 15 days | 21600 |
| Monthly | 43200 |
| Every 2 months | 86400 |
| Every 3 months | 129600 |
| Yearly | 525600 |

These intervals apply to both `AutoCheckIntervalMinutes` and `CacheExpiryMinutes`.

---

## Redirect URL Caching

When a URL returns a 301 redirect, the resolved final URL is cached in `CachedRedirectUrl` with a timestamp in `CachedRedirectAt`.

### Caching Logic

```
1. Check if CachedRedirectUrl exists and CachedRedirectAt is within CacheExpiryMinutes
2. If cache is valid → use CachedRedirectUrl directly
3. If cache is expired or CachedRedirectUrl is null → follow redirect chain from original URL
4. If CachedRedirectUrl fails (non-200, timeout) → fall back to original URL, re-resolve
5. On successful resolve → update CachedRedirectUrl and CachedRedirectAt
6. On failure → log error, retry on next scheduled check
```

---

## VersionInfoSchema (JSON Response)

The `VersionInfoUrl` returns this JSON:

```json
{
    "Title": "Rise Up Macro SDK",
    "Description": "Core SDK for macro automation",
    "Version": "1.2.0",
    "Changelog": ["Added config reactivity", "Fixed auth retry"],
    "DownloadUrl": "https://example.com/sdk-v1.2.0.js",
    "InstructionUrl": "https://example.com/sdk-instructions.json",
    "UpdateEndpoints": [
        {
            "Url": "https://primary.example.com/update",
            "ExpectedStatusCode": 200,
            "AllowRedirects": true,
            "MaxRedirectDepth": 2
        },
        {
            "Url": "https://fallback.example.com/update",
            "ExpectedStatusCode": 200,
            "AllowRedirects": false,
            "MaxRedirectDepth": 0
        }
    ]
}
```

---

## InstructionSchema (JSON Response)

The `InstructionUrl` returns this JSON:

```json
{
    "Title": "SDK Update Instructions",
    "Description": "Multi-stage update for Rise Up Macro SDK",
    "Version": "1.0.0",
    "Author": "marco",
    "Changelog": ["Initial instruction set"],
    "Steps": [
        {
            "StepId": "fetch-version",
            "Order": 1,
            "Type": "Download",
            "Condition": null,
            "Payload": {
                "ResourceType": "Script",
                "Source": {
                    "Url": "https://example.com/sdk.js",
                    "ExpectedStatusCode": 200,
                    "AllowRedirects": true,
                    "MaxRedirectDepth": 2
                },
                "Destination": "scripts/marco-sdk.js",
                "PostProcess": null,
                "ExecutionCommand": null,
                "ValidationRule": null
            }
        },
        {
            "StepId": "validate-install",
            "Order": 2,
            "Type": "Validate",
            "Condition": null,
            "Payload": {
                "ResourceType": "Script",
                "Source": null,
                "Destination": "scripts/marco-sdk.js",
                "PostProcess": null,
                "ExecutionCommand": null,
                "ValidationRule": "fileExists && versionMatch"
            }
        }
    ]
}
```

---

## Execution Flow

```
1. Read UpdaterInfo row
2. If VersionInfoUrl exists:
   a. Check CachedRedirectUrl — if valid and within CacheExpiryMinutes, use it
   b. Otherwise, fetch VersionInfoUrl (follow redirects if IsRedirectable)
   c. Cache resolved URL if redirect occurred
   d. Parse VersionInfoSchema JSON
   e. If HasChangelogFromVersionInfo, extract changelog from response
   f. Compare Version with CurrentVersion
   g. If newer:
      i.   If HasUserConfirmBeforeUpdate, prompt user for confirmation
      ii.  If InstructionUrl exists → fetch InstructionSchema
      iii. Sort Steps by Order, evaluate Conditions, execute sequentially
      iv.  If no InstructionUrl → use DownloadUrl or UpdateEndpoints (by SortOrder)
   h. Update CurrentVersion, LatestVersion, LastCheckedAt, LastUpdatedAt
3. If no VersionInfoUrl:
   a. Use ScriptUrl directly as a simple download source
4. If URL fails:
   a. Log the error
   b. If CachedRedirectUrl was used, fall back to original URL
   c. Retry on next scheduled check (based on AutoCheckIntervalMinutes)
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| VersionInfoUrl returns non-JSON | Log error, skip update |
| Step condition evaluates false | Skip step, continue to next |
| Endpoint returns non-expected status | Try next endpoint by SortOrder |
| All endpoints fail | Log error, mark check failed |
| Redirect exceeds MaxRedirectDepth | Abort that URL, try next |
| IsEnabled = false | Skip entirely |
| InstructionUrl + DownloadUrl both set | InstructionUrl takes priority |
| CachedRedirectUrl fails | Fall back to original URL, re-resolve |
| Cache expired | Re-resolve redirect chain from original URL |
| ChangelogUrl fails | Log error, continue without changelog |

---

## Rise Up Macro SDK Integration

The **Rise Up Macro SDK** is registered as the first UpdaterInfo entry:
- `Name`: "Rise Up Macro SDK"
- `IsGit`: false (distributed as bundled IIFE)
- `IsRedirectable`: true
- Global project flag ensures it cannot be removed from the project list

---

## Cross-References

- `spec/07-data-and-api/db-join-specs/01-category-join-pattern.md` — Join pattern used
- `spec/07-data-and-api/data-models.md` — Full schema registry
- `spec/12-devtools-and-injection/sdk-convention.md` — SDK architecture
- `spec/11-chrome-extension/56-extension-update-mechanism.md` — Earlier update URL concept
- `src/background/db-schemas.ts` — SQL implementation
