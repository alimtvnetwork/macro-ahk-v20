# Chrome Extension — Script & Config Management

**Version**: v0.2 (Expanded)
**Date**: 2026-02-28

---

## Purpose

Define how JavaScript scripts and JSON config files are stored, uploaded, organized, selected, bound to projects/URL rules, and injected at runtime. This expands the basic `scriptInjection.rules` from `07-advanced-features.md` into a full management system.

---

## Script Management

### Sources

Scripts can be added to the extension via three methods:

| Method | Description | UI Location |
|--------|-------------|-------------|
| **Upload** | Drag-and-drop or file picker — copies JS content into extension storage | Options → Scripts section |
| **Folder Path** | User points to a local folder; extension reads `.js` files from it | Options → Scripts section |
| **Built-in** | Ships with extension (`combo.js`, `macro-looping.js`, `xpath-utils.js`) | Pre-loaded, cannot delete |

### Script Store Schema

```typescript
interface StoredScript {
  id: string;              // UUID v4
  name: string;            // Display name (default: file name without extension)
  fileName: string;        // Original file name
  source: 'upload' | 'folder' | 'builtin';
  folderPath: string | null;  // If source='folder', the directory path
  content: string;         // Full JS source code
  size: number;            // Bytes
  hash: string;            // SHA-256 of content (for change detection)
  uploadedAt: string;      // ISO 8601
  updatedAt: string;       // ISO 8601
  version: string;         // User-defined version label (default: "1.0")
  world: 'ISOLATED' | 'MAIN';  // Default execution world (overridable per binding)
  tags: string[];          // User tags for organization, e.g. ["lovable", "automation"]
  metadata: {
    lineCount: number;
    hasIIFE: boolean;      // Detected (function(){...})() wrapper
    usesChrome: boolean;   // Detected chrome.runtime or chrome.storage usage
    usesDOM: boolean;      // Detected document.querySelector, getElementById, etc.
    exportsInit: boolean;  // Detected module.exports or export function init
  };
}
```

### Upload Flow

```
User clicks [+ Add Script] or drags file onto drop zone
    │
    ▼
Validate file:
  ├─ Extension must be .js or .mjs
  ├─ Max size: 5 MB
  ├─ Must be valid UTF-8 text
  └─ Warn if file contains __PLACEHOLDER__ tokens (legacy AHK format)
    │
    ▼
Compute SHA-256 hash
    │
    ├─ Hash matches existing script → "Script already exists. Replace?"
    │
    └─ New script
         │
         ▼
    Analyze metadata (IIFE detection, chrome API usage, DOM usage)
         │
         ▼
    Store in chrome.storage.local under 'marco_scripts'
         │
         ▼
    Show in script list with metadata badges
```

### Folder Watch Flow

> **⚠️ R-10 RESOLUTION**: `showDirectoryPicker()` does NOT persist permissions across browser restarts. It is available as an **optional enhancement only**. The **primary method is always file upload** (drag-and-drop or `<input type="file" multiple>`).

#### Primary: Multi-File Upload (Always Available)

```
User clicks [+ Add Scripts] or drags .js files onto drop zone
    │
    ▼
<input type="file" multiple accept=".js,.mjs"> opens native file picker
    │
    ▼
User selects one or more files → FileReader reads each
    │
    ▼
For each file:
  ├─ Hash check against stored scripts
  ├─ New or changed → store in chrome.storage.local
  └─ Duplicate hash → "Script already exists. Replace?"
    │
    ▼
Show uploaded scripts in list with metadata badges
```

#### Optional Enhancement: Directory Picker (May Not Persist)

```
User clicks [📂 Set Script Folder] in Options
    │
    ▼
Check: if (typeof window.showDirectoryPicker === 'function')
  ├─ NOT available → show tooltip: "Folder watching not supported. Use file upload."
  │
  └─ Available → showDirectoryPicker() (requires user gesture)
       │
       ▼
  Read all .js files from directory
       │
       ▼
  For each file:
    ├─ Hash check against stored scripts
    ├─ New or changed → update store
    └─ Deleted from folder → mark as "stale" (don't auto-delete)
       │
       ▼
  Display folder name + file count
       │
       ▼
  ⚠️ Show warning banner:
  "Folder access may expire after browser restart. Re-grant or use file upload."
```

> **Implementation note**: When `showDirectoryPicker()` permission is lost (throws `NotAllowedError` on re-access), the UI should:
> 1. Show a yellow banner: "Folder access expired. [Re-grant] or [Upload files instead]"
> 2. Keep previously imported script copies in `chrome.storage.local` — they are NOT deleted when folder access is lost
> 3. The `[📂 Folder]` button should be hidden entirely if `showDirectoryPicker` is not available (Firefox, older Chrome)

### Script List UI (Options Page)

```
┌─────────────────────────────────────────────────────────────────┐
│  Scripts                                    [+ Add] [📂 Folder] │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 🔒 macro-looping.js                    builtin  │ [Edit] │   │
│  │    v7.18 | 1,247 lines | MAIN world | DOM ✓ chrome ✓     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 🔒 combo.js                            builtin  │ [Edit] │   │
│  │    v7.18 | 892 lines | MAIN world | DOM ✓ chrome ✗       │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 📄 custom-dashboard.js                 upload   │ [Edit] │   │
│  │    v1.0 | 145 lines | ISOLATED world | DOM ✓              │   │
│  │    Tags: dashboard, internal                    [🗑 Delete]│   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ── Folder: C:\Scripts\marco\ (3 files) ──          [🔄 Sync]  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 📁 helper-utils.js                     folder   │ [Edit] │   │
│  │    v1.0 | 67 lines | ISOLATED world                       │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Config Management

### Config Store Schema

```typescript
interface StoredConfig {
  id: string;              // UUID v4
  name: string;            // Display name
  fileName: string;        // Original file name
  source: 'upload' | 'folder' | 'builtin';
  folderPath: string | null;
  content: object;         // Parsed JSON object
  rawContent: string;      // Original JSON string (for re-export)
  size: number;            // Bytes
  hash: string;            // SHA-256
  uploadedAt: string;
  updatedAt: string;
  schema: string | null;   // JSON Schema URL if $schema field present
  validationErrors: string[];  // Empty if valid
}
```

### Config Upload Flow

```
User clicks [+ Add Config] or drags .json file
    │
    ▼
Validate:
  ├─ Extension must be .json
  ├─ Max size: 1 MB
  ├─ Must parse as valid JSON
  ├─ If $schema field → validate against schema
  └─ Warn on __PLACEHOLDER__ tokens
    │
    ▼
Store in chrome.storage.local under 'marco_configs'
    │
    ▼
Show in config list
```

### Config Validation Rules

| Rule | Check | Action on Fail |
|------|-------|----------------|
| Valid JSON | `JSON.parse()` succeeds | Reject with parse error + line number |
| Max size | ≤ 1 MB | Reject with size message |
| Schema validation | If `$schema` present, validate | Warning (non-blocking) |
| No circular refs | JSON.stringify roundtrip | Reject |
| Placeholder check | No `__PLACEHOLDER__` patterns | Warning: "Legacy AHK format detected" |

### Default Config Behavior

When a script runs without a bound config:

1. Check if the script's parent URL rule has a config → use it
2. Check if the parent project has a `defaultConfig` → use it  
3. Check if the bundled `config.json` has relevant sections → use those
4. If none → script runs with no config (it must handle `undefined` config gracefully)

---

## Script ↔ Config Binding UI

In the URL Rule editor (Options → Projects → Edit Rule):

```
┌──────────────────────────────────────────────────────────┐
│  Scripts for this rule                         [+ Add]   │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. macro-looping.js                                 │  │
│  │    World: [▾ MAIN]  Run At: [▾ document_idle]       │  │
│  │    Config: [▾ lovable-config.json      ] [⊘ None]   │  │
│  │    Injection: [▾ Global variable]                    │  │
│  │    Global name: [__marcoConfig          ]            │  │
│  │                                           [↑] [↓] [×]│  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 2. combo.js                                         │  │
│  │    World: [▾ MAIN]  Run At: [▾ document_idle]       │  │
│  │    Config: [▾ (use project default)    ]             │  │
│  │                                           [↑] [↓] [×]│  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- `[↑] [↓]` reorder injection sequence
- `[×]` removes binding (not the script itself)
- Config dropdown lists all configs in the store + "(use project default)" + "(none)"

---

## Drag & Drop

All file inputs (scripts and configs) support drag-and-drop:

```
┌──────────────────────────────────────────────┐
│                                               │
│   📂 Drop .js or .json files here             │
│   or click to browse                          │
│                                               │
│   Accepted: .js, .mjs, .json                  │
│   Max: 5 MB per file, 20 files at once        │
│                                               │
└──────────────────────────────────────────────┘
```

- Drop zone highlights on dragover (cyan border, subtle glow)
- Multiple files accepted at once
- `.js` files → script store; `.json` files → config store
- Progress indicator for each file
- Toast on completion: "Added 3 scripts, 1 config"

---

## Carrying Forward AHK Lessons

| AHK Pattern | Chrome Extension Equivalent |
|-------------|----------------------------|
| `config.ini` with `__PLACEHOLDER__` tokens replaced by AHK | JSON config injected via global variable or message passing — no placeholder substitution needed |
| AHK `BuildComboJS()` compiles JS at injection time | Extension injects raw JS + separate config object — no compilation step |
| Single config file for everything | Multiple configs per project, per rule, or per script |
| XPaths hardcoded in config.ini | XPaths stored in config JSON, testable via Options page [🔍 Test] button |

---

## Error Handling for User Scripts

> **⚠️ SUPERSEDED**: The `window.addEventListener('error')` approach previously documented here has been replaced. See `20-user-script-error-isolation.md` for the canonical error capture strategy using try/catch wrappers at injection time.
>
> Key points from the new approach:
> 1. Every user script is wrapped in try/catch **before injection** by `error-wrapper.ts`
> 2. Errors are tagged with `scriptId`, `projectId`, `configId`, `urlRuleId`
> 3. Errors are routed to background via `USER_SCRIPT_ERROR` message
> 4. Works in both ISOLATED and MAIN worlds
> 5. A failing script does NOT crash other scripts — each is injected independently
