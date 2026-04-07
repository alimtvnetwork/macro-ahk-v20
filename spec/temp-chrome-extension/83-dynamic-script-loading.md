# Spec 83 — Dynamic Script Loading System

> **Status**: Implemented  
> **Created**: 2026-04-03  
> **References**: `src/background/handlers/dynamic-require-handler.ts`, `src/background/marco-sdk-template.ts`

## Overview

Dynamic script loading allows scripts running in the page context to request
additional scripts at runtime using an **await-style** API. The Chrome
extension background service worker acts as gatekeeper — it verifies
project-level permission flags, injects the target script, and logs every
attempt to SQLite.

```
Script A  →  RiseupAsiaMacroExt.require("XPath")
          →  postMessage → content relay → background SW
          →  validates flags → injects script → resolves Promise
```

---

## 1. API Reference

### `RiseupAsiaMacroExt.require(target): Promise<Namespace>`

Dynamically loads a script from an approved project and returns a reference
to its namespace.

| Parameter | Type     | Description |
|-----------|----------|-------------|
| `target`  | `string` | Target identifier (see Resolution Rules below) |

**Returns**: `Promise` that resolves to the target project's namespace object,
or rejects with an `Error` describing the failure.

#### Usage

```javascript
// Load by project codeName (returns first script)
const xpath = await RiseupAsiaMacroExt.require("XPath");

// Load by project + script name
const utils = await RiseupAsiaMacroExt.require("SharedUtils.helpers");

// Load with Projects prefix (equivalent)
const lib = await RiseupAsiaMacroExt.require("Projects.SharedUtils");
```

#### Target Resolution Rules

The `target` string is resolved in this order:

1. Strip `"Projects."` prefix if present
2. If format is `"ProjectName.scriptName"`:
   - Match project by `codeName`, `name`, or `slug` (case-insensitive)
   - Match script by `path` (contains) or `description` (exact)
3. If format is `"ProjectName"` (no dot):
   - Match project by `codeName`, `name`, or `slug`
   - Return the **first script** in that project

| Target String             | Resolved Project | Resolved Script       |
|---------------------------|------------------|-----------------------|
| `"XPath"`                 | XPath project    | First script          |
| `"Projects.XPath"`        | XPath project    | First script          |
| `"SharedUtils.helpers"`   | SharedUtils      | Script matching "helpers" |

---

## 2. Project Flags

Two flags control dynamic loading permissions:

### `allowDynamicRequests` (on `ProjectSettings`)

When `true`, this project's scripts are permitted to call
`RiseupAsiaMacroExt.require()`. If `false` (default), all require calls
from this project are denied.

```typescript
interface ProjectSettings {
    id: string;
    name: string;
    codeName: string;
    allowDynamicRequests?: boolean;  // default: false
}
```

### `isGlobal` (on `StoredProject`)

When `true`, this project's scripts can be loaded by **any** other project.
If `false` (default), only scripts within the same project can be loaded.

```typescript
interface StoredProject {
    id: string;
    name: string;
    codeName: string;
    isGlobal?: boolean;  // default: false
}
```

### Permission Matrix

| Requester `allowDynamicRequests` | Target `isGlobal` | Same Project? | Result  |
|----------------------------------|--------------------|---------------|---------|
| `false`                          | any                | any           | ❌ Denied |
| `true`                           | `true`             | any           | ✅ Loaded |
| `true`                           | `false`            | yes           | ✅ Loaded |
| `true`                           | `false`            | no            | ❌ Denied |

---

## 3. Message Protocol

### `DYNAMIC_REQUIRE` (page → background)

| Field                | Type     | Description |
|----------------------|----------|-------------|
| `type`               | `string` | "DYNAMIC_REQUIRE" |
| `target`             | `string` | Target identifier |
| `requesterProjectId` | `string` | UUID of the calling project |
| `tabId`              | `number` | Tab where the script should be injected |

### Response

| Field          | Type      | Description |
|----------------|-----------|-------------|
| `isOk`         | `boolean` | Whether the script was loaded |
| `namespace`    | `string?` | Namespace path (e.g. `RiseupAsiaMacroExt.Projects.XPath`) |
| `errorMessage` | `string?` | Human-readable error if `isOk` is `false` |

---

## 4. Error Handling

All errors reject the Promise with a descriptive `Error` message.

| Error Condition                          | Error Message |
|------------------------------------------|---------------|
| Missing fields in request                | `DYNAMIC_REQUIRE: missing target, requesterProjectId, or tabId` |
| Requester project not found              | `Requester project "<id>" not found` |
| `allowDynamicRequests` is disabled       | `Project "<name>" does not have allowDynamicRequests enabled` |
| Target project/script not found          | `Cannot resolve target "<target>"` |
| Target project is not global             | `Project "<name>" is not marked as global — cannot be dynamically loaded` |
| Script code is empty                     | `Script code for "<target>" is empty or not found` |
| Injection failure (CSP, tab error, etc.) | Native error message from `chrome.scripting` |

### Script-side error handling

```javascript
try {
    const xpath = await RiseupAsiaMacroExt.require("XPath");
    xpath.evaluate("//div");
} catch (err) {
    console.error("Failed to load XPath:", err.message);
    // err.message contains one of the error messages above
}
```

---

## 5. SQLite Logging

Every dynamic loading attempt is recorded in the `DynamicLoadLog` table
in `logs.db`.

### Schema

```sql
CREATE TABLE IF NOT EXISTS DynamicLoadLog (
    Id          INTEGER PRIMARY KEY AUTOINCREMENT,
    Timestamp   TEXT    NOT NULL,
    Requester   TEXT    NOT NULL,    -- requester project ID
    Target      TEXT    NOT NULL,    -- target string as passed to require()
    Status      TEXT    NOT NULL,    -- loaded | denied | not_found | error
    Detail      TEXT,               -- human-readable context
    ExtVersion  TEXT                 -- extension version at time of event
);

CREATE INDEX IF NOT EXISTS IdxDynLoadTimestamp ON DynamicLoadLog(Timestamp);
CREATE INDEX IF NOT EXISTS IdxDynLoadRequester ON DynamicLoadLog(Requester);
CREATE INDEX IF NOT EXISTS IdxDynLoadStatus    ON DynamicLoadLog(Status);
```

### Status Values

| Status      | Meaning |
|-------------|---------|
| `loaded`    | Script was successfully injected |
| `denied`    | Permission check failed (flags) |
| `not_found` | Target project or script could not be resolved |
| `error`     | Runtime error during injection |

### Example Log Entries

```
| Timestamp            | Requester  | Target              | Status    | Detail                              |
|----------------------|------------|---------------------|-----------|-------------------------------------|
| 2026-04-03T10:15:00Z | proj-abc   | XPath               | loaded    | Injected into tab 42                |
| 2026-04-03T10:15:01Z | proj-def   | SharedUtils.helpers | denied    | allowDynamicRequests is disabled    |
| 2026-04-03T10:15:02Z | proj-abc   | NonExistent         | not_found | Target project or script not found  |
```

---

## 6. Data Flow Diagram

```
┌─────────────┐   postMessage    ┌───────────────┐   chrome.runtime   ┌─────────────────────┐
│  Script A   │ ───────────────► │ Content Relay │ ──────────────────► │ Background SW       │
│  (page)     │                  │ (content.js)  │                    │                     │
│             │                  └───────────────┘                    │ 1. Validate flags   │
│ await       │                                                       │ 2. Resolve target   │
│ require()   │   resolved       ┌───────────────┐   sendResponse    │ 3. Load script code │
│             │ ◄─────────────── │ Content Relay │ ◄────────────────── │ 4. Inject via CSP   │
│ namespace   │                  └───────────────┘                    │ 5. Log to SQLite    │
└─────────────┘                                                       └─────────────────────┘
```

---

## 7. Security Considerations

1. **No self-loading**: Scripts cannot bypass the extension — `require()` always
   routes through the background service worker for validation.
2. **Flag-gated**: Both `allowDynamicRequests` (requester) and `isGlobal` (target)
   must be explicitly enabled. Defaults are `false`.
3. **Audit trail**: Every attempt (including denials) is logged to SQLite with
   timestamps and project IDs, enabling post-incident analysis.
4. **Same-project exemption**: Scripts within the same project can load each
   other without requiring `isGlobal`, but still need `allowDynamicRequests`.

## 8. Files

| File | Role |
|------|------|
| `src/shared/messages.ts` | `DYNAMIC_REQUIRE` message type |
| `src/shared/project-types.ts` | `allowDynamicRequests` on `ProjectSettings` |
| `src/background/handlers/dynamic-require-handler.ts` | Core handler + SQLite logging |
| `src/background/marco-sdk-template.ts` | `RiseupAsiaMacroExt.require()` client API |
| `src/background/message-registry.ts` | Handler registration |
| `src/background/db-schemas.ts` | `DynamicLoadLog` table schema |
