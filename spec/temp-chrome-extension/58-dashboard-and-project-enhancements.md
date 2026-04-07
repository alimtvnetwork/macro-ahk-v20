# Spec 58 — Dashboard & Project Enhancements

**Priority**: Medium
**Status**: Planning (some items awaiting user details)

---

## 1. URL Section in Macro Dashboard

### Current State
Projects have `targetUrls: UrlRule[]` for URL matching. No support for "URLs to open" or "URLs to ignore".

### Target: Three URL Sub-Sections

#### 1a. URL Rules (Existing)
- Pattern-based URL matching (`glob`, `regex`, `exact`, `prefix`)
- Existing `UrlRule` type — no changes needed

#### 1b. URL to Open (New)
Named URL variables accessible from scripts.

```typescript
interface UrlToOpen {
  variableName: string;   // e.g., "dashboard", "adminPanel"
  url: string;            // e.g., "https://app.example.com/dashboard"
  description?: string;
}
```

**Usage in scripts**:
```javascript
const urls = marco.project.urls;  // { dashboard: "https://...", adminPanel: "https://..." }
window.open(urls.dashboard);
```

#### 1c. URL to Ignore (New)
URLs where the project should NOT activate, even if they match URL rules.

```typescript
interface UrlIgnoreRule {
  pattern: string;
  matchType: "glob" | "regex" | "exact" | "prefix";
}
```

### Data Model Changes

```typescript
interface StoredProject {
  // ... existing fields ...
  targetUrls: UrlRule[];           // existing
  urlsToOpen?: UrlToOpen[];        // NEW
  urlsToIgnore?: UrlIgnoreRule[];  // NEW
}
```

---

## 2. ChatBox XPath — Move to Project Level

### Current State
`chatBoxXPath` is in global `ExtensionSettings`. This is wrong because different projects target different applications with different DOM structures.

### Target
Move `chatBoxXPath` from global settings to `ProjectSettings`:

```typescript
interface ProjectSettings {
  // ... existing fields ...
  chatBoxXPath?: string;    // NEW — project-specific XPath for chat input
}
```

Remove from `ExtensionSettings` (or keep as fallback default).

---

## 3. Script Update URL

### Current State
Scripts are stored inline in projects. No mechanism to update scripts from remote sources.

### Target
Add optional `updateUrl` field to `ScriptEntry`:

```typescript
interface ScriptEntry {
  // ... existing fields ...
  updateUrl?: string;         // NEW — URL to check for script updates
  cachedVersion?: string;     // NEW — last downloaded version
  lastCheckedAt?: string;     // NEW — ISO timestamp of last check
}
```

### Update Flow

```
[Script has updateUrl]
        │
        ▼
[HTTP GET updateUrl]
        │
        ├── Direct response → { version, scriptUrl }
        │
        └── 301 Redirect → follow → cache final URL
                                │
                                ▼
                         [Compare version]
                                │
                         ┌──────┴──────┐
                         │             │
                    [Same]        [Different]
                    Skip           │
                                   ▼
                            [Download script]
                                   │
                                   ▼
                            [Save to SQLite]
                            [Update ScriptEntry.code]
                            [Update cachedVersion]
```

### UI
- "Update URL" field in Script Editor (optional, can be empty)
- "Check for Update" button next to the URL field
- Status indicator: "Up to date" / "Update available (v1.2.3)"

**NOTE**: Authentication for script downloads is deferred. User will provide details later.

---

## 4. Editable Project Title and Version

### Current State
Project title appears as a header but cannot be edited inline. Version is displayed as a badge but is also not editable.

### Target
- **Title**: Double-click to enter edit mode (inline text input)
- **Version**: Editable text field next to the title

### UI Behavior
```
[View Mode]   "My Project"  v1.0.0
                   ↓ double-click
[Edit Mode]   [My Project________]  [1.0.0__]  [Save] [Cancel]
```

---

## 5. Settings Tab Consolidation

### Current State
Project editor has many tabs: URL Rules, Scripts, Configs, Cookies, Network, Data, Settings.

### Target
Group infrequently used tabs into a "Settings" dropdown:

```
[URL Rules] [Scripts] [Settings ▾]
                         ├── Cookies
                         ├── Network  
                         ├── Data
                         ├── Configs
                         └── Advanced
```

Hover or click on "Settings" shows the dropdown submenu.

---

## 6. Project-Level Updater (Placeholder)

> **NOTE**: This is a future feature. Details TBD — user will provide API contract.

Concept: A project can have an update URL that points to a zip file containing the complete project (scripts, configs, settings). The extension downloads, validates, and imports the project automatically.

**Deferred items**:
- Authentication (bearer token, license key, username/password)
- Zip file format specification
- Auto-import vs manual confirm
- Rollback on failed update

### Data Model (Placeholder)

```typescript
interface ProjectUpdateConfig {
  updateUrl?: string;
  authType?: "none" | "bearer" | "basic" | "license";
  authCredentials?: {
    token?: string;
    username?: string;
    password?: string;
    licenseKey?: string;
  };
  autoUpdate?: boolean;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
}
```

---

## Tasks

| # | Task | Effort | Status |
|---|------|--------|--------|
| 58.1 | Add URL to Open / URL to Ignore to project model | 2h | Planning |
| 58.2 | Build URL section UI in Project Editor | 3h | Planning |
| 58.3 | Move chatBoxXPath to ProjectSettings | 1h | ✅ Done |
| 58.4 | Add updateUrl to ScriptEntry model | 1h | Planning |
| 58.5 | Implement script update check + download | 3h | Awaiting details |
| 58.6 | Editable project title (double-click) | 2h | Planning |
| 58.7 | Editable project version field | 1h | Planning |
| 58.8 | Consolidate tabs into Settings dropdown | 2h | Planning |
| 58.9 | Project-level updater system | TBD | Awaiting details |

---

## Acceptance Criteria

1. [ ] Project editor shows URL Rules, URLs to Open, URLs to Ignore
2. [ ] URLs to Open accessible as variables from injected scripts
3. [ ] ChatBox XPath is per-project, not global
4. [ ] Scripts can have optional update URLs
5. [ ] Project title editable via double-click
6. [ ] Project version editable
7. [ ] Infrequently used tabs grouped under Settings dropdown
