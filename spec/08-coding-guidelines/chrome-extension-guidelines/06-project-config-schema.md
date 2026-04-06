# 06 — Project Configuration Schema

> **Version**: 1.0.0  
> **Last updated**: 2026-02-28

## Purpose

A **project configuration JSON file** (`marco-project.json`) defines the complete injection setup for a website: which scripts to load, in what order, and which JSON config files feed data into them. When a user selects a folder containing this file, the extension reads it and auto-configures the entire project.

---

## 1. Schema Overview

```jsonc
// marco-project.json
{
    "name": "My SaaS Dashboard",
    "version": "1.0.0",
    "description": "Custom automation for the dashboard",
    "targetUrls": [
        {
            "pattern": "https://app.example.com/*",
            "matchType": "glob"
        },
        {
            "pattern": "https://*.example.com/dashboard",
            "matchType": "glob"
        }
    ],
    "scripts": [
        {
            "path": "scripts/init-globals.js",
            "order": 1,
            "runAt": "document_start",
            "description": "Sets up global namespace"
        },
        {
            "path": "scripts/ui-enhancer.js",
            "order": 2,
            "runAt": "document_idle",
            "configBinding": "configs/ui-settings.json",
            "description": "Enhances dashboard UI"
        },
        {
            "path": "scripts/data-collector.js",
            "order": 3,
            "runAt": "document_idle",
            "configBinding": "configs/collection-rules.json",
            "description": "Collects usage metrics"
        }
    ],
    "configs": [
        {
            "path": "configs/ui-settings.json",
            "description": "UI customization parameters"
        },
        {
            "path": "configs/collection-rules.json",
            "description": "Data collection rules and selectors"
        }
    ],
    "settings": {
        "isolateScripts": true,
        "logLevel": "info",
        "retryOnNavigate": true
    }
}
```

---

## 2. Field Definitions

### 2.1 — Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Human-readable project name |
| `version` | `string` | ✅ | Semver version of this config |
| `description` | `string` | ❌ | Optional project description |
| `targetUrls` | `UrlRule[]` | ✅ | URLs where scripts should inject |
| `scripts` | `ScriptEntry[]` | ✅ | Ordered list of scripts to inject |
| `configs` | `ConfigEntry[]` | ❌ | JSON config files referenced by scripts |
| `settings` | `ProjectSettings` | ❌ | Project-level injection settings |

### 2.2 — UrlRule

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pattern` | `string` | ✅ | URL pattern to match |
| `matchType` | `"glob" \| "regex" \| "exact"` | ✅ | How to interpret the pattern |

### 2.3 — ScriptEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | ✅ | Relative path from project root to `.js` file |
| `order` | `number` | ✅ | Execution order (ascending, starting from 1) |
| `runAt` | `"document_start" \| "document_idle" \| "document_end"` | ❌ | When to inject (default: `"document_idle"`) |
| `configBinding` | `string` | ❌ | Path to a JSON config this script consumes |
| `description` | `string` | ❌ | What this script does |

### 2.4 — ConfigEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | ✅ | Relative path from project root to `.json` config |
| `description` | `string` | ❌ | What this config controls |

### 2.5 — ProjectSettings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `isolateScripts` | `boolean` | `true` | Wrap each script in try/catch isolation |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Minimum log level for this project |
| `retryOnNavigate` | `boolean` | `true` | Re-inject on SPA navigation events |

---

## 3. Loading Flow

When a user selects a folder (via File System Access API or file upload):

```
1. Scan folder root for `marco-project.json`
2. Parse and validate JSON against schema
3. For each script entry (sorted by `order`):
    a. Read the .js file from the specified `path`
    b. If `configBinding` is set, read the referenced .json config
    c. Store script + config in OPFS database
4. Create/update the Project record with:
    - Name, version, description from config
    - UrlRules from `targetUrls`
    - ScriptBindings from `scripts` (with order and configBinding)
5. Activate the project
```

---

## 4. Script Execution Order

Scripts are injected in **ascending `order`** value. The `order` field is an integer starting from 1.

```jsonc
// Injection sequence for the example above:
// 1. init-globals.js   (order: 1, runAt: document_start)
// 2. ui-enhancer.js    (order: 2, runAt: document_idle)
// 3. data-collector.js (order: 3, runAt: document_idle)
```

Scripts with the same `runAt` value execute sequentially in `order`. Scripts with `document_start` always run before `document_idle` regardless of `order` value.

---

## 5. Config Binding Mechanism

When a script has a `configBinding`, the extension:

1. Reads the JSON config file
2. Makes the parsed config available to the script via a **global object**:

```typescript
// Injected before the script:
window.__MARCO_CONFIG__ = {
    "ui-settings": { /* parsed ui-settings.json */ },
};
```

The script accesses its config via:

```javascript
const config = window.__MARCO_CONFIG__["ui-settings"];
const accentColor = config.accentColor ?? "#3b82f6";
```

---

## 6. Validation Rules

When loading `marco-project.json`, the extension validates:

| Check | Error If Failed |
|-------|-----------------|
| `name` is non-empty string | `"Project name is required"` |
| `version` matches semver | `"Invalid version format"` |
| `targetUrls` has at least 1 entry | `"At least one target URL required"` |
| `scripts` has at least 1 entry | `"At least one script required"` |
| All `script.path` files exist | `"Script file not found: {path}"` |
| All `configBinding` paths exist in `configs` | `"Config not found: {path}"` |
| `order` values are unique | `"Duplicate order value: {order}"` |
| `order` values are positive integers | `"Order must be a positive integer"` |

---

## 7. Folder Structure Example

```
my-project/
├── marco-project.json          ← project config
├── scripts/
│   ├── init-globals.js         ← order 1
│   ├── ui-enhancer.js          ← order 2, bound to ui-settings.json
│   └── data-collector.js       ← order 3, bound to collection-rules.json
└── configs/
    ├── ui-settings.json        ← UI customization config
    └── collection-rules.json   ← data collection config
```

---

## 8. Schema Versioning (Rule CFG1)

### 8.1 — `schemaVersion` Field Required

Every `marco-project.json` **MUST** include a top-level `schemaVersion` integer. This enables the extension to detect and migrate older project configs.

```jsonc
{
    "schemaVersion": 1,   // ← REQUIRED — integer, starts at 1
    "name": "My Project",
    "version": "1.0.0",
    ...
}
```

### 8.2 — Migration Strategy (Rule CFG2)

When the schema changes (new required fields, renamed fields, structural changes):

1. Increment `schemaVersion` in the spec
2. Add a migration function in the extension that upgrades `schemaVersion: N` → `N+1`
3. Migrations are **chained**: v1 → v2 → v3 (never skip versions)
4. The extension applies all necessary migrations on load, then saves the updated config

```typescript
const CURRENT_SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, (config: unknown) => unknown> = {
    // Future: 1 → 2 migration
    // 1: (config) => ({ ...config, schemaVersion: 2, newField: "default" }),
};

/** Migrates a project config to the current schema version. */
export function migrateProjectConfig(
    config: Record<string, unknown>,
): MarcoProjectConfig {
    let currentVersion = (config.schemaVersion as number) ?? 0;

    while (currentVersion < CURRENT_SCHEMA_VERSION) {
        const migrator = MIGRATIONS[currentVersion];
        const hasMigrator = migrator !== undefined;

        if (hasMigrator) {
            config = migrator(config) as Record<string, unknown>;
        }
        currentVersion++;
    }

    config.schemaVersion = CURRENT_SCHEMA_VERSION;
    return config as unknown as MarcoProjectConfig;
}
```

### 8.3 — Backward Compatibility (Rule CFG3)

- Configs **without** `schemaVersion` are treated as `schemaVersion: 0` and migrated
- New **optional** fields don't require a version bump (use `??` defaults)
- New **required** fields or renamed fields **require** a version bump + migration

---

## 9. Chrome API Constraints (Rule CHR1)

### 9.1 — Chrome APIs Only in Background

`chrome.cookies`, `chrome.scripting`, `chrome.storage`, `chrome.tabs`, `chrome.webNavigation`, and `chrome.alarms` **MUST** only be called from `src/background/` files. Popup, options, and content scripts access these indirectly via message passing.

**Exception**: `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` are permitted in all contexts.

### 9.2 — Async Chrome APIs Must Be Awaited (Rule CHR2)

All Chrome APIs that return promises **MUST** be `await`ed. Never use the deprecated callback form.

```typescript
// ❌ FORBIDDEN — callback form
chrome.storage.local.get("key", (result) => {
    processResult(result);
});

// ✅ REQUIRED — async/await
const result = await chrome.storage.local.get("key");
processResult(result);
```

### 9.3 — Permission Checks Before Optional APIs (Rule CHR3)

Before using an optional permission API (`chrome.management`), **MUST** check permission first:

```typescript
const hasManagementPermission = await chrome.permissions.contains({
    permissions: ["management"],
});

if (hasManagementPermission) {
    await chrome.management.getSelf();
}
```

---

## 10. TypeScript Interface

```typescript
interface MarcoProjectConfig {
    schemaVersion: number;
    name: string;
    version: string;
    description?: string;
    targetUrls: UrlRule[];
    scripts: ScriptEntry[];
    configs?: ConfigEntry[];
    settings?: ProjectSettings;
}

interface UrlRule {
    pattern: string;
    matchType: "glob" | "regex" | "exact";
}

interface ScriptEntry {
    path: string;
    order: number;
    runAt?: "document_start" | "document_idle" | "document_end";
    configBinding?: string;
    description?: string;
}

interface ConfigEntry {
    path: string;
    description?: string;
}

interface ProjectSettings {
    isolateScripts?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error";
    retryOnNavigate?: boolean;
}
```

---

## ESLint Enforcement

| Rule | ESLint Rule / Plugin | Enforces |
|------|---------------------|----------|
| CHR1 | `no-restricted-globals: [error, { name: "chrome", message: "Chrome APIs only in src/background/" }]` | Chrome API isolation (apply to popup/options/content-scripts configs) |
| CHR2 | `@typescript-eslint/no-floating-promises: error` | Chrome API promises must be awaited |
| CHR3 | Code review | Permission checks before optional APIs |

**Override for background files**:

```json
{
    "overrides": [
        {
            "files": ["src/background/**/*.ts"],
            "rules": {
                "no-restricted-globals": "off"
            }
        },
        {
            "files": ["src/**/*.ts"],
            "rules": {
                "no-restricted-imports": ["error", {
                    "patterns": [{
                        "group": ["chrome-types"],
                        "message": "Use @anthropic/chrome-types instead"
                    }]
                }]
            }
        }
    ]
}
```

> **Note**: `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` are exempted from CHR1 — configure via per-file overrides or a custom ESLint rule.

---

## Cross-References

- [Project Model (Spec 12)](../../07-chrome-extension/12-project-model-and-url-rules.md) — Internal Project/UrlRule data model
- [Script & Config Management (Spec 13)](../../07-chrome-extension/13-script-and-config-management.md) — Storage and binding details
- [Function Standards](02-function-standards.md) — Async/await and error handling rules
- [Naming Conventions](01-naming-conventions.md) — Variable naming rules for implementation

*Project config schema v1.2.0 — 2026-02-28*
